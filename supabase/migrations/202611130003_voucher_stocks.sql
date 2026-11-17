-- 202611130003_voucher_stocks.sql
-- Stok voucher "belum terjual".
--
-- Konversi: penjualan aktif diubah menjadi stok voucher.
--   Cash (penerima hasil jual)  -nominal
--   Wallet modal                +modal lalu -modal (net 0)
--   Wallet voucher (manual)     +modal
-- Baris penjualan dihapus, diganti baris voucher_stocks.
--
-- Tandai terjual: otomatis membuat transaksi penjualan baru.
--   Wallet tujuan  +harga_jual
--   Wallet voucher -harga_beli

-- ============================================================
-- Skema
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'voucher_status') then
    create type public.voucher_status as enum ('available', 'sold', 'void');
  end if;
end;
$$;

create table if not exists public.voucher_stocks (
  id uuid primary key default gen_random_uuid(),
  kode_voucher varchar(80) not null check (char_length(btrim(kode_voucher)) between 3 and 80),
  product_id uuid not null references public.products(id),
  wallet_id uuid not null references public.wallets(id),
  status public.voucher_status not null default 'available',
  harga_beli numeric(14,2) not null check (harga_beli >= 0),
  harga_jual numeric(14,2) not null check (harga_jual >= 0),
  -- Sengaja tanpa FK: baris penjualan asal dihapus saat konversi,
  -- id-nya tetap disimpan untuk jejak audit.
  origin_transaction_id uuid,
  sale_transaction_id uuid references public.transactions(id) on delete set null,
  client_request_id uuid not null,
  converted_by uuid references public.users(id),
  converted_at timestamptz not null default now(),
  sold_by uuid references public.users(id),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voucher_stocks_kode_uidx
  on public.voucher_stocks (lower(btrim(kode_voucher)));
-- Migration sebelumnya sempat memakai FK; lepaskan agar jejak penjualan asal tetap tersimpan.
alter table public.voucher_stocks
  drop constraint if exists voucher_stocks_origin_transaction_id_fkey;create unique index if not exists voucher_stocks_origin_uidx
  on public.voucher_stocks (origin_transaction_id)
  where origin_transaction_id is not null;
create index if not exists voucher_stocks_request_idx
  on public.voucher_stocks (client_request_id);
create index if not exists voucher_stocks_status_idx
  on public.voucher_stocks (status, converted_at desc);
create index if not exists voucher_stocks_product_idx
  on public.voucher_stocks (product_id);

-- ============================================================
-- RLS: admin & karyawan boleh baca; tulis hanya lewat RPC definer.
-- ============================================================
alter table public.voucher_stocks enable row level security;

drop policy if exists voucher_stocks_select on public.voucher_stocks;
create policy voucher_stocks_select on public.voucher_stocks for select to authenticated
using (public.current_user_role() in ('admin', 'karyawan'));

revoke insert, update, delete on public.voucher_stocks from authenticated;

-- ============================================================
-- Daftar wallet aktif untuk pilihan (aman untuk karyawan).
-- ============================================================
create or replace function public.wallet_options()
returns table (id uuid, nama text, is_default boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select w.id, w.nama_wallet::text, w.is_default
  from public.wallets w
  where w.is_active = true and w.deleted_at is null
  order by w.sort_order, w.created_at;
$$;

-- ============================================================
-- Preview konversi (dipakai dialog)
-- ============================================================
create or replace function public.voucher_convert_preview(p_ids uuid[])
returns table (
  transaction_id uuid,
  product_id uuid,
  product_name text,
  tanggal timestamptz,
  nominal numeric,
  unit_cost numeric,
  harga_jual numeric,
  wallet_id uuid,
  wallet_name text,
  source_wallet_id uuid,
  source_wallet_name text,
  eligible boolean,
  reason text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  return query
  with base as (
    select
      t.id,
      t.product_id,
      p.nama_produk::text as product_name,
      t.tanggal,
      t.nominal,
      t.unit_price,
      t.tipe,
      t.kategori,
      t.status,
      t.qty,
      t.payout_id,
      t.import_batch_id,
      t.reversal_of,
      t.user_id,
      t.wallet_id,
      w.nama_wallet::text as wallet_name,
      t.source_wallet_id,
      sw.nama_wallet::text as source_wallet_name,
      coalesce(tc.unit_cost, pp.harga_beli, 0) as unit_cost,
      coalesce(t.unit_price, t.nominal) as harga_jual
    from public.transactions t
    left join public.products p on p.id = t.product_id
    left join public.transaction_costs tc on tc.transaction_id = t.id
    left join public.wallets w on w.id = t.wallet_id
    left join public.wallets sw on sw.id = t.source_wallet_id
    left join lateral public.product_price_at(
      t.product_id, (t.tanggal at time zone 'Asia/Jakarta')::date
    ) pp on true
    where t.id = any(p_ids)
  )
  select
    b.id,
    b.product_id,
    b.product_name,
    b.tanggal,
    b.nominal,
    b.unit_cost,
    b.harga_jual,
    b.wallet_id,
    b.wallet_name,
    b.source_wallet_id,
    b.source_wallet_name,
    (b.reason is null) as eligible,
    b.reason
  from (
    select
      base.*,
      case
        when base.payout_id is not null then 'Transaksi payout tidak bisa dikonversi.'
        when base.import_batch_id is not null then 'Transaksi hasil import tidak bisa dikonversi.'
        when base.tipe <> 'income' or base.kategori <> 'penjualan' then 'Bukan transaksi penjualan.'
        when base.status <> 'active' then 'Transaksi sudah void.'
        when base.reversal_of is not null then 'Baris reversal tidak bisa dikonversi.'
        when base.qty <> 1 then 'Penjualan dengan qty lebih dari 1. Pecah dulu transaksinya.'
        when base.product_id is null then 'Transaksi tanpa produk.'
        when base.unit_cost <= 0 then 'Harga beli produk belum diatur.'
        when exists (
          select 1 from public.voucher_stocks vs where vs.origin_transaction_id = base.id
        ) then 'Penjualan ini sudah dikonversi jadi voucher.'
        when v_role = 'karyawan' and base.user_id <> auth.uid() then 'Hanya transaksi Anda sendiri.'
        else null
      end as reason
    from base
  ) b
  order by b.tanggal desc;
end;
$$;

-- ============================================================
-- Konversi penjualan menjadi stok voucher
-- ============================================================
create or replace function public.convert_sales_to_vouchers(
  p_items jsonb,
  p_wallet_id uuid,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_item jsonb;
  v_tx public.transactions;
  v_voucher public.voucher_stocks;
  v_wallet public.wallets;
  v_cash public.wallets;
  v_source public.wallets;
  v_kode text;
  v_kode_key text;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_total_cost numeric(14,2) := 0;
  v_new numeric(14,2);
  v_result jsonb := '[]'::jsonb;
  v_ids uuid[];
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'VALIDATION_ERROR:Permintaan tidak valid.' using errcode = '22023';
  end if;
  if p_wallet_id is null then
    raise exception 'VALIDATION_ERROR:Pilih wallet voucher dulu.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION_ERROR:Pilih minimal satu penjualan.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'VALIDATION_ERROR:Maksimal 50 penjualan sekali konversi.' using errcode = '22023';
  end if;

  -- Idempotent: request yang sama mengembalikan hasil sebelumnya.
  if exists (select 1 from public.voucher_stocks where client_request_id = p_client_request_id) then
    return jsonb_build_object(
      'duplicate', true,
      'vouchers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', vs.id,
          'kode', vs.kode_voucher,
          'product_name', p.nama_produk,
          'wallet_name', w.nama_wallet,
          'harga_beli', vs.harga_beli,
          'harga_jual', vs.harga_jual
        ) order by vs.converted_at)
        from public.voucher_stocks vs
        join public.products p on p.id = vs.product_id
        join public.wallets w on w.id = vs.wallet_id
        where vs.client_request_id = p_client_request_id
      ), '[]'::jsonb)
    );
  end if;

  select array_agg((x->>'transaction_id')::uuid)
  into v_ids
  from jsonb_array_elements(p_items) x;

  if v_ids is null or exists (select 1 from unnest(v_ids) as id group by id having count(*) > 1) then
    raise exception 'VALIDATION_ERROR:Ada penjualan yang dipilih lebih dari sekali.' using errcode = '22023';
  end if;

  -- Kode voucher tidak boleh duplikat di dalam satu request.
  if (
    select count(*) from (
      select distinct lower(btrim(x->>'kode'))
      from jsonb_array_elements(p_items) x
    ) s
  ) <> jsonb_array_length(p_items) then
    raise exception 'VALIDATION_ERROR:Kode voucher tidak boleh sama.' using errcode = '22023';
  end if;

  -- Lock semua wallet yang terlibat, urut id supaya tidak deadlock.
  perform 1
  from public.wallets w
  where w.id = p_wallet_id
     or w.id in (select t.wallet_id from public.transactions t where t.id = any(v_ids))
     or w.id in (
       select t.source_wallet_id from public.transactions t
       where t.id = any(v_ids) and t.source_wallet_id is not null
     )
  order by w.id
  for update;

  select * into v_wallet from public.wallets
  where id = p_wallet_id and is_active = true and deleted_at is null;
  if not found then
    raise exception 'WALLET_INACTIVE:Wallet voucher tidak aktif.' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kode := btrim(coalesce(v_item->>'kode', ''));
    if char_length(v_kode) < 3 or char_length(v_kode) > 80 then
      raise exception 'VALIDATION_ERROR:Kode voucher harus 3-80 karakter.' using errcode = '22023';
    end if;
    v_kode_key := lower(v_kode);

    select * into v_tx from public.transactions
    where id = (v_item->>'transaction_id')::uuid
    for update;
    if not found then
      raise exception 'NOT_FOUND:Transaksi tidak ditemukan.' using errcode = 'P0002';
    end if;
    if v_tx.payout_id is not null or v_tx.import_batch_id is not null then
      raise exception 'CONFLICT:Transaksi payout/import tidak bisa dikonversi.' using errcode = 'P0001';
    end if;
    if v_tx.tipe <> 'income' or v_tx.kategori <> 'penjualan' then
      raise exception 'CONFLICT:Hanya transaksi penjualan yang bisa dikonversi.' using errcode = 'P0001';
    end if;
    if v_tx.status <> 'active' or v_tx.reversal_of is not null then
      raise exception 'CONFLICT:Transaksi sudah void.' using errcode = 'P0001';
    end if;
    if v_tx.qty <> 1 then
      raise exception 'CONFLICT:Penjualan qty lebih dari 1 harus dipecah dulu.' using errcode = 'P0001';
    end if;
    if v_tx.product_id is null then
      raise exception 'CONFLICT:Transaksi tanpa produk tidak bisa dikonversi.' using errcode = 'P0001';
    end if;
    if v_role = 'karyawan' and v_tx.user_id <> auth.uid() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if exists (select 1 from public.voucher_stocks where origin_transaction_id = v_tx.id) then
      raise exception 'CONFLICT:Penjualan ini sudah dikonversi jadi voucher.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.voucher_stocks where lower(btrim(kode_voucher)) = v_kode_key
    ) then
      raise exception 'CONFLICT:Kode voucher % sudah dipakai.', v_kode using errcode = 'P0001';
    end if;

    select coalesce(tc.unit_cost, pp.harga_beli, 0) into v_cost
    from public.transactions t
    left join public.transaction_costs tc on tc.transaction_id = t.id
    left join lateral public.product_price_at(
      t.product_id, (t.tanggal at time zone 'Asia/Jakarta')::date
    ) pp on true
    where t.id = v_tx.id;
    if v_cost is null or v_cost <= 0 then
      raise exception 'PRODUCT_COST_MISSING:Harga beli produk belum diatur.' using errcode = 'P0002';
    end if;
    v_price := coalesce(v_tx.unit_price, v_tx.nominal);

    -- 1. Batalkan hasil jual di wallet penerima.
    select * into v_cash from public.wallets where id = v_tx.wallet_id;
    if v_cash.saldo < v_tx.nominal then
      raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk membatalkan penjualan Rp %.',
        v_cash.nama_wallet, v_cash.saldo::bigint, v_tx.nominal::bigint using errcode = 'P0001';
    end if;
    v_new := v_cash.saldo - v_tx.nominal;
    update public.wallets set saldo = v_new, updated_at = now() where id = v_cash.id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_cash.id, v_cash.saldo, v_new, -v_tx.nominal,
       'Reversal penjualan voucher ' || v_kode, auth.uid());
    v_cash.saldo := v_new;

    -- 2. Refund modal ke wallet sumber, lalu pakai untuk beli stok.
    if v_tx.source_wallet_id is not null then
      select * into v_source from public.wallets where id = v_tx.source_wallet_id;
      v_new := v_source.saldo + v_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_source.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_source.id, v_source.saldo, v_new, v_cost,
         'Refund modal penjualan voucher ' || v_kode, auth.uid());
      v_source.saldo := v_new;

      v_new := v_source.saldo - v_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_source.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_source.id, v_source.saldo, v_new, -v_cost,
         'Pembelian stok voucher ' || v_kode, auth.uid());
      v_source.saldo := v_new;
    end if;

    -- 3. Nilai stok masuk ke wallet voucher.
    select * into v_wallet from public.wallets where id = p_wallet_id;
    v_new := v_wallet.saldo + v_cost;
    update public.wallets set saldo = v_new, updated_at = now() where id = v_wallet.id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_wallet.id, v_wallet.saldo, v_new, v_cost,
       'Stok voucher ' || v_kode || ' masuk', auth.uid());
    v_wallet.saldo := v_new;

    -- 4. Catat stok, hapus penjualan asal.
    insert into public.voucher_stocks
      (kode_voucher, product_id, wallet_id, harga_beli, harga_jual,
       origin_transaction_id, client_request_id, converted_by)
    values
      (v_kode, v_tx.product_id, p_wallet_id, v_cost, v_price,
       v_tx.id, p_client_request_id, auth.uid())
    returning * into v_voucher;

    insert into public.audit_logs
      (table_name, record_id, action, old_values, new_values, actor_id)
    values
      ('voucher_stocks', v_voucher.id::text, 'voucher_convert',
       to_jsonb(v_tx), to_jsonb(v_voucher), auth.uid());

    delete from public.transaction_costs where transaction_id = v_tx.id;
    delete from public.transactions where id = v_tx.id;

    v_total_cost := v_total_cost + v_cost;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_voucher.id,
      'kode', v_voucher.kode_voucher,
      'product_id', v_voucher.product_id,
      'product_name', (select nama_produk from public.products where id = v_voucher.product_id),
      'wallet_name', (select nama_wallet from public.wallets where id = v_voucher.wallet_id),
      'harga_beli', v_voucher.harga_beli,
      'harga_jual', v_voucher.harga_jual
    ));
  end loop;

  return jsonb_build_object(
    'duplicate', false,
    'total_cost', v_total_cost,
    'vouchers', v_result
  );
end;
$$;

-- ============================================================
-- Tandai voucher terjual: otomatis membuat transaksi penjualan
-- ============================================================
create or replace function public.sell_voucher(
  p_voucher_id uuid,
  p_wallet_id uuid
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

  insert into public.transactions
    (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, product_id,
     keterangan, user_id, source_wallet_id)
  values
    (now(), 'income', 'penjualan', v_voucher.harga_jual, 1, v_voucher.harga_jual,
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

-- ============================================================
-- Hapus transaksi: kembalikan saldo sumber bila ada.
-- Guard: transaksi hasil penjualan voucher tidak boleh dihapus langsung.
-- ============================================================
create or replace function public.delete_transactions(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_original public.transactions;
  v_reversal public.transactions;
  v_id uuid;
  v_target_ids uuid[] := '{}';
  v_deleted integer := 0;
  v_snapshot jsonb;
  v_refund numeric(14,2);
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

  -- Koreksi saldo: pasangan void/reversal saling meniadakan.
  for v_tx in select * from public.transactions where id = any(v_target_ids) loop
    if v_tx.status = 'void' or v_tx.reversal_of is not null then
      continue;
    end if;
    if v_tx.tipe = 'income' then
      if v_tx.source_wallet_id is not null then
        select coalesce(tc.source_cost, 0) into v_refund
        from public.transaction_costs tc
        where tc.transaction_id = v_tx.id;
        update public.wallets set saldo = saldo + v_refund where id = v_tx.source_wallet_id;
      end if;
      if (select saldo from public.wallets where id = v_tx.wallet_id) < v_tx.nominal then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo - v_tx.nominal where id = v_tx.wallet_id;
    elsif v_tx.tipe = 'expense' then
      update public.wallets set saldo = saldo + v_tx.nominal where id = v_tx.wallet_id;
    elsif v_tx.tipe = 'transfer' then
      update public.wallets set saldo = saldo + v_tx.nominal where id = v_tx.wallet_id;
      update public.wallets set saldo = saldo - v_tx.nominal where id = v_tx.wallet_destination_id;
    end if;
  end loop;

  for v_id in select unnest(v_target_ids) loop
    select to_jsonb(t) into v_snapshot from public.transactions t where t.id = v_id;
    delete from public.transactions where id = v_id;
    insert into public.audit_logs
      (table_name, record_id, action, old_values, actor_id)
    values ('transactions', v_id::text, 'delete', v_snapshot, auth.uid());
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object('deleted', v_deleted);
end;
$$;

-- ============================================================
-- Grants
-- ============================================================
revoke execute on function public.voucher_convert_preview(uuid[]) from public, anon;
revoke execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid) from public, anon;
revoke execute on function public.sell_voucher(uuid, uuid) from public, anon;
revoke execute on function public.wallet_options() from public, anon;
grant execute on function public.voucher_convert_preview(uuid[]) to authenticated;
grant execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid) to authenticated;
grant execute on function public.sell_voucher(uuid, uuid) to authenticated;
grant execute on function public.wallet_options() to authenticated;
