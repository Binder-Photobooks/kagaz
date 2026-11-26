-- Security lockdown applied to the live project on 27 Nov 2026 (migrations
-- security_lockdown_access_rules, security_fix_profiles_guard, security_server_side_payment_verification,
-- create_photos_bucket). Kept here so the backend can be rebuilt. Safe to re-run.

-- 1. Only an existing admin can grant or remove admin rights.
create or replace function public.profiles_guard_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon','authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then new.is_admin := false;
    else new.is_admin := old.is_admin; new.id := old.id; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin before insert or update on public.profiles
for each row execute function public.profiles_guard_admin();
revoke execute on function public.profiles_guard_admin() from public, anon, authenticated;

-- 2. Orders: admins all; signed-in customers place and read their own.
drop policy if exists "service role full access" on public.orders;
drop policy if exists "customers read own orders" on public.orders;
drop policy if exists "orders: admins all" on public.orders;
drop policy if exists "orders: customers read own" on public.orders;
drop policy if exists "orders: customers place own" on public.orders;
create policy "orders: admins all" on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "orders: customers read own" on public.orders for select to authenticated
  using (lower(customer_email) = lower(auth.jwt() ->> 'email'));
create policy "orders: customers place own" on public.orders for insert to authenticated
  with check (lower(customer_email) = lower(auth.jwt() ->> 'email')
              and (customer_id is null or customer_id = auth.uid()));

-- 3. Payments recorded by verify-razorpay-payment (service role only).
create table if not exists public.payment_verifications (
  payment_id text primary key, razorpay_order_id text not null, amount_paise bigint not null,
  currency text not null default 'INR', verified_at timestamptz not null default now());
alter table public.payment_verifications enable row level security;
revoke all on public.payment_verifications from anon, authenticated;

create or replace function public.orders_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon','authenticated') and not public.is_admin() then
    if new.id !~ '^BDR-[A-Z0-9-]{4,24}$' then
      raise exception 'Invalid order number' using errcode = '22023';
    end if;
    if coalesce(new.payment_id, '') like 'HOUSE-%' then
      raise exception 'Orders without payment can only be placed by Binder' using errcode = '42501';
    end if;
    new.verified := exists (
        select 1 from public.payment_verifications pv
        where pv.payment_id = new.payment_id
          and pv.razorpay_order_id = coalesce(new.razorpay_order_id, '')
          and pv.amount_paise >= round(coalesce(new.amount, 0) * 100))
      and not exists (select 1 from public.orders o where o.payment_id = new.payment_id);
    new.status := 'Received'; new.render_status := 'pending'; new.render_error := null;
    new.pdf_files := '{}'::jsonb; new.edit_history := null;
  end if;
  return new;
end $$;
revoke execute on function public.orders_guard_insert() from public, anon, authenticated;
drop trigger if exists orders_guard_insert on public.orders;
create trigger orders_guard_insert before insert on public.orders
for each row execute function public.orders_guard_insert();

-- 4. Site images: public read, admin-only writes.
drop policy if exists "cms-images admin upload" on storage.objects;
drop policy if exists "cms-images admin update" on storage.objects;
drop policy if exists "cms-images admin delete" on storage.objects;
create policy "cms-images admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'cms-images' and public.is_admin());
create policy "cms-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'cms-images' and public.is_admin()) with check (bucket_id = 'cms-images' and public.is_admin());
create policy "cms-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cms-images' and public.is_admin());

-- 5. Coupons for signed-in customers only; housekeeping.
revoke execute on function public.validate_coupon(text) from public, anon;
revoke execute on function public.redeem_coupon(text) from public, anon;
grant execute on function public.validate_coupon(text) to authenticated;
grant execute on function public.redeem_coupon(text) to authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = public;
