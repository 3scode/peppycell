-- 202611070007_seed_reference.sql
-- Referensi global; aman dijalankan ulang.
insert into public.payout_settings
  (id, retained_pct, admin_pct, investor_pct, employee_pct)
values (1, 20, 40, 30, 10)
on conflict (id) do nothing;
