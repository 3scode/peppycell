-- 202611160005_transactions_realtime.sql
-- Daftar transaksi ikut auto-update saat ada transaksi/wallet/produk/user
-- yang berubah. Event DELETE dengan RLS butuh replica identity full agar
-- baris lama bisa dicek terhadap policy.

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for t in select unnest(array['transactions', 'wallets', 'users']) loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

alter table public.transactions replica identity full;
