-- 202611120003_lookups.sql
-- Lookup nama untuk transaksi lintas role tanpa membuka kolom sensitif.
create or replace function public.wallet_lookup()
returns table (id uuid, nama text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select w.id, w.nama_wallet::text
  from public.wallets w
  where w.deleted_at is null;
$$;

create or replace function public.product_lookup()
returns table (id uuid, nama text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nama_produk::text from public.products p;
$$;

revoke execute on function public.wallet_lookup() from public, anon;
revoke execute on function public.product_lookup() from public, anon;
grant execute on function public.wallet_lookup() to authenticated;
grant execute on function public.product_lookup() to authenticated;
