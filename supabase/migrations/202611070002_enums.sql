-- 202611070002_enums.sql
create type public.user_role as enum ('admin', 'karyawan', 'investor');
create type public.wallet_type as enum ('cash', 'bank', 'digital');
create type public.transaction_type as enum ('income', 'expense', 'transfer', 'payout');
create type public.transaction_status as enum ('active', 'void');
create type public.payout_status as enum ('processing', 'completed', 'failed');
create type public.payout_category as enum (
  'admin_dividend',
  'investor_dividend',
  'employee_commission'
);
