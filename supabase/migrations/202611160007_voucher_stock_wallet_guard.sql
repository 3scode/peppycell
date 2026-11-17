-- 202611160007_voucher_stock_wallet_guard.sql
-- Wallet stok voucher harus selalu sama dengan nilai stok voucher tersedia.
-- 1. Jurnal pembelian stok (entry_transaction_id) tidak boleh diedit, di-void,
--    atau dihapus karena koreksi saldo akan melepas nilai stok dari wallet.
-- 2. Saldo wallet yang masih memegang stok voucher tidak bisa diubah manual.
-- 3. Perbaiki jurnal pembelian yang terlanjur dihapus: buat ulang jurnalnya
--    dan pindahkan nilai stok kembali ke wallet voucher.

create or replace function public.delete_transactions(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_original public.transactions;
  v_reversal public.transactions;
  v_wallet public.wallets;
  v_id uuid;
  v_wallet_id uuid;
  v_target_ids uuid[] := '{}';
  v_deleted integer := 0;
  v_snapshot jsonb;
  v_refund numeric(14,2);
  v_deltas jsonb := '{}'::jsonb;
  v_delta numeric;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'VALIDATION_ERROR:ids' using errcode = '22023';
  end if;

  -- Kumpulkan target (void + reversal selalu berpasangan).
  for v_id in select distinct unnest(p_ids) loop
    select * into v_tx from public.transactions where id = v_id for update;
    if not found then
      raise exception 'NOT_FOUND:transaksi' using errcode = 'P0002';
    end if;
    if v_tx.tipe = 'payout' or v_tx.payout_id is not null then
      raise exception 'CONFLICT:payout' using errcode = 'P0001';
    end if;
    if v_tx.import_batch_id is not null then
      raise exception 'HISTORICAL_PERIOD:import' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.voucher_stocks vs where vs.sale_transaction_id = v_tx.id
    ) then
      raise exception 'CONFLICT:Transaksi ini hasil penjualan voucher. Batalkan lewat menu Stok Voucher.'
        using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.voucher_stocks vs
      where vs.entry_transaction_id = v_tx.id
         or vs.entry_transaction_id = v_tx.reversal_of
    ) then
      raise exception 'CONFLICT:Transaksi ini jurnal pembelian stok voucher. Kelola lewat menu Stok Voucher.'
        using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.payout_history ph
      where (v_tx.tanggal at time zone 'Asia/Jakarta')::date
            between ph.start_date and ph.end_date
    ) then
      raise exception 'HISTORICAL_PERIOD:paid' using errcode = '22023';
    end if;

    if not (v_tx.id = any(v_target_ids)) then
      v_target_ids := array_append(v_target_ids, v_tx.id);
    end if;

    if v_tx.status = 'void' then
      select * into v_reversal from public.transactions where reversal_of = v_tx.id;
      if not found then
        raise exception 'CONFLICT:void' using errcode = 'P0001';
      end if;
      if not (v_reversal.id = any(v_target_ids)) then
        v_target_ids := array_append(v_target_ids, v_reversal.id);
      end if;
    elsif v_tx.reversal_of is not null then
      select * into v_original from public.transactions where id = v_tx.reversal_of;
      if not found then
        raise exception 'CONFLICT:reversal' using errcode = 'P0001';
      end if;
      if not (v_original.id = any(v_target_ids)) then
        v_target_ids := array_append(v_target_ids, v_original.id);
      end if;
    end if;
  end loop;

  -- Kunci semua baris target, termasuk pasangan void/reversal.
  perform 1 from public.transactions
  where id = any(v_target_ids)
  order by id
  for update;

  -- Hitung koreksi saldo per wallet. Pasangan void/reversal saling meniadakan.
  for v_tx in select * from public.transactions where id = any(v_target_ids) loop
    if v_tx.status = 'void' or v_tx.reversal_of is not null then
      continue;
    end if;

    if v_tx.tipe = 'income' then
      if v_tx.source_wallet_id is not null then
        select coalesce(tc.source_cost, 0) into v_refund
        from public.transaction_costs tc
        where tc.transaction_id = v_tx.id;
        if v_refund <> 0 then
          v_deltas := jsonb_set(
            v_deltas,
            array[v_tx.source_wallet_id::text],
            to_jsonb(coalesce((v_deltas ->> v_tx.source_wallet_id::text)::numeric, 0) + v_refund),
            true
          );
        end if;
      end if;
      if v_tx.wallet_id is not null then
        v_deltas := jsonb_set(
          v_deltas,
          array[v_tx.wallet_id::text],
          to_jsonb(coalesce((v_deltas ->> v_tx.wallet_id::text)::numeric, 0) - v_tx.nominal),
          true
        );
      end if;
    elsif v_tx.tipe = 'expense' then
      if v_tx.wallet_id is not null then
        v_deltas := jsonb_set(
          v_deltas,
          array[v_tx.wallet_id::text],
          to_jsonb(coalesce((v_deltas ->> v_tx.wallet_id::text)::numeric, 0) + v_tx.nominal),
          true
        );
      end if;
    elsif v_tx.tipe = 'transfer' then
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
    end if;
  end loop;

  -- Kunci wallet terdampak dengan urutan tetap, lalu validasi saldo akhir.
  perform 1 from public.wallets
  where id in (select key::uuid from jsonb_each_text(v_deltas))
  order by id
  for update;

  for v_wallet_id, v_delta in
    select key::uuid, value::numeric from jsonb_each_text(v_deltas)
  loop
    select * into v_wallet from public.wallets where id = v_wallet_id;
    if not found then
      raise exception 'NOT_FOUND:wallet' using errcode = 'P0002';
    end if;
    if v_wallet.saldo + v_delta < 0 then
      raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk membatalkan transaksi. Kurang Rp %.',
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

  -- Catat audit per transaksi, lalu hapus semuanya dalam satu statement agar
  -- pasangan void/reversal tidak melanggar foreign key.
  for v_id in select unnest(v_target_ids) loop
    select to_jsonb(t) into v_snapshot from public.transactions t where t.id = v_id;
    insert into public.audit_logs
      (table_name, record_id, action, old_values, actor_id)
    values ('transactions', v_id::text, 'delete', v_snapshot, auth.uid());
  end loop;

  delete from public.transactions where id = any(v_target_ids);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('deleted', v_deleted);
end;
$$;

revoke execute on function public.delete_transactions(uuid[]) from public, anon;
grant execute on function public.delete_transactions(uuid[]) to authenticated;


create or replace function public.void_transaction(
  p_transaction_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_orig public.transactions;
  v_rev public.transactions;
  v_source_cost numeric(14,2) default 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 200 then
    raise exception 'VALIDATION_ERROR:alasan' using errcode = '22023';
  end if;

  select * into v_orig from public.transactions
  where id = p_transaction_id for update;
  if not found then raise exception 'NOT_FOUND:transaksi' using errcode = 'P0002'; end if;
  if v_orig.status <> 'active' then
    raise exception 'CONFLICT:transaksi sudah dibatalkan' using errcode = 'P0001';
  end if;
  if v_orig.tipe = 'payout' or v_orig.payout_id is not null then
    raise exception 'FORBIDDEN:payout tidak dapat dibatalkan' using errcode = '42501';
  end if;
  if v_orig.reversal_of is not null then
    raise exception 'CONFLICT:baris reversal tidak dapat dibatalkan' using errcode = 'P0001';
  end if;
  if v_orig.import_batch_id is not null then
    raise exception 'HISTORICAL_PERIOD:transaksi historis tidak dapat dibatalkan' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.voucher_stocks vs where vs.entry_transaction_id = v_orig.id
  ) then
    raise exception 'CONFLICT:Jurnal pembelian stok voucher tidak bisa dibatalkan. Kelola lewat menu Stok Voucher.'
      using errcode = 'P0001';
  end if;

  perform 1 from public.wallets
  where id in (v_orig.wallet_id,
               coalesce(v_orig.wallet_destination_id, v_orig.wallet_id),
               coalesce(v_orig.source_wallet_id, v_orig.wallet_id))
  order by id
  for update;

  if v_orig.tipe = 'income' then
    select coalesce(tc.source_cost, 0) into v_source_cost
    from public.transaction_costs tc
    where tc.transaction_id = v_orig.id;

    insert into public.transactions
      (tipe, kategori, nominal, qty, unit_price, wallet_id, source_wallet_id,
       product_id, keterangan, user_id, status, reversal_of, client_request_id)
    values
      ('income', v_orig.kategori, v_orig.nominal, v_orig.qty, v_orig.unit_price,
       v_orig.wallet_id, v_orig.source_wallet_id, v_orig.product_id,
       'Pembatalan: ' || coalesce(v_orig.keterangan, v_orig.id::text),
       auth.uid(), 'active', v_orig.id, gen_random_uuid())
    returning * into v_rev;

    insert into public.transaction_costs (transaction_id, unit_cost, margin, source_cost)
    select v_rev.id, unit_cost, -margin,
           coalesce(source_cost, 0)
    from public.transaction_costs
    where transaction_id = v_orig.id;

    update public.wallets set saldo = saldo - v_orig.nominal where id = v_orig.wallet_id;
    if v_orig.source_wallet_id is not null then
      update public.wallets set saldo = saldo + v_source_cost where id = v_orig.source_wallet_id;
    end if;

  elsif v_orig.tipe = 'expense' then
    insert into public.transactions
      (tipe, kategori, nominal, qty, unit_price, wallet_id, keterangan,
       user_id, status, reversal_of, client_request_id)
    values
      ('expense', v_orig.kategori, v_orig.nominal, v_orig.qty, null,
       v_orig.wallet_id, 'Pembatalan: ' || coalesce(v_orig.keterangan, v_orig.id::text),
       auth.uid(), 'active', v_orig.id, gen_random_uuid())
    returning * into v_rev;

    update public.wallets set saldo = saldo + v_orig.nominal where id = v_orig.wallet_id;

  else
    insert into public.transactions
      (tipe, kategori, nominal, qty, wallet_id, wallet_destination_id, keterangan,
       user_id, status, reversal_of, client_request_id)
    values
      ('transfer', 'transfer', v_orig.nominal, v_orig.qty,
       v_orig.wallet_destination_id, v_orig.wallet_id,
       'Pembatalan: ' || coalesce(v_orig.keterangan, v_orig.id::text),
       auth.uid(), 'active', v_orig.id, gen_random_uuid())
    returning * into v_rev;

    update public.wallets set saldo = saldo - v_orig.nominal
    where id = v_orig.wallet_destination_id;
    update public.wallets set saldo = saldo + v_orig.nominal
    where id = v_orig.wallet_id;
  end if;

  update public.transactions set status = 'void' where id = v_orig.id;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, reason, actor_id)
  values
    ('transactions', v_orig.id::text, 'void', to_jsonb(v_orig), to_jsonb(v_rev),
     btrim(p_reason), auth.uid());

  return to_jsonb(v_rev);
end;
$$;
revoke execute on function public.void_transaction(uuid, text) from public, anon;
grant execute on function public.void_transaction(uuid, text) to authenticated;


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
  if exists (
    select 1 from public.voucher_stocks vs where vs.entry_transaction_id = v_tx.id
  ) then
    raise exception 'CONFLICT:Transaksi ini jurnal pembelian stok voucher. Kelola lewat menu Stok Voucher.'
      using errcode = 'P0001';
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

    -- Harga mengikuti produk terkini. Produk yang tidak diganti mempertahankan
    -- harga/modal tersimpan, jadi edit tidak menghitung ulang dari riwayat tanggal.
    if p_product_id is null or p_product_id = v_tx.product_id then
      v_price := coalesce(v_tx.unit_price, v_product.harga_jual);
      select tc.unit_cost into v_cost
      from public.transaction_costs tc
      where tc.transaction_id = v_tx.id;
    else
      v_price := v_product.harga_jual;
    end if;

    if v_cost is null then
      select coalesce(pc.harga_beli, 0) into v_cost
      from public.product_costs pc
      where pc.product_id = v_product.id;
    end if;
    v_cost := coalesce(v_cost, 0);

    if v_price is null then
      raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
    end if;
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


create or replace function public.adjust_wallet_balance(
  p_wallet_id uuid,
  p_new_balance numeric,
  p_reason text,
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
  v_existing public.wallet_adjustments;
  v_delta numeric(14,2);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_new_balance is null or p_new_balance < 0 or p_new_balance <> trunc(p_new_balance) then
    raise exception 'VALIDATION_ERROR:saldo' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'VALIDATION_ERROR:alasan' using errcode = '22023';
  end if;

  select * into v_existing from public.wallet_adjustments
  where client_request_id = p_client_request_id;
  if found then
    if v_existing.wallet_id <> p_wallet_id or v_existing.new_balance <> p_new_balance then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then raise exception 'NOT_FOUND:wallet' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.voucher_stocks vs
    where vs.wallet_id = p_wallet_id and vs.status = 'available'
  ) then
    raise exception 'CONFLICT:Saldo wallet stok voucher mengikuti nilai stok. Ubah harga lewat menu Stok Voucher.'
      using errcode = 'P0001';
  end if;

  v_delta := p_new_balance - v_wallet.saldo;
  if v_delta = 0 then
    raise exception 'VALIDATION_ERROR:saldo sama' using errcode = '22023';
  end if;

  update public.wallets set saldo = p_new_balance where id = p_wallet_id;

  insert into public.wallet_adjustments
    (wallet_id, old_balance, new_balance, delta, reason, actor_id, client_request_id)
  values
    (p_wallet_id, v_wallet.saldo, p_new_balance, v_delta, btrim(p_reason), auth.uid(),
     p_client_request_id)
  returning * into v_existing;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, reason, actor_id)
  values
    ('wallet_adjustments', v_existing.id::text, 'update',
     jsonb_build_object('saldo', v_wallet.saldo), jsonb_build_object('saldo', p_new_balance),
     btrim(p_reason), auth.uid());

  return to_jsonb(v_existing);
end;
$$;
revoke execute on function public.adjust_wallet_balance(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.adjust_wallet_balance(uuid, numeric, text, uuid) to authenticated;


-- ============================================================
-- Perbaikan data: jurnal pembelian stok voucher yang terlanjur dihapus.
-- Jurnal dihapus lewat delete_transactions sehingga nilai stok ikut keluar
-- dari wallet voucher. Buat ulang jurnalnya dan pindahkan nilainya kembali.
-- ============================================================
do $$
declare
  v_voucher public.voucher_stocks;
  v_funding_id uuid;
  v_actor uuid;
  v_tanggal timestamptz;
  v_funding public.wallets;
  v_stock public.wallets;
  v_journal public.transactions;
begin
  for v_voucher in
    select vs.*
    from public.voucher_stocks vs
    where vs.entry_transaction_id is not null
      and vs.harga_beli > 0
      and not exists (
        select 1 from public.transactions t where t.id = vs.entry_transaction_id
      )
    order by vs.converted_at, vs.id
  loop
    -- Wallet yang menerima refund saat jurnalnya dihapus.
    select (al.old_values->>'wallet_id')::uuid
    into v_funding_id
    from public.audit_logs al
    where al.table_name = 'transactions'
      and al.action = 'delete'
      and al.record_id = v_voucher.entry_transaction_id::text
    order by al.created_at desc
    limit 1;

    -- Fallback: wallet asal konversi voucher.
    if v_funding_id is null then
      select coalesce(
        nullif(al.old_values->>'source_wallet_id', '')::uuid,
        nullif(al.old_values->>'wallet_id', '')::uuid
      )
      into v_funding_id
      from public.audit_logs al
      where al.table_name = 'voucher_stocks'
        and al.action = 'voucher_convert'
        and al.record_id = v_voucher.id::text
      order by al.created_at desc
      limit 1;
    end if;

    if v_funding_id is null then
      select wa.wallet_id into v_funding_id
      from public.wallet_adjustments wa
      where wa.reason = 'Pembelian stok voucher ' || v_voucher.kode_voucher
      order by wa.created_at asc
      limit 1;
    end if;

    if v_funding_id is null or v_funding_id = v_voucher.wallet_id then
      raise notice 'voucher % dilewati: wallet asal tidak ditemukan', v_voucher.kode_voucher;
      continue;
    end if;

    select coalesce(
      v_voucher.converted_by,
      (select al.actor_id from public.audit_logs al
       where al.table_name = 'voucher_stocks'
         and al.record_id = v_voucher.id::text
         and al.actor_id is not null
       order by al.created_at desc limit 1),
      (select t.user_id from public.transactions t where t.id = v_voucher.origin_transaction_id),
      (select u.id from public.users u where u.deleted_at is null
       order by (u.role = 'admin') desc, u.created_at limit 1)
    ) into v_actor;

    if v_actor is null then
      raise notice 'voucher % dilewati: aktor tidak ditemukan', v_voucher.kode_voucher;
      continue;
    end if;

    perform 1 from public.wallets
    where id in (v_funding_id, v_voucher.wallet_id)
    order by id
    for update;

    select * into v_funding from public.wallets where id = v_funding_id;
    select * into v_stock from public.wallets where id = v_voucher.wallet_id;
    if v_funding.id is null or v_stock.id is null then
      raise notice 'voucher % dilewati: wallet tidak ditemukan', v_voucher.kode_voucher;
      continue;
    end if;
    if v_funding.saldo < v_voucher.harga_beli then
      raise notice 'voucher % dilewati: saldo % tidak cukup',
        v_voucher.kode_voucher, v_funding.nama_wallet;
      continue;
    end if;

    v_tanggal := (
      ((v_voucher.converted_at at time zone 'Asia/Jakarta')::date::timestamp
       + time '12:00') at time zone 'Asia/Jakarta'
    );

    insert into public.transactions
      (tanggal, tipe, kategori, nominal, qty, wallet_id, wallet_destination_id,
       keterangan, user_id, client_request_id)
    values
      (v_tanggal, 'transfer', 'transfer', v_voucher.harga_beli, 1,
       v_funding_id, v_voucher.wallet_id,
       'Pembelian stok voucher ' || v_voucher.kode_voucher,
       v_actor, gen_random_uuid())
    returning * into v_journal;

    update public.wallets set saldo = saldo - v_voucher.harga_beli, updated_at = now()
    where id = v_funding_id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_funding_id, v_funding.saldo, v_funding.saldo - v_voucher.harga_beli,
       -v_voucher.harga_beli,
       'Pembelian stok voucher ' || v_voucher.kode_voucher, v_actor);

    update public.wallets set saldo = saldo + v_voucher.harga_beli, updated_at = now()
    where id = v_voucher.wallet_id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_voucher.wallet_id, v_stock.saldo, v_stock.saldo + v_voucher.harga_beli,
       v_voucher.harga_beli,
       'Stok voucher ' || v_voucher.kode_voucher || ' masuk', v_actor);

    insert into public.audit_logs
      (table_name, record_id, action, new_values, actor_id)
    values ('transactions', v_journal.id::text, 'insert', to_jsonb(v_journal), v_actor);

    update public.voucher_stocks
    set entry_transaction_id = v_journal.id
    where id = v_voucher.id;
  end loop;
end $$;
