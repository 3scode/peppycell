-- 202611160001_voucher_entry_backfill.sql
-- 1. Pastikan RPC sell_voucher versi tanggal (3 argumen) tersedia.
--    Beberapa environment sempat melewatkan 202611150006 sehingga app yang
--    memanggil p_tanggal gagal menemukan fungsi.
-- 2. Backfill jurnal pembelian stok untuk voucher lama yang dibuat sebelum
--    202611150007 (entry_transaction_id masih NULL).
--
-- Catatan saldo:
-- Voucher lama sudah mengkredit nilai stok ke wallet saat konversi (lewat
-- wallet_adjustments). Backfill ini hanya membuat jurnal agar pembelian stok
-- terlihat di /transactions dan tertaut ke voucher; saldo wallet TIDAK diubah
-- supaya tidak terjadi double credit.

-- ============================================================
-- 1. RPC tandai voucher terjual (dengan tanggal)
-- ============================================================
drop function if exists public.sell_voucher(uuid, uuid);
create or replace function public.sell_voucher(
  p_voucher_id uuid,
  p_wallet_id uuid,
  p_tanggal date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_voucher public.voucher_stocks;
  v_wallet public.wallets;
  v_stock_wallet public.wallets;
  v_tx public.transactions;
  v_date date;
  v_tanggal timestamptz;
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_voucher from public.voucher_stocks
  where id = p_voucher_id
  for update;
  if not found then
    raise exception 'NOT_FOUND:Voucher tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_voucher.status = 'sold' and v_voucher.sale_transaction_id is not null then
    return jsonb_build_object(
      'duplicate', true,
      'voucher_id', v_voucher.id,
      'kode', v_voucher.kode_voucher,
      'transaction_id', v_voucher.sale_transaction_id,
      'nominal', v_voucher.harga_jual,
      'margin', v_voucher.harga_jual - v_voucher.harga_beli
    );
  end if;
  if v_voucher.status <> 'available' then
    raise exception 'CONFLICT:Voucher ini tidak tersedia.' using errcode = 'P0001';
  end if;

  -- Karyawan selalu memakai wallet default, sama seperti catat penjualan.
  if v_role <> 'admin' then
    p_wallet_id := null;
  end if;

  if p_wallet_id is not null then
    select * into v_wallet from public.wallets
    where id = p_wallet_id and is_active = true and deleted_at is null
    for update;
    if not found then
      raise exception 'WALLET_INACTIVE:Wallet tujuan tidak aktif.' using errcode = 'P0002';
    end if;
  else
    select * into v_wallet from public.wallets
    where is_default = true and is_active = true and deleted_at is null
    for update;
    if not found then
      raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
    end if;
  end if;

  select * into v_stock_wallet from public.wallets
  where id = v_voucher.wallet_id
  for update;
  if not found then
    raise exception 'WALLET_INACTIVE:Wallet voucher tidak aktif.' using errcode = 'P0002';
  end if;
  if v_stock_wallet.saldo < v_voucher.harga_beli then
    raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk melepas stok voucher Rp %.',
      v_stock_wallet.nama_wallet, v_stock_wallet.saldo::bigint, v_voucher.harga_beli::bigint
      using errcode = 'P0001';
  end if;

  -- Tanggal default: hari ini WIB. Tidak boleh tanggal masa depan.
  v_date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:Tanggal tidak boleh lebih dari hari ini.' using errcode = '22023';
  end if;
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  insert into public.transactions
    (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, product_id,
     keterangan, user_id, source_wallet_id)
  values
    (v_tanggal, 'income', 'penjualan', v_voucher.harga_jual, 1, v_voucher.harga_jual,
     v_wallet.id, v_voucher.product_id,
     'Voucher ' || v_voucher.kode_voucher, auth.uid(), null)
  returning * into v_tx;

  insert into public.transaction_costs
    (transaction_id, unit_cost, margin, source_cost)
  values
    (v_tx.id, v_voucher.harga_beli,
     v_voucher.harga_jual - v_voucher.harga_beli, 0);

  update public.wallets set saldo = saldo + v_voucher.harga_jual, updated_at = now()
  where id = v_wallet.id;

  update public.wallets set saldo = saldo - v_voucher.harga_beli, updated_at = now()
  where id = v_stock_wallet.id;

  insert into public.wallet_adjustments
    (wallet_id, old_balance, new_balance, delta, reason, actor_id)
  values
    (v_stock_wallet.id, v_stock_wallet.saldo, v_stock_wallet.saldo - v_voucher.harga_beli,
     -v_voucher.harga_beli, 'Voucher ' || v_voucher.kode_voucher || ' terjual', auth.uid());

  update public.voucher_stocks
  set status = 'sold', sold_at = now(), sold_by = auth.uid(),
      sale_transaction_id = v_tx.id, updated_at = now()
  where id = v_voucher.id;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values
    ('voucher_stocks', v_voucher.id::text, 'voucher_sell',
     to_jsonb(v_voucher), to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'duplicate', false,
    'voucher_id', v_voucher.id,
    'kode', v_voucher.kode_voucher,
    'transaction_id', v_tx.id,
    'nominal', v_voucher.harga_jual,
    'margin', v_voucher.harga_jual - v_voucher.harga_beli,
    'wallet_name', v_wallet.nama_wallet
  );
end;
$$;

revoke execute on function public.sell_voucher(uuid, uuid, date) from public, anon;
grant execute on function public.sell_voucher(uuid, uuid, date) to authenticated;

-- ============================================================
-- 2. Backfill jurnal pembelian stok voucher lama
-- ============================================================
alter table public.voucher_stocks
  add column if not exists entry_transaction_id uuid;

create index if not exists voucher_stocks_entry_transaction_idx
  on public.voucher_stocks (entry_transaction_id)
  where entry_transaction_id is not null;

do $$
declare
  v_voucher public.voucher_stocks;
  v_funding uuid;
  v_actor uuid;
  v_tanggal timestamptz;
  v_journal public.transactions;
begin
  for v_voucher in
    select *
    from public.voucher_stocks
    where entry_transaction_id is null
      and harga_beli > 0
    order by converted_at, id
  loop
    -- Wallet asal jurnal: modal penjualan asal, lalu wallet penerima hasil jual.
    select coalesce(
      nullif(al.old_values->>'source_wallet_id', '')::uuid,
      nullif(al.old_values->>'wallet_id', '')::uuid
    )
    into v_funding
    from public.audit_logs al
    where al.table_name = 'voucher_stocks'
      and al.action = 'voucher_convert'
      and al.record_id = v_voucher.id::text
    order by al.created_at desc
    limit 1;

    -- Fallback: wallet yang dulu menerima kredit nilai stok voucher.
    if v_funding is null then
      select wa.wallet_id
      into v_funding
      from public.wallet_adjustments wa
      where wa.reason = 'Stok voucher ' || v_voucher.kode_voucher || ' masuk'
      order by wa.created_at asc
      limit 1;
    end if;

    -- Fallback: transaksi asal (bila karena suatu hal belum terhapus).
    if v_funding is null then
      select coalesce(t.source_wallet_id, t.wallet_id)
      into v_funding
      from public.transactions t
      where t.id = v_voucher.origin_transaction_id;
    end if;

    select coalesce(
      v_voucher.converted_by,
      (select al.actor_id
       from public.audit_logs al
       where al.table_name = 'voucher_stocks'
         and al.record_id = v_voucher.id::text
         and al.actor_id is not null
       order by al.created_at desc
       limit 1),
      (select t.user_id
       from public.transactions t
       where t.id = v_voucher.origin_transaction_id),
      (select u.id
       from public.users u
       where u.deleted_at is null
       order by (u.role = 'admin') desc, u.created_at
       limit 1)
    )
    into v_actor;

    -- Transfer ke wallet yang sama tidak valid di skema transactions.
    -- Voucher seperti ini tetap tersimpan; jurnalnya tidak difabrikasi.
    if v_funding is null
       or v_funding = v_voucher.wallet_id
       or v_actor is null then
      raise notice 'voucher % dilewati: funding=% wallet=% actor=%',
        v_voucher.kode_voucher, v_funding, v_voucher.wallet_id, v_actor;
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
       v_funding, v_voucher.wallet_id,
       'Pembelian stok voucher ' || v_voucher.kode_voucher,
       v_actor, gen_random_uuid())
    returning * into v_journal;

    update public.voucher_stocks
    set entry_transaction_id = v_journal.id
    where id = v_voucher.id;

    insert into public.audit_logs
      (table_name, record_id, action, new_values, actor_id)
    values
      ('transactions', v_journal.id::text, 'insert', to_jsonb(v_journal), v_actor);
  end loop;
end;
$$;
