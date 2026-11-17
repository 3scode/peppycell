-- 202611120006_edit_transfer_wallets.sql
-- Izinkan aksi Edit mengubah wallet asal/tujuan transfer dengan koreksi saldo atomik.
create or replace function public.update_transaction(
  p_id uuid,
  p_tanggal date,
  p_keterangan text,
  p_product_id uuid,
  p_qty integer,
  p_nominal numeric,
  p_kategori text,
  p_from_wallet_id uuid default null,
  p_to_wallet_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_wallet public.wallets;
  v_product public.products;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_nominal numeric(14,2);
  v_qty integer;
  v_date date;
  v_tanggal timestamptz;
  v_reversal_exists boolean;
  v_old jsonb;
  v_from_id uuid;
  v_to_id uuid;
  v_from public.wallets;
  v_to public.wallets;
  v_old_from public.wallets;
  v_old_to public.wallets;
  v_wallet_ids uuid[];
  v_new_wallet_id uuid;
  v_new_wallet public.wallets;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND:transaksi' using errcode = 'P0002';
  end if;
  if v_tx.status <> 'active' then
    raise exception 'CONFLICT:void' using errcode = 'P0001';
  end if;
  if v_tx.tipe = 'payout' or v_tx.payout_id is not null then
    raise exception 'CONFLICT:payout' using errcode = 'P0001';
  end if;
  if v_tx.reversal_of is not null then
    raise exception 'CONFLICT:reversal' using errcode = 'P0001';
  end if;
  if v_tx.import_batch_id is not null then
    raise exception 'HISTORICAL_PERIOD:import' using errcode = '22023';
  end if;
  select exists(select 1 from public.transactions where reversal_of = v_tx.id)
    into v_reversal_exists;
  if v_reversal_exists then
    raise exception 'CONFLICT:void' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.payout_history ph
    where (v_tx.tanggal at time zone 'Asia/Jakarta')::date
          between ph.start_date and ph.end_date
  ) then
    raise exception 'HISTORICAL_PERIOD:paid' using errcode = '22023';
  end if;

  v_date := coalesce(p_tanggal, (v_tx.tanggal at time zone 'Asia/Jakarta')::date);
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.payout_history ph
    where v_date between ph.start_date and ph.end_date
  ) then
    raise exception 'HISTORICAL_PERIOD:paid' using errcode = '22023';
  end if;

  v_old := to_jsonb(v_tx);
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  if v_tx.tipe = 'income' or v_tx.tipe = 'expense' then
    select * into v_wallet from public.wallets where id = v_tx.wallet_id for update;
    if not found then raise exception 'NOT_FOUND:wallet' using errcode = 'P0002'; end if;
  end if;

  if v_tx.tipe = 'income' then
    select * into v_product from public.products
    where id = coalesce(p_product_id, v_tx.product_id) and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
    end if;

    select pp.harga_beli, pp.harga_jual into v_cost, v_price
    from public.product_price_at(v_product.id, v_date) pp;
    if v_cost is null then
      raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
    end if;
    if v_price < v_cost then
      raise exception 'INVALID_MARGIN' using errcode = 'P0001';
    end if;

    v_qty := coalesce(p_qty, v_tx.qty);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
    end if;
    v_nominal := v_price * v_qty;
    if v_wallet.saldo + (v_nominal - v_tx.nominal) < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.wallets set saldo = saldo + (v_nominal - v_tx.nominal) where id = v_wallet.id;
    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal, qty = v_qty, unit_price = v_price,
        product_id = v_product.id,
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;

    insert into public.transaction_costs (transaction_id, unit_cost, margin)
    values (v_tx.id, v_cost, (v_price - v_cost) * v_qty)
    on conflict (transaction_id) do update
      set unit_cost = excluded.unit_cost, margin = excluded.margin;

  elsif v_tx.tipe = 'expense' then
    v_nominal := coalesce(p_nominal, v_tx.nominal);
    if v_nominal <= 0 then
      raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
    end if;
    if v_wallet.saldo + (v_tx.nominal - v_nominal) < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;
    update public.wallets
    set saldo = saldo + (v_tx.nominal - v_nominal) where id = v_wallet.id;
    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal,
        kategori = coalesce(nullif(btrim(p_kategori), ''), kategori),
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;

  elsif v_tx.tipe = 'transfer' then
    v_from_id := coalesce(p_from_wallet_id, v_tx.wallet_id);
    v_to_id := coalesce(p_to_wallet_id, v_tx.wallet_destination_id);
    v_nominal := coalesce(p_nominal, v_tx.nominal);

    if v_from_id is null or v_to_id is null or v_from_id = v_to_id then
      raise exception 'SAME_WALLET' using errcode = '22023';
    end if;
    if v_nominal is null or v_nominal <= 0 or v_nominal <> trunc(v_nominal) then
      raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
    end if;

    v_wallet_ids := array[v_tx.wallet_id, v_tx.wallet_destination_id, v_from_id, v_to_id];
    perform 1 from public.wallets
    where id = any(v_wallet_ids)
    order by id
    for update;

    select * into v_old_from from public.wallets where id = v_tx.wallet_id;
    select * into v_old_to from public.wallets where id = v_tx.wallet_destination_id;
    select * into v_from from public.wallets
    where id = v_from_id and is_active = true and deleted_at is null;
    if not found then raise exception 'WALLET_INACTIVE:asal' using errcode = 'P0002'; end if;
    select * into v_to from public.wallets
    where id = v_to_id and is_active = true and deleted_at is null;
    if not found then raise exception 'WALLET_INACTIVE:tujuan' using errcode = 'P0002'; end if;

    -- Kembalikan dampak transfer lama, lalu terapkan transfer baru.
    if v_from_id = v_tx.wallet_id then
      if v_from.saldo + v_tx.nominal < v_nominal then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
    elsif v_from.saldo < v_nominal then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.wallets set saldo = saldo + v_tx.nominal where id = v_tx.wallet_id;
    update public.wallets set saldo = saldo - v_tx.nominal where id = v_tx.wallet_destination_id;

    if (select saldo from public.wallets where id = v_from_id) < v_nominal then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.wallets set saldo = saldo - v_nominal where id = v_from_id;
    update public.wallets set saldo = saldo + v_nominal where id = v_to_id;

    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal,
        wallet_id = v_from_id,
        wallet_destination_id = v_to_id,
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;
  else
    raise exception 'CONFLICT:tipe' using errcode = 'P0001';
  end if;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'update', v_old, to_jsonb(v_tx), auth.uid());

  return to_jsonb(v_tx);
end;
$$;

revoke execute on function public.update_transaction(uuid, date, text, uuid, integer, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.update_transaction(uuid, date, text, uuid, integer, numeric, text, uuid, uuid) to authenticated;
