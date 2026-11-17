-- 202611120002_wallet_soft_delete.sql
-- Wallet tidak bisa dihapus permanen karena direferensikan transaksi & payout.
alter table public.wallets
  add column if not exists deleted_at timestamptz;

create index if not exists wallets_active_idx
  on public.wallets (is_active, is_default)
  where deleted_at is null;

create or replace function public.wallet_defaults()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'has_active', exists (
      select 1 from public.wallets
      where is_active = true and deleted_at is null
    ),
    'default_label', coalesce(
      (select nama_wallet from public.wallets
        where is_default = true and is_active = true and deleted_at is null limit 1),
      (select nama_wallet from public.wallets
        where tipe = 'cash' and is_active = true and deleted_at is null limit 1),
      'Belum ada wallet aktif'
    )
  );
$$;

create or replace function public.delete_wallet(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
  v_next public.wallets;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_wallet from public.wallets
  where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND:wallet' using errcode = 'P0002';
  end if;

  update public.wallets set deleted_at = now(), is_active = false, is_default = false
  where id = p_id;

  if v_wallet.is_default then
    select * into v_next from public.wallets
    where id <> p_id and is_active = true and deleted_at is null
    order by (tipe = 'cash') desc, sort_order asc, created_at asc
    limit 1;
    if found then
      update public.wallets set is_default = true where id = v_next.id;
    end if;
  end if;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values
    ('wallets', p_id::text, 'delete', to_jsonb(v_wallet),
     jsonb_build_object('default_wallet_id', v_next.id), auth.uid());

  return jsonb_build_object(
    'deleted', true,
    'defaultWalletName', case when v_next.id is null then null else v_next.nama_wallet end
  );
end;
$$;

revoke execute on function public.wallet_defaults() from public, anon;
revoke execute on function public.delete_wallet(uuid) from public, anon;
grant execute on function public.wallet_defaults() to authenticated;
grant execute on function public.delete_wallet(uuid) to authenticated;
