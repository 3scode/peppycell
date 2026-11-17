-- 202611160003_fix_edit_wallet.sql
-- Perbaikan edit transaksi:
-- 1. Wallet penerima/pengeluaran dipindah lewat p_from_wallet_id.
-- 2. Wallet sumber (modal) bisa direset ke "tanpa wallet sumber" lewat
--    p_source_wallet_changed, karena null saja ambigu dengan "jangan ubah".
-- 3. Koreksi saldo income saat wallet penerima pindah: wallet baru menerima
--    nominal baru dan wallet lama kehilangan nominal lama. Versi sebelumnya
--    memakai arah pengeluaran (debit wallet baru, kredit wallet lama).

drop function if exists public.update_transaction(
  uuid, date, text, uuid, integer, numeric, text, uuid, uuid, uuid, numeric
);

create or replace function public.update_transaction(
  p_id uuid,
  p_tanggal date,
  p_keterangan text,
  p_product_id uuid,
  p_qty integer,
  p_nominal numeric,
  p_kategori text,
  p_from_wallet_id uuid default null,
  p_to_wallet_id uuid default null,
  p_source_wallet_id uuid default null,
  p_source_cost numeric default null,
  p_source_wallet_changed boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_wallet public.wallets;
  v_source public.wallets;
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
  v_new_wallet_id uuid;
  v_new_wallet public.wallets;
  v_wallet_ids uuid[];
  v_old_source uuid;
  v_new_source uuid;
  v_old_source_cost numeric(14,2) default 0;
  v_new_source_cost numeric(14,2);
  v_deltas jsonb := '{}'::jsonb;
  v_wallet_id uuid;
  v_delta numeric;
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
  if p_source_cost is not null and p_source_cost < 0 then
    raise exception 'VALIDATION_ERROR:source_cost' using errcode = '22023';
  end if;

  v_old := to_jsonb(v_tx);
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  if v_tx.tipe = 'income' or v_tx.tipe = 'expense' then
    v_new_wallet_id := coalesce(p_from_wallet_id, v_tx.wallet_id);
    perform 1 from public.wallets
    where id in (v_tx.wallet_id, v_new_wallet_id)
    order by id
    for update;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    select * into v_new_wallet from public.wallets
    where id = v_new_wallet_id and is_active = true and deleted_at is null;
    if not found then raise exception 'WALLET_INACTIVE' using errcode = 'P0002'; end if;
  end if;

  if v_tx.tipe = 'income' then
    select * into v_product from public.products
    where id = coalesce(p_product_id, v_tx.product_id) and deleted_at is null;
    if not found then raise exception 'NOT_FOUND:produk' using errcode = 'P0002'; end if;

    select pp.harga_beli, pp.harga_jual into v_cost, v_price
    from public.product_price_at(v_product.id, v_date) pp;
    if v_cost is null then raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002'; end if;
    if v_price < v_cost then raise exception 'INVALID_MARGIN' using errcode = 'P0001'; end if;

    v_qty := coalesce(p_qty, v_tx.qty);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
    end if;
    v_nominal := v_price * v_qty;

    -- Koreksi saldo tujuan (wallet penerima hasil jual): wallet baru
    -- menerima nominal baru, wallet lama kehilangan nominal lama.
    if v_tx.wallet_id = v_new_wallet_id then
      if v_wallet.saldo + (v_nominal - v_tx.nominal) < 0 then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo + (v_nominal - v_tx.nominal)
      where id = v_wallet.id;
    else
      if v_wallet.saldo < v_tx.nominal then
        raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk memindahkan penjualan. Kurang Rp %.',
          v_wallet.nama_wallet,
          v_wallet.saldo::bigint,
          (v_tx.nominal - v_wallet.saldo)::bigint
          using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo - v_tx.nominal where id = v_wallet.id;
      update public.wallets set saldo = saldo + v_nominal where id = v_new_wallet_id;
    end if;

    -- Wallet sumber (modal) hanya berlaku untuk income.
    v_old_source := v_tx.source_wallet_id;
    v_new_source := case
      when coalesce(p_source_wallet_changed, false) then p_source_wallet_id
      else coalesce(p_source_wallet_id, v_tx.source_wallet_id)
    end;
    if v_new_source is not null then
      perform 1 from public.wallets where id = v_new_source for update;
      select * into v_source from public.wallets
      where id = v_new_source and is_active = true and deleted_at is null;
      if not found then raise exception 'WALLET_INACTIVE:sumber' using errcode = 'P0002'; end if;
    end if;

    select coalesce(tc.source_cost, 0) into v_old_source_cost
    from public.transaction_costs tc
    where tc.transaction_id = v_tx.id;

    v_new_source_cost := coalesce(p_source_cost, v_cost * v_qty);

    -- is distinct from: perbandingan UUID dengan null harus tetap dianggap
    -- berubah, supaya modal dikembalikan saat wallet sumber dikosongkan.
    if v_old_source is not null and (v_old_source is distinct from v_new_source or v_new_source_cost <> v_old_source_cost) then
      update public.wallets set saldo = saldo + v_old_source_cost where id = v_old_source;
    end if;
    if v_new_source is not null and (v_new_source is distinct from v_old_source or v_new_source_cost <> v_old_source_cost) then
      if (select saldo from public.wallets where id = v_new_source) < v_new_source_cost then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo - v_new_source_cost where id = v_new_source;
    end if;

    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal, qty = v_qty, unit_price = v_price,
        product_id = v_product.id, wallet_id = v_new_wallet_id,
        source_wallet_id = v_new_source,
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;

    insert into public.transaction_costs (transaction_id, unit_cost, margin, source_cost)
    values (v_tx.id, v_cost, (v_price - v_cost) * v_qty,
            case when v_new_source is not null then v_new_source_cost else null end)
    on conflict (transaction_id) do update
      set unit_cost = excluded.unit_cost,
          margin = excluded.margin,
          source_cost = excluded.source_cost;

  elsif v_tx.tipe = 'expense' then
    v_nominal := coalesce(p_nominal, v_tx.nominal);
    if v_nominal <= 0 then raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023'; end if;

    if v_tx.wallet_id = v_new_wallet_id then
      if v_wallet.saldo + (v_tx.nominal - v_nominal) < 0 then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo + (v_tx.nominal - v_nominal)
      where id = v_wallet.id;
    else
      if (select saldo from public.wallets where id = v_new_wallet_id) < v_nominal then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo - v_nominal where id = v_new_wallet_id;
      update public.wallets set saldo = saldo + v_tx.nominal where id = v_tx.wallet_id;
    end if;

    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal, wallet_id = v_new_wallet_id,
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
    perform 1 from public.wallets where id = any(v_wallet_ids) order by id for update;
    select * into v_from from public.wallets
    where id = v_from_id and is_active = true and deleted_at is null;
    if not found then raise exception 'WALLET_INACTIVE:asal' using errcode = 'P0002'; end if;
    select * into v_to from public.wallets
    where id = v_to_id and is_active = true and deleted_at is null;
    if not found then raise exception 'WALLET_INACTIVE:tujuan' using errcode = 'P0002'; end if;

    -- Hitung delta saldo bersih: batalkan transfer lama lalu terapkan yang baru.
    v_deltas := '{}'::jsonb;
    if v_tx.wallet_id is not null then
      v_deltas := jsonb_set(
        v_deltas,
        array[v_tx.wallet_id::text],
        to_jsonb(coalesce((v_deltas ->> v_tx.wallet_id::text)::numeric, 0) + v_tx.nominal),
        true
      );
    end if;
    if v_tx.wallet_destination_id is not null then
      v_deltas := jsonb_set(
        v_deltas,
        array[v_tx.wallet_destination_id::text],
        to_jsonb(coalesce((v_deltas ->> v_tx.wallet_destination_id::text)::numeric, 0) - v_tx.nominal),
        true
      );
    end if;
    v_deltas := jsonb_set(
      v_deltas,
      array[v_from_id::text],
      to_jsonb(coalesce((v_deltas ->> v_from_id::text)::numeric, 0) - v_nominal),
      true
    );
    v_deltas := jsonb_set(
      v_deltas,
      array[v_to_id::text],
      to_jsonb(coalesce((v_deltas ->> v_to_id::text)::numeric, 0) + v_nominal),
      true
    );

    -- Validasi saldo akhir semua wallet terdampak.
    for v_wallet_id, v_delta in
      select key::uuid, value::numeric from jsonb_each_text(v_deltas)
    loop
      select * into v_wallet from public.wallets where id = v_wallet_id;
      if not found then
        raise exception 'NOT_FOUND:wallet' using errcode = 'P0002';
      end if;
      if v_wallet.saldo + v_delta < 0 then
        raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk mengubah transfer. Kurang Rp %.',
          v_wallet.nama_wallet,
          v_wallet.saldo::bigint,
          (-(v_wallet.saldo + v_delta))::bigint
          using errcode = 'P0001';
      end if;
    end loop;

    update public.wallets w
    set saldo = w.saldo + (v_deltas ->> w.id::text)::numeric,
        updated_at = now()
    where jsonb_exists(v_deltas, w.id::text);

    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal, wallet_id = v_from_id,
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

revoke execute on function public.update_transaction(
  uuid, date, text, uuid, integer, numeric, text, uuid, uuid, uuid, numeric, boolean
) from public, anon;
grant execute on function public.update_transaction(
  uuid, date, text, uuid, integer, numeric, text, uuid, uuid, uuid, numeric, boolean
) to authenticated;
