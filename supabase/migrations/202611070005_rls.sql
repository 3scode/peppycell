-- 202611070005_rls.sql
-- Helper role: NULL untuk user nonaktif / tanpa sesi.
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_costs enable row level security;
alter table public.payout_settings enable row level security;
alter table public.payout_history enable row level security;
alter table public.payout_items enable row level security;
alter table public.wallet_adjustments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_batches enable row level security;

-- users: self read, admin all.
create policy users_select on public.users for select to authenticated
using (
  (id = auth.uid() and public.current_user_role() is not null)
  or public.is_admin()
);
create policy users_update_self on public.users for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());
create policy users_update_admin on public.users for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- products: karyawan hanya produk aktif; admin all.
create policy products_select on public.products for select to authenticated
using (
  public.is_admin()
  or (is_active = true and public.current_user_role() = 'karyawan')
);
create policy products_update_admin on public.products for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- product_costs & margin snapshot: admin only.
create policy product_costs_admin on public.product_costs for select to authenticated
using (public.is_admin());
create policy transaction_costs_admin on public.transaction_costs for select to authenticated
using (public.is_admin());

-- transactions: admin all; karyawan own today WIB; no direct write.
create policy transactions_select on public.transactions for select to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'karyawan'
    and user_id = auth.uid()
    and (tanggal at time zone 'Asia/Jakarta')::date
        = (now() at time zone 'Asia/Jakarta')::date
  )
);

-- Wallet, settings, payout, audit: admin only.
create policy wallets_admin on public.wallets for select to authenticated
using (public.is_admin());
create policy payout_settings_admin on public.payout_settings for select to authenticated
using (public.is_admin());
create policy payout_history_admin on public.payout_history for select to authenticated
using (public.is_admin());
create policy payout_items_admin on public.payout_items for select to authenticated
using (public.is_admin());
create policy wallet_adjustments_admin on public.wallet_adjustments for select to authenticated
using (public.is_admin());
create policy audit_logs_admin on public.audit_logs for select to authenticated
using (public.is_admin());
create policy import_batches_admin on public.import_batches for select to authenticated
using (public.is_admin());

-- Investor: hanya item deviden miliknya + header payout terkait.
create policy payout_items_investor on public.payout_items for select to authenticated
using (public.current_user_role() = 'investor' and user_id = auth.uid());
create policy payout_history_investor on public.payout_history for select to authenticated
using (
  public.current_user_role() = 'investor'
  and exists (
    select 1 from public.payout_items pi
    where pi.payout_id = payout_history.id and pi.user_id = auth.uid()
  )
);

-- Privilege: direct write hanya lewat RPC security definer.
revoke insert, delete on public.products from authenticated;
revoke insert, update, delete on public.transactions from authenticated;
revoke insert, update, delete on public.transaction_costs from authenticated;
revoke insert, update, delete on public.wallets from authenticated;
revoke insert, update, delete on public.payout_history from authenticated;
revoke insert, update, delete on public.payout_items from authenticated;
revoke insert, update, delete on public.product_costs from authenticated;
revoke insert, update, delete on public.payout_settings from authenticated;
revoke insert, update, delete on public.wallet_adjustments from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.import_batches from authenticated;
revoke insert, delete on public.users from authenticated;

grant select, update on public.users to authenticated;
grant select, update on public.products to authenticated;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
