-- seed.sql — dijalankan `supabase db reset` setelah migration.
-- Akun auth & data demo dibuat oleh `bun run seed:admin` / `bun run seed:demo`
-- karena membutuhkan service role key dan Supabase Admin API.
insert into public.payout_settings
  (id, retained_pct, admin_pct, investor_pct, employee_pct)
values (1, 20, 40, 30, 10)
on conflict (id) do nothing;

-- Katalog contoh (opsional). Aman dijalankan ulang berkat unique lower(nama_produk).
insert into public.products (nama_produk, operator, harga_jual)
values
  ('Telkomsel 5GB', 'Telkomsel', 55000),
  ('Telkomsel 10GB', 'Telkomsel', 85000),
  ('Indosat 5GB', 'Indosat', 50000),
  ('Indosat 10GB', 'Indosat', 80000),
  ('XL 5GB', 'XL', 48000),
  ('XL 10GB', 'XL', 78000),
  ('Tri 5GB', 'Tri', 45000),
  ('Tri 10GB', 'Tri', 72000),
  ('Smartfren 5GB', 'Smartfren', 40000),
  ('Smartfren 10GB', 'Smartfren', 65000)
on conflict ((lower(nama_produk))) do nothing;

insert into public.product_costs (product_id, harga_beli)
select p.id,
       case p.nama_produk
         when 'Telkomsel 5GB' then 48000
         when 'Telkomsel 10GB' then 76000
         when 'Indosat 5GB' then 44000
         when 'Indosat 10GB' then 71000
         when 'XL 5GB' then 42000
         when 'XL 10GB' then 69000
         when 'Tri 5GB' then 39000
         when 'Tri 10GB' then 64000
         when 'Smartfren 5GB' then 35000
         when 'Smartfren 10GB' then 58000
       end
from public.products p
where p.nama_produk in (
  'Telkomsel 5GB', 'Telkomsel 10GB', 'Indosat 5GB', 'Indosat 10GB', 'XL 5GB',
  'XL 10GB', 'Tri 5GB', 'Tri 10GB', 'Smartfren 5GB', 'Smartfren 10GB'
)
on conflict (product_id) do nothing;
