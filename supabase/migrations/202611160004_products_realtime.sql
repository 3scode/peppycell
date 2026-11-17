-- 202611160004_products_realtime.sql
-- Halaman catat penjualan ikut memperbarui produk/harga tanpa reload.
-- Tambahkan tabel produk ke publication realtime Supabase (idempoten).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'product_prices'
    ) then
      alter publication supabase_realtime add table public.product_prices;
    end if;
  end if;
end $$;
