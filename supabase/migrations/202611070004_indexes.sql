-- 202611070004_indexes.sql
create index transactions_tanggal_idx on public.transactions (tanggal desc);
create index transactions_tanggal_wib_idx
  on public.transactions (((tanggal at time zone 'Asia/Jakarta')::date));
create index transactions_user_tanggal_idx on public.transactions (user_id, tanggal desc);
create index transactions_wallet_tanggal_idx on public.transactions (wallet_id, tanggal desc);
create index transactions_payout_idx on public.transactions (payout_id);
create index transactions_status_active_idx on public.transactions (status) where status = 'active';
create index transactions_product_idx on public.transactions (product_id);
create index products_operator_idx on public.products (operator);
create index payout_history_status_idx on public.payout_history (status, start_date desc);
create index payout_items_payout_idx on public.payout_items (payout_id);
create index payout_items_user_idx on public.payout_items (user_id, created_at desc);
create index wallet_adjustments_wallet_idx on public.wallet_adjustments (wallet_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index users_role_active_idx on public.users (role, is_active);
