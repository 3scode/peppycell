-- 202611150002_wallet_balance_guard.sql
-- Pembatalan transaksi lewat delete_transactions harus memvalidasi saldo akhir
-- semua wallet terdampak. Sebelumnya transfer yang dibatalkan bisa membuat
-- saldo wallet tujuan negatif dan menabrak check constraint wallets_saldo_check,
-- sehingga pengguna hanya melihat pesan generik "Terjadi kesalahan pada database."
--
-- Perhitungan dilakukan sebagai delta per wallet supaya hapus massal tetap
-- konsisten: transfer A->B dan B->A dalam satu batch bisa saling meniadakan.
-- Penghapusan baris juga dilakukan dalam satu statement agar pasangan
-- void/reversal tidak melanggar foreign key transactions.reversal_of.

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
