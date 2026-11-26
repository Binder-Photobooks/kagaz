import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Verifies a Razorpay checkout signature and, when it is genuine, asks Razorpay for the payment
// itself and records it (payment id, order id, amount actually paid) in payment_verifications.
// The database then marks an order "verified" only if a recorded payment covers its amount, so the
// browser can no longer claim a payment that didn't happen or was for less.
// Deployed 27 Nov 2026 (version 3).
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json().catch(() => ({}));
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json(400, { error: 'Missing fields' });
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(RAZORPAY_KEY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${razorpay_order_id}|${razorpay_payment_id}`));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  let verified = computed === razorpay_signature;
  let amount_paise = null;
  if (verified) {
    try {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
        headers: { 'Authorization': 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`) }
      });
      const p = res.ok ? await res.json() : null;
      if (!p || p.order_id !== razorpay_order_id || !['authorized', 'captured'].includes(p.status)) {
        verified = false;
      } else {
        amount_paise = p.amount;
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/payment_verifications`, {
          method: 'POST',
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ payment_id: razorpay_payment_id, razorpay_order_id, amount_paise: p.amount, currency: p.currency || 'INR' })
        });
        if (!ins.ok) console.error('payment_verifications insert failed:', await ins.text());
      }
    } catch (e) {
      console.error('Razorpay payment lookup failed:', e);
      verified = false;
    }
  }
  return json(200, { verified, razorpay_payment_id, razorpay_order_id, amount_paise });
});
