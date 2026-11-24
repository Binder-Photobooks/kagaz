// scripts/prerender.mjs
//
// Generates one static HTML file per public page (photobooks.html, pricing.html, …) from
// index.html, so every URL in the sitemap is served with its OWN title, description,
// canonical, Open Graph tags, structured data and visible section — instead of every URL
// receiving the homepage's HTML and relying on JavaScript to fix it afterwards.
//
// Also writes:
//   app.html     — the shell the server returns for dynamic URLs (/store/<slug>, /journal/<slug>,
//                  /admin, /editor/…). It has no canonical tag, so it never tells Google that
//                  a product or post "is really the homepage"; script.js adds the right one.
//   sitemap.xml  — the fixed pages below plus every store product and journal post (from Supabase).
//
// Page titles/descriptions are read from SEO_META and START_SEO in script.js, and start-page
// copy from CONTENT_DEFAULTS — so there is still exactly one place to edit each of them.
//
// Run after ANY change to index.html, or to SEO_META / START_SEO / CONTENT_DEFAULTS in
// script.js, then deploy as usual:
//     node scripts/prerender.mjs
// No dependencies; Node 18+.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.binder.co.in';
const DEFAULT_OG_IMAGE = SITE + '/images/img-hero.jpg';

// path, view id (or start-page key), sitemap changefreq, priority, og image
const PAGES = [
  { path: '/',            view: 'home',        freq: 'weekly',  pri: '1.0' },
  { path: '/photobooks',  start: 'photobook',  freq: 'monthly', pri: '0.9', label: 'Photobooks' },
  { path: '/trade-books', start: 'tradebook',  freq: 'monthly', pri: '0.9', label: 'Trade Books', img: '/images/img-3.jpg' },
  { path: '/art-prints',  start: 'artprints',  freq: 'monthly', pri: '0.9', label: 'Art Prints', img: '/images/img-5.jpg' },
  { path: '/zines',       start: 'zine',       freq: 'monthly', pri: '0.9', label: 'Zines' },
  { path: '/pricing',     view: 'pricing',     freq: 'monthly', pri: '0.9', label: 'Pricing' },
  { path: '/scanning',    view: 'scanning',    freq: 'monthly', pri: '0.8', label: 'Scanning Services' },
  { path: '/photography', view: 'photography', freq: 'monthly', pri: '0.8', label: 'Photography Services' },
  { path: '/store',       view: 'store',       freq: 'weekly',  pri: '0.8', label: 'Store' },
  { path: '/journal',     view: 'journal',     freq: 'weekly',  pri: '0.7', label: 'Kagaz Journal' },
  { path: '/isbn',        view: 'isbn',        freq: 'monthly', pri: '0.7', label: 'Free ISBN', img: '/images/img-6.jpg' },
  { path: '/publish',     view: 'publish',     freq: 'monthly', pri: '0.7', label: 'Publish with us' },
  { path: '/gallery',     view: 'gallery',     freq: 'monthly', pri: '0.6', label: 'Gallery' },
  { path: '/templates',   view: 'templates',   freq: 'monthly', pri: '0.6', label: 'Templates' },
  { path: '/clients',     view: 'clients',     freq: 'monthly', pri: '0.5', label: 'Clients' },
  { path: '/contact',     view: 'contact',     freq: 'yearly',  pri: '0.5', label: 'Contact' },
  { path: '/sitemap',     view: 'sitemap',     freq: 'monthly', pri: '0.3', label: 'Sitemap' },
  // Landing page + guides (Oct 2026)
  { path: '/wedding-photobooks', view: 'wedding-photobooks', freq: 'monthly', pri: '0.9', label: 'Wedding Photobooks', img: '/images/img-4.jpg' },
  { path: '/guides',      view: 'guides',      freq: 'monthly', pri: '0.6', label: 'Guides' },
  { path: '/wedding-photobook-pages',       view: 'wedding-photobook-pages',       freq: 'monthly', pri: '0.6', label: 'Wedding photobook pages', guide: '2026-10-25', img: '/images/img-4.jpg' },
  { path: '/layflat-vs-regular-photobooks', view: 'layflat-vs-regular-photobooks', freq: 'monthly', pri: '0.6', label: 'Layflat vs regular binding', guide: '2026-10-25', img: '/images/img-4.jpg' },
  { path: '/how-to-digitise-old-photos',    view: 'how-to-digitise-old-photos',    freq: 'monthly', pri: '0.6', label: 'Digitising old photos', guide: '2026-10-25' },
];

// ---------- read shared config out of script.js ----------
const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
function extractObject(name, open = '{') {
  const close = open === '{' ? '}' : ']';
  const m = js.match(new RegExp(name.replace(/ /g, '\\s+') + '\\s*=\\s*\\' + open));
  if (!m) throw new Error(`prerender: could not find "${name}=${open}" in script.js`);
  let i = m.index + m[0].length - 1, depth = 0, quote = null;
  for (let j = i; j < js.length; j++) {
    const c = js[j];
    if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return new Function('return ' + js.slice(i, j + 1))();
  }
  throw new Error(`prerender: unbalanced brackets reading ${name}`);
}
const SEO_META = extractObject('const SEO_META');
const START_SEO = extractObject('const START_SEO');
const CONTENT = extractObject('const CONTENT_DEFAULTS');
const FAQ_DEFAULTS = extractObject('const FAQ_DEFAULTS', '[');

// ---------- live content from Supabase (store products, journal posts, FAQ) ----------
// Read once, up front, from the same public `cms` rows the site itself reads. If Supabase can't be
// reached, the build still works: built-in defaults are used and a warning is printed.
let CMS = null;
try {
  const sUrl = js.match(/const SUPABASE_URL='([^']+)'/)?.[1];
  const sKey = js.match(/const SUPABASE_KEY='([^']+)'/)?.[1];
  if (!sUrl || !sKey) throw new Error('SUPABASE_URL / SUPABASE_KEY not found in script.js');
  const res = await fetch(`${sUrl}/rest/v1/cms?select=key,value,updated_at&key=in.(catalog,posts,faq,site_cfg)`, { headers: { apikey: sKey }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Supabase responded ' + res.status);
  CMS = await res.json();
} catch (e) {
  // Offline fallback: CMS_SNAPSHOT=path/to/rows.json (same shape as the Supabase response).
  if (process.env.CMS_SNAPSHOT) { CMS = JSON.parse(fs.readFileSync(process.env.CMS_SNAPSHOT, 'utf8')); console.log('prerender: Supabase unreachable — using CMS snapshot ' + process.env.CMS_SNAPSHOT); }
  else console.warn('prerender: WARNING — could not reach Supabase (' + (e.message || e) + '). Using the built-in FAQ, and sitemap.xml will list the fixed pages only. Re-run when online.');
}
const cmsRow = k => (CMS || []).find(r => r.key === k) || {};
const faqLive = cmsRow('faq').value;
const FAQ = (Array.isArray(faqLive) && faqLive.length ? faqLive : FAQ_DEFAULTS).filter(f => f && f.q && f.a);
const START_H1 = { photobook: 'Custom Photobook Printing', tradebook: 'Trade Book Printing & Self-Publishing', artprints: 'Archival Art Prints', zine: 'Zine Printing' };
const START_KEYS = { photobook: 'Photobook', tradebook: 'Tradebook', artprints: 'Artprints', zine: 'Zine' };
const START_PRICE = { photobook: '2200', tradebook: '1000', artprints: '800', zine: '200' }; // zine: keep in step with PRICING_RULES.zine

// ---------- helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function setAttr(html, selectorRe, attr, value) {
  const m = html.match(selectorRe);
  if (!m) throw new Error('prerender: tag not found: ' + selectorRe);
  const tag = m[0];
  const next = tag.replace(new RegExp(attr + '="[^"]*"'), `${attr}="${esc(value)}"`);
  return html.replace(tag, next);
}
function setHead(html, { title, desc, url, image, ld }) {
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = setAttr(html, /<meta name="description"[^>]*>/, 'content', desc);
  html = setAttr(html, /<link rel="canonical"[^>]*>/, 'href', url);
  html = setAttr(html, /<meta property="og:title"[^>]*>/, 'content', title);
  html = setAttr(html, /<meta property="og:description"[^>]*>/, 'content', desc);
  html = setAttr(html, /<meta property="og:url"[^>]*>/, 'content', url);
  html = setAttr(html, /<meta property="og:image"[^>]*>/, 'content', image);
  html = setAttr(html, /<meta name="twitter:title"[^>]*>/, 'content', title);
  html = setAttr(html, /<meta name="twitter:description"[^>]*>/, 'content', desc);
  html = setAttr(html, /<meta name="twitter:image"[^>]*>/, 'content', image);
  const ldTag = '<script type="application/ld+json" id="ldPage"></script>';
  if (!html.includes(ldTag)) throw new Error('prerender: empty #ldPage script tag not found in index.html');
  if (ld) html = html.replace(ldTag, `<script type="application/ld+json" id="ldPage">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return html;
}
// Homepage hero image: high priority on "/" only. On every other page it sits in a hidden section,
// so make it lazy there and the browser never downloads it.
const HERO_EAGER = 'id="heroImage" src="/images/img-hero.jpg" alt="Binder photobooks, trade books, and art prints" loading="eager" fetchpriority="high"';
const heroLazy = html => html.replace(HERO_EAGER, 'id="heroImage" src="/images/img-hero.jpg" alt="Binder photobooks, trade books, and art prints" loading="lazy" decoding="async"');
function setActiveView(html, viewId) {
  html = heroLazy(html);
  html = html.replace('<section class="view active" id="view-home">', '<section class="view" id="view-home">');
  const tag = `<section class="view" id="view-${viewId}">`;
  if (!html.includes(tag)) throw new Error('prerender: view not found: ' + viewId);
  return html.replace(tag, `<section class="view active" id="view-${viewId}">`);
}
const breadcrumb = (label, url) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: label, item: url },
  ],
});
// Static version of the start page, shown to crawlers and before script.js runs; renderStartPage()
// in script.js replaces it with the live (admin-editable) version on load.
function startPageHtml(key) {
  const k = START_KEYS[key];
  const need = (CONTENT[`start${k}Need`] || '').split('\n').map(s => s.trim()).filter(Boolean);
  const steps = (CONTENT[`start${k}Steps`] || '').split('\n').map(s => s.trim()).filter(Boolean)
    .map(l => { const i = l.indexOf('|'); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  return `
    <span class="tag">Start creating</span>
    <h1>${esc(START_H1[key])}</h1>
    <p class="lead">${esc(CONTENT[`start${k}Intro`] || START_SEO[key].desc)}</p>
    ${need.length ? `<h2 style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">What you'll need before you start</h2>
    <ul>${need.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${steps.length ? `<h2 style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">How it works</h2>
    <ol>${steps.map(([t, d]) => `<li><strong>${esc(t)}</strong> — ${esc(d)}</li>`).join('')}</ol>` : ''}
    <p><a href="/pricing">See full pricing →</a></p>`;
}

// FAQ, rendered into the HTML so search engines (and visitors before script.js loads) see the
// questions and answers. Same markup as renderFaq() in script.js, which re-renders it on load.
const FAQ_ARROW = '<svg class="faq-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const faqListHtml = items => '<div class="faq-list" id="faqList">' + items.map((f, i) => `
        <div class="faq-item"><button class="faq-q" onclick="toggleFaq(${i},this)" aria-expanded="false"><span>${esc(f.q)}</span>${FAQ_ARROW}</button><div class="faq-a" hidden><p>${esc(f.a)}</p></div></div>`).join('') + '\n      </div><!--/faqList-->';
const FAQ_LIST_RE = /<div class="faq-list" id="faqList">(?:<!-- populated by renderFaq\(\) --><\/div>|[\s\S]*?<\/div><!--\/faqList-->)/;
const faqLd = items => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
const LD_FAQ_RE = /\s*<script type="application\/ld\+json" id="ldFaq">[\s\S]*?<\/script>/;
const LD_PAGE_TAG = '<script type="application/ld+json" id="ldPage"></script>';
// Extra structured data for individual pages (beyond the breadcrumb).
// Plain text of an HTML fragment (for headlines / FAQ text in structured data).
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const sectionOf = (html, view) => {
  const start = html.indexOf(`<section class="view" id="view-${view}">`);
  if (start < 0) throw new Error('prerender: view not found: ' + view);
  return html.slice(start, html.indexOf('</section>', start));
};
// Questions shown on a page inside <div class="seo-faq">: <h3>question</h3><p>answer</p> pairs.
const visibleFaq = sec => {
  const box = sec.match(/<div class="seo-faq">([\s\S]*?)<\/div>/); if (!box) return [];
  return [...box[1].matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(m => ({ q: strip(m[1]), a: strip(m[2]) }));
};
const EXTRA_LD = {
  'wedding-photobooks': (url, sec) => [
    { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Wedding photobook printing', name: 'Binder Wedding Photobooks',
      provider: { '@id': SITE + '/#business' }, url, areaServed: ['Delhi', 'India'], description: SEO_META['wedding-photobooks']?.desc,
      offers: [['8.5″ × 8.5″ hardcover, 20 pages', '2200'], ['12″ × 12″, 20 pages', '4200'], ['12″ × 18″, 20 pages', '6300']]
        .map(([name, price]) => ({ '@type': 'Offer', name, price, priceCurrency: 'INR', url })) },
    faqLd(visibleFaq(sec)),
  ],
  scanning: (url) => ({
    '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Photo, negative and document scanning',
    name: 'Binder Scanning Services', provider: { '@id': SITE + '/#business' }, url,
    description: SEO_META.scanning?.desc,
    areaServed: ['Delhi', 'Gurugram', 'Noida', 'Faridabad', 'Ghaziabad'].map(name => ({ '@type': 'City', name })),
    offers: { '@type': 'Offer', priceCurrency: 'INR', priceSpecification: { '@type': 'UnitPriceSpecification', price: '15', priceCurrency: 'INR', unitText: 'MB' }, url },
  }),
};

// ---------- build ----------
let template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Social profiles from Admin → Content go into the business schema as plain HTML too (the site's
// script also adds them in the browser, but AI crawlers such as ChatGPT's don't run scripts).
{
  const cfg = cmsRow('site_cfg').value || {};
  const same = [cfg.instagram, cfg.facebook, cfg.twitter, cfg.youtube, cfg.linkedin, cfg.googleBusiness]
    .filter(u => typeof u === 'string' && /^https:\/\//.test(u.trim())).map(u => u.trim());
  template = template.replace(/("sameAs": )\[[^\]]*\]/, '$1' + JSON.stringify(same));
}
if (!FAQ_LIST_RE.test(template)) throw new Error('prerender: #faqList not found in index.html');
{
  const before = template;
  template = template.replace(FAQ_LIST_RE, () => faqListHtml(FAQ));
  const ldFaqTag = `<script type="application/ld+json" id="ldFaq">${JSON.stringify(faqLd(FAQ)).replace(/</g, '\\u003c')}</script>`;
  template = LD_FAQ_RE.test(template) ? template.replace(LD_FAQ_RE, () => '\n' + ldFaqTag) : template.replace(LD_PAGE_TAG, () => LD_PAGE_TAG + '\n' + ldFaqTag);
  if (template !== before) { fs.writeFileSync(path.join(ROOT, 'index.html'), template); console.log(`prerender: index.html updated with ${FAQ.length} FAQ items`); }
}
// The FAQ schema belongs to the homepage only (that's where the FAQ is shown).
const withoutFaqLd = html => html.replace(LD_FAQ_RE, '');
if (!template.includes('<section class="view active" id="view-home">')) throw new Error('prerender: index.html must have view-home active');
if (!template.includes(HERO_EAGER)) console.warn('prerender: WARNING — homepage hero <img> markup changed; update HERO_EAGER in this script.');
const written = [];

for (const page of PAGES) {
  if (page.path === '/') continue; // index.html is itself the homepage
  const url = SITE + page.path;
  const image = page.img ? SITE + page.img : DEFAULT_OG_IMAGE;
  let html = template, meta, ld;
  if (page.start) {
    meta = START_SEO[page.start];
    const service = {
      '@context': 'https://schema.org', '@type': 'Service', serviceType: START_H1[page.start],
      provider: { '@id': SITE + '/#business' }, areaServed: ['Delhi', 'India'], description: meta.desc,
      offers: { '@type': 'Offer', priceCurrency: 'INR', price: START_PRICE[page.start], url },
    };
    ld = [service, breadcrumb(page.label, url)];
    html = setActiveView(html, 'start');
    html = html.replace('<div class="page-wrap" id="startPageContent"></div>', `<div class="page-wrap" id="startPageContent">${startPageHtml(page.start)}</div>`);
  } else {
    meta = SEO_META[page.view];
    if (!meta) throw new Error('prerender: no SEO_META entry for ' + page.view);
    const sec = sectionOf(template, page.view);
    let extra = EXTRA_LD[page.view] ? EXTRA_LD[page.view](url, sec) : null;
    if (page.guide) {
      const headline = strip(sec.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
      extra = { '@context': 'https://schema.org', '@type': 'Article', headline, description: meta.desc,
        image: image, datePublished: page.guide, dateModified: page.guide, url,
        author: { '@type': 'Organization', name: 'Binder', url: SITE + '/' },
        publisher: { '@type': 'Organization', name: 'Binder', logo: { '@type': 'ImageObject', url: SITE + '/images/logo.png' } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url } };
      ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + '/guides' },
        { '@type': 'ListItem', position: 3, name: headline, item: url } ] };
    } else ld = breadcrumb(page.label, url);
    // Page-specific structured data goes in its own #ldStatic block, which script.js never
    // rewrites (it only manages #ldPage), so it stays in the rendered page Google sees.
    if (extra) html = html.replace(LD_PAGE_TAG, () => LD_PAGE_TAG + `\n<script type="application/ld+json" id="ldStatic">${JSON.stringify(extra).replace(/</g, '\\u003c')}</script>`);
    html = setActiveView(html, page.view);
  }
  html = withoutFaqLd(setHead(html, { title: meta.title, desc: meta.desc, url, image, ld }));
  const file = page.path.slice(1) + '.html';
  fs.writeFileSync(path.join(ROOT, file), html);
  written.push(file);
}

// ---------- Store product pages ----------
// One pre-built page per product at store-pages/<slug>.html, served at /store/<slug> by .htaccess.
// Search engines and link previews (WhatsApp, Facebook) get the product's own title, description,
// image, price and Product schema without running JavaScript; script.js then takes over as usual.
// Titles/descriptions come from the product's SEO fields (Admin → Store → Edit product), with the
// same automatic fallbacks as productSeoTitle()/productSeoDesc() in script.js.
const inr = paise => '₹' + (paise / 100).toLocaleString('en-IN');
const seoTitle = p => (p.seoTitle || '').trim() || (p.name + ' | Binder Store');
const seoDesc = p => {
  const own = (p.seoDesc || '').trim(); if (own) return own;
  const base = (p.blurb || p.details || '').replace(/\s+/g, ' ').trim();
  return (base ? base.slice(0, 120) + (base.length > 120 ? '…' : '') + ' ' : '') + 'From Binder, Delhi. ' + inr(p.price) + '.';
};
const STORE_DIR = path.join(ROOT, 'store-pages');
const catalogForPages = (() => { const v = (typeof cmsRow === 'function' ? cmsRow('catalog').value : null); return Array.isArray(v) ? v : null; })();
if (catalogForPages) {
  fs.rmSync(STORE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STORE_DIR, { recursive: true });
  let made = 0;
  for (const p of catalogForPages) {
    if (!p || !p.slug || !p.name || !p.price) continue;
    const url = `${SITE}/store/${encodeURIComponent(p.slug)}`;
    const img = (p.img && !String(p.img).startsWith('data:')) ? p.img : DEFAULT_OG_IMAGE;
    const gallery = [img, ...(Array.isArray(p.images) ? p.images : [])].filter(u => typeof u === 'string' && /^https?:/.test(u) && !/\.(mp4|webm|mov)(\?|$)/i.test(u));
    const product = {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: gallery.length ? gallery : [DEFAULT_OG_IMAGE],
      description: seoDesc(p), sku: p.id, brand: { '@type': 'Brand', name: 'Binder' }, category: p.category || undefined,
      offers: { '@type': 'Offer', url, priceCurrency: 'INR', price: (p.price / 100).toString(), availability: 'https://schema.org/InStock',
        seller: { '@id': SITE + '/#business' } },
    };
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Store', item: SITE + '/store' },
      { '@type': 'ListItem', position: 3, name: p.name, item: url } ] };
    let html = setHead(template, { title: seoTitle(p), desc: seoDesc(p), url, image: img, ld: [product, crumbs] });
    html = withoutFaqLd(setActiveView(html, 'store'));
    html = html.replace(/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="product">');
    // Fill the product panel that script.js opens for /store/<slug>, so the page is complete without JS.
    const fill = (re, rep) => { if (!re.test(html)) throw new Error('prerender: product panel markup changed: ' + re); html = html.replace(re, rep); };
    fill(/<div class="modal-bg" id="productDetailModal"/, '<div class="modal-bg show" id="productDetailModal"');
    fill(/<div id="pdImg"><\/div>/, `<div id="pdImg"><img src="${esc(img)}" alt="${esc(p.name)}" style="width:100%;border-radius:10px;display:block"></div>`);
    if (p.badge) fill(/<span id="pdBadge" class="tag" style="margin-top:14px;display:none"><\/span>/, `<span id="pdBadge" class="tag" style="margin-top:14px;display:inline-block">${esc(p.badge)}</span>`);
    fill(/<h3 id="pdName" style="margin-top:10px">Product<\/h3>/, `<h1 id="pdName" style="margin-top:10px;font-size:22px">${esc(p.name)}</h1>`);
    fill(/<p id="pdBlurb"([^>]*)><\/p>/, `<p id="pdBlurb"$1>${esc(p.blurb || '')}</p>`);
    fill(/<p id="pdDetails"([^>]*)><\/p>/, `<p id="pdDetails"$1>${esc(p.details || '').replace(/\n/g, '<br>')}</p>`);
    fill(/<b id="pdPrice" style="font-size:19px"><\/b>/, `<b id="pdPrice" style="font-size:19px">${inr(p.price)}</b>`);
    fill(/<button id="pdAddBtn" class="btn btn-accent" onclick="">/, `<button id="pdAddBtn" class="btn btn-accent" onclick="closeProductDetail();addToCart('${esc(p.id)}')">`);
    fs.writeFileSync(path.join(STORE_DIR, p.slug + '.html'), html);
    made++;
  }
  written.push(`store-pages/ (${made} products)`);
} else {
  console.warn('prerender: WARNING — store catalog not available; product pages not rebuilt (existing store-pages/ left as is).');
}

// App shell for dynamic routes (/store/<slug>, /journal/<slug>, /admin, /editor/…) — served by
// .htaccess rule 5. No canonical, no og:url; script.js sets both per page.
let app = withoutFaqLd(heroLazy(template)).replace(/\s*<link rel="canonical"[^>]*>/, '').replace(/\s*<meta property="og:url"[^>]*>/, '');
fs.writeFileSync(path.join(ROOT, 'app.html'), app);
written.push('app.html');

// Sitemap: the fixed pages above, plus every Store product and Kagaz Journal post, read live
// from Supabase (the same public `cms` rows the site itself reads). If Supabase can't be reached,
// the fixed pages are still written and a warning is printed — re-run when you're online.
const today = new Date().toISOString().slice(0, 10);
const day = v => { const d = new Date(v || ''); return isNaN(d) ? today : d.toISOString().slice(0, 10); };
const urls = PAGES.map(p => [SITE + p.path, today, p.freq, p.pri]);
if (CMS) {
  const catalog = cmsRow('catalog'), posts = cmsRow('posts');
  for (const p of Array.isArray(catalog.value) ? catalog.value : []) {
    const slug = p?.slug || p?.id; if (slug) urls.push([`${SITE}/store/${encodeURIComponent(slug)}`, day(catalog.updated_at), 'weekly', '0.7']);
  }
  for (const p of Array.isArray(posts.value) ? posts.value : []) {
    const slug = p?.slug || p?.id; if (slug) urls.push([`${SITE}/journal/${encodeURIComponent(slug)}`, day(p.updatedISO || p.updated || p.dateISO || p.date), 'monthly', '0.6']);
  }
  console.log(`prerender: sitemap includes ${urls.length - PAGES.length} store products / journal posts`);
}
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, mod, f, pr]) => `  <url><loc>${xmlEsc(loc)}</loc><lastmod>${mod}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
written.push('sitemap.xml');

console.log('prerender: wrote ' + written.join(', '));
