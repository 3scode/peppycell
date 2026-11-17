-- 202611150007_voucher_convert_tanggal.sql
-- Konversi voucher sekarang:
--   1. Menerima p_tanggal (default hari ini WIB, tidak boleh tanggal masa depan).
--      Voucher mendapatkan converted_at pada tanggal itu ("Masuk" di /vouchers),
--      dan jurnal pembelian stok dicatat pada tanggal yang sama.
--   2. Satu jurnal transaksi tipe transfer per voucher, dari wallet modal/sumber
--      (fallback: wallet hasil jual) ke wallet voucher, senilai harga beli unit.
--      Jurnal ini muncul di /transactions dan tertaut ke voucher lewat
--      voucher_stocks.entry_transaction_id, sehingga:
--        - tampil di /transactions sebagai "Pembelian stok voucher <kode>";
--        - saat tanggal masuk voucher diubah di /vouchers, tanggal jurnal ikut digeser.
--   3. Tidak lagi mengkredit wallet voucher tanpa jejak di jurnal;
--      kredit wallet voucher diwakili jurnal transfer per voucher.
-- Saldo akhir dan biaya per unit tidak berubah. Jurnal manual "Refund modal"
-- tetap dibuat dulu di wallet sumber (net 0, sebagai catatan pembatalan sumber),
-- baru transfer pembelian stok. Jurnal transfer ini TIDAK dipakai untuk membayar
-- payout/periode manapun, karena tipe transfer tidak memengaruhi laba.
--
-- Perubahan signature:
--   (jsonb, uuid, uuid) -> (jsonb, uuid, uuid, date)
--   (uuid, text, uuid, uuid, numeric, numeric) -> + p_tanggal date default null
-- Pemanggil lama yang tidak mengirim p_tanggal tetap berjalan.
-- Data lama: voucher yang sudah ada tidak punya entry_transaction_id dan tidak
-- difabrikasi. Jurnal yang sudah terlanjur dibuat oleh versi sebelumnya dihapus
-- tidak mungkin dilakukan otomatis — versi itu belum pernah ter-apply ke produksi.

-- ============================================================
-- 1. Kolom relasi voucher -> jurnal pembelian stok.
-- ============================================================
alter table public.voucher_stocks
  add column if not exists entry_transaction_id uuid;

create index if not exists voucher_stocks_entry_transaction_idx
  on public.voucher_stocks (entry_transaction_id)
  where entry_transaction_id is not null;

-- ============================================================
-- 2. Konversi penjualan menjadi stok voucher (N voucher per qty).
-- ============================================================
drop function if exists public.convert_sales_to_vouchers(jsonb, uuid, uuid);
drop function if exists public.convert_sales_to_vouchers(jsonb, uuid, uuid, date);

create function public.convert_sales_to_vouchers(
  p_items jsonb,
  p_wallet_id uuid,
  p_client_request_id uuid,
  p_tanggal date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_item jsonb;
  v_kode text;
  v_kodes jsonb;
  v_idx integer;
  v_qty integer;
  v_tx public.transactions;
  v_journal public.transactions;
  v_voucher public.voucher_stocks;
  v_wallet public.wallets;
  v_cash public.wallets;
  v_source public.wallets;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_remaining_cost numeric(14,2);
  v_remaining_price_sum numeric(14,2);
  v_remaining_source_cost numeric(14,2);
  v_alloc_cost numeric(14,2);
  v_alloc_price numeric(14,2);
  v_alloc_source_cost numeric(14,2);
  v_source_cost numeric(14,2);
  v_journal_from uuid;
  v_total_cost numeric(14,2) := 0;
  v_total_count integer := 0;
  v_new numeric(14,2);
  v_date date;
  v_tanggal timestamptz;
  v_kode_list text;
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

  -- Tanggal masuk voucher: default hari ini WIB, tidak boleh tanggal masa depan.
  v_date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:Tanggal masuk tidak boleh lebih dari hari ini.' using errcode = '22023';
  end if;
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

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
        ) order by vs.converted_at, vs.kode_voucher)
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

  -- Validasi bentuk item + kumpulkan seluruh kode untuk cek duplikat global.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kodes := v_item->'kodes';
    if v_kodes is null or jsonb_typeof(v_kodes) <> 'array' then
      raise exception 'VALIDATION_ERROR:Kode voucher tidak valid.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_kodes) = 0 then
      raise exception 'VALIDATION_ERROR:Pilih minimal satu kode voucher.' using errcode = '22023';
    end if;
    for v_kode in select btrim(kode) from jsonb_array_elements_text(v_kodes) as t(kode) loop
      if char_length(v_kode) < 3 or char_length(v_kode) > 80 then
        raise exception 'VALIDATION_ERROR:Kode voucher harus 3-80 karakter.' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if (
    select count(*) from (
      select distinct lower(btrim(kode))
      from jsonb_array_elements(p_items) x, jsonb_array_elements_text(x->'kodes') as t(kode)
    ) s
  ) <> (
    select coalesce(sum(jsonb_array_length(x->'kodes')), 0) from jsonb_array_elements(p_items) x
  ) then
    raise exception 'VALIDATION_ERROR:Kode voucher tidak boleh sama.' using errcode = '22023';
  end if;

  -- Maksimal 50 voucher per request dihitung dari total kode.
  if (
    select coalesce(sum(jsonb_array_length(x->'kodes')), 0) from jsonb_array_elements(p_items) x
  ) > 50 then
    raise exception 'VALIDATION_ERROR:Maksimal 50 voucher sekali konversi.' using errcode = '22023';
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
    v_kodes := v_item->'kodes';
    v_qty := jsonb_array_length(v_kodes);
    v_kode_list := (
      select string_agg(btrim(kode), ', ' order by ord)
      from jsonb_array_elements_text(v_kodes) with ordinality as t(kode, ord)
    );

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
    if v_tx.qty is null or v_tx.qty < 1 then
      raise exception 'CONFLICT:Qty transaksi tidak valid.' using errcode = 'P0001';
    end if;
    if v_tx.qty <> v_qty then
      raise exception 'CONFLICT:Jumlah kode voucher harus sama dengan qty transaksi.' using errcode = 'P0001';
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
      select 1 from public.voucher_stocks
      where lower(btrim(kode_voucher)) in (
        select lower(btrim(kode)) from jsonb_array_elements_text(v_kodes) as t(kode)
      )
    ) then
      raise exception 'CONFLICT:Ada kode voucher yang sudah dipakai.' using errcode = 'P0001';
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
    select coalesce(tc.source_cost, 0) into v_source_cost
    from public.transaction_costs tc
    where tc.transaction_id = v_tx.id;
    v_source_cost := coalesce(v_source_cost, 0);

    v_price := coalesce(v_tx.unit_price, v_tx.nominal / greatest(v_tx.qty, 1));
    if v_price < v_cost then
      raise exception 'CONFLICT:Harga jual di bawah harga beli.' using errcode = 'P0001';
    end if;

    -- 1. Batalkan hasil jual di wallet penerima sekaligus.
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
       'Reversal penjualan voucher ' || v_kode_list,
       auth.uid());
    v_cash.saldo := v_new;

    -- 2. Refund modal ke wallet sumber (bila ada). Tanpa jurnal: ini hanya
    --    pemindahan nilai antara wallet sumber dan pembelian stok.
    v_journal_from := v_tx.wallet_id;
    if v_tx.source_wallet_id is not null and v_source_cost > 0 then
      select * into v_source from public.wallets where id = v_tx.source_wallet_id;
      v_new := v_source.saldo + v_source_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_source.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_source.id, v_source.saldo, v_new, v_source_cost,
         'Refund modal penjualan voucher ' || v_kode_list,
         auth.uid());
      v_source.saldo := v_new;
      v_journal_from := v_source.id;
    end if;

    -- 3. Allokasikan biaya & harga per unit; buat jurnal pembelian stok
    --    per voucher sebagai transfer modal/sumber -> wallet voucher.
    v_remaining_cost := v_cost * v_tx.qty;
    v_remaining_price_sum := v_price * v_tx.qty;
    v_remaining_source_cost := v_source_cost;

    select * into v_cash from public.wallets where id = v_journal_from;

    for v_idx in 0 .. v_qty - 1 loop
      v_kode := btrim((v_kodes->>v_idx));

      if v_idx = v_qty - 1 then
        v_alloc_cost := v_remaining_cost;
        v_alloc_price := v_remaining_price_sum;
      else
        v_alloc_cost := floor(v_remaining_cost / (v_qty - v_idx));
        v_alloc_price := floor(v_remaining_price_sum / (v_qty - v_idx));
      end if;
      v_remaining_cost := v_remaining_cost - v_alloc_cost;
      v_remaining_price_sum := v_remaining_price_sum - v_alloc_price;
      v_remaining_source_cost := v_remaining_source_cost - v_alloc_source_cost;

      if v_cash.saldo < v_alloc_cost then
        raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk membeli stok voucher Rp %.',
          v_cash.nama_wallet, v_cash.saldo::bigint, v_alloc_cost::bigint using errcode = 'P0001';
      end if;

      insert into public.transactions
        (tanggal, tipe, kategori, nominal, qty, wallet_id, wallet_destination_id,
         keterangan, user_id, client_request_id)
      values
        (v_tanggal, 'transfer', 'transfer', v_alloc_cost, 1, v_journal_from, p_wallet_id,
         'Pembelian stok voucher ' || v_kode, auth.uid(), gen_random_uuid())
      returning * into v_journal;

      v_new := v_cash.saldo - v_alloc_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_cash.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_cash.id, v_cash.saldo, v_new, -v_alloc_cost,
         'Pembelian stok voucher ' || v_kode, auth.uid());
      v_cash.saldo := v_new;

      select * into v_wallet from public.wallets where id = p_wallet_id;
      v_new := v_wallet.saldo + v_alloc_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_wallet.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_wallet.id, v_wallet.saldo, v_new, v_alloc_cost,
         'Stok voucher ' || v_kode || ' masuk', auth.uid());
      v_wallet.saldo := v_new;

      insert into public.audit_logs
        (table_name, record_id, action, new_values, actor_id)
      values
        ('transactions', v_journal.id::text, 'insert', to_jsonb(v_journal), auth.uid());

      insert into public.voucher_stocks
        (kode_voucher, product_id, wallet_id, harga_beli, harga_jual,
         origin_transaction_id, entry_transaction_id, client_request_id,
         converted_by, converted_at)
      values
        (v_kode, v_tx.product_id, p_wallet_id, v_alloc_cost, v_alloc_price,
         v_tx.id, v_journal.id, p_client_request_id, auth.uid(), v_tanggal)
      returning * into v_voucher;

      insert into public.audit_logs
        (table_name, record_id, action, old_values, new_values, actor_id)
      values
        ('voucher_stocks', v_voucher.id::text, 'voucher_convert',
         to_jsonb(v_tx), to_jsonb(v_voucher), auth.uid());

      v_total_cost := v_total_cost + v_alloc_cost;
      v_total_count := v_total_count + 1;
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

    delete from public.transaction_costs where transaction_id = v_tx.id;
    delete from public.transactions where id = v_tx.id;
  end loop;

  return jsonb_build_object(
    'duplicate', false,
    'total_cost', v_total_cost,
    'count', v_total_count,
    'vouchers', v_result
  );
end;
$$;

revoke execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid, date) from public, anon;
grant execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid, date) to authenticated;

-- ============================================================
-- 3. Update voucher stok: tambah p_tanggal (default null = tidak diubah).
--    Perubahan tanggal masuk menggeser jurnal pembelian stok dan converted_at
--    barang voucher. Jurnal lama yang tidak tertaut (voucher sebelum migrasi ini)
--    tidak digeser.
-- ============================================================
drop function if exists public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric);
drop function if exists public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric, date);

create function public.update_voucher_stock(
  p_id uuid,
  p_kode text,
  p_product_id uuid,
  p_wallet_id uuid,
  p_harga_beli numeric,
  p_harga_jual numeric,
  p_tanggal date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_voucher public.voucher_stocks;
  v_product public.products;
  v_wallet public.wallets;
  v_other_wallet public.wallets;
  v_kode text;
  v_kode_key text;
  v_delta numeric(14,2);
  v_new numeric(14,2);
  v_kode_label text;
  v_date date;
  v_tanggal timestamptz;
  v_journal_date_changed boolean := false;
begin
  if v_role is null or v_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'VALIDATION_ERROR:Voucher tidak valid.' using errcode = '22023';
  end if;

  select * into v_voucher from public.voucher_stocks where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND:Voucher tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_voucher.status <> 'available' then
    raise exception 'CONFLICT:Voucher terjual/void tidak bisa diedit.' using errcode = 'P0001';
  end if;

  v_kode := btrim(coalesce(p_kode, ''));
  if char_length(v_kode) < 3 or char_length(v_kode) > 80 then
    raise exception 'VALIDATION_ERROR:Kode voucher harus 3-80 karakter.' using errcode = '22023';
  end if;
  v_kode_key := lower(v_kode);
  if exists (
    select 1 from public.voucher_stocks vs
    where vs.id <> p_id and lower(btrim(vs.kode_voucher)) = v_kode_key
  ) then
    raise exception 'CONFLICT:Kode voucher % sudah dipakai.', v_kode using errcode = 'P0001';
  end if;
  v_kode_label := v_kode;

  if p_harga_beli is null or p_harga_beli < 0 then
    raise exception 'VALIDATION_ERROR:Harga beli tidak valid.' using errcode = '22023';
  end if;
  if p_harga_jual is null or p_harga_jual < 0 then
    raise exception 'VALIDATION_ERROR:Harga jual tidak valid.' using errcode = '22023';
  end if;

  v_date := p_tanggal;
  if v_date is not null then
    if v_date > (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'VALIDATION_ERROR:Tanggal masuk tidak boleh lebih dari hari ini.' using errcode = '22023';
    end if;
    v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';
    if (v_voucher.converted_at at time zone 'Asia/Jakarta')::date <> v_date then
      v_journal_date_changed := true;
    end if;
  end if;

  select * into v_product from public.products
  where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND:Produk tidak ditemukan.' using errcode = 'P0002';
  end if;

  if p_wallet_id is null then
    raise exception 'VALIDATION_ERROR:Pilih wallet voucher.' using errcode = '22023';
  end if;

  -- Kunci dua wallet yang terlibat (id urut) agar konsisten & tanpa deadlock.
  perform 1 from public.wallets
  where id in (v_voucher.wallet_id, p_wallet_id)
  order by id
  for update;

  select * into v_wallet from public.wallets
  where id = p_wallet_id and is_active = true and deleted_at is null;
  if not found then
    raise exception 'WALLET_INACTIVE:Wallet voucher tidak aktif.' using errcode = 'P0002';
  end if;

  if p_wallet_id = v_voucher.wallet_id then
    -- Wallet sama: sesuaikan nilai stok (delta).
    v_delta := p_harga_beli - v_voucher.harga_beli;
    if v_delta <> 0 then
      v_new := v_wallet.saldo + v_delta;
      if v_new < 0 then
        raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk menurunkan nilai stok.',
          v_wallet.nama_wallet, v_wallet.saldo::bigint using errcode = 'P0001';
      end if;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_wallet.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_wallet.id, v_wallet.saldo, v_new, v_delta,
         'Penyesuaian nilai stok voucher ' || v_kode_label, auth.uid());
    end if;
  else
    -- Wallet berbeda: pindahkan nilai stok lama keluar, nilai baru masuk.
    select * into v_other_wallet from public.wallets where id = v_voucher.wallet_id;
    if not found then
      raise exception 'NOT_FOUND:Wallet stok lama tidak ditemukan.' using errcode = 'P0002';
    end if;

    if v_other_wallet.saldo < v_voucher.harga_beli then
      raise exception 'INSUFFICIENT_BALANCE:Saldo % Rp % tidak cukup untuk melepas stok voucher Rp %.',
        v_other_wallet.nama_wallet, v_other_wallet.saldo::bigint, v_voucher.harga_beli::bigint
        using errcode = 'P0001';
    end if;

    v_new := v_other_wallet.saldo - v_voucher.harga_beli;
    update public.wallets set saldo = v_new, updated_at = now() where id = v_other_wallet.id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_other_wallet.id, v_other_wallet.saldo, v_new, -v_voucher.harga_beli,
       'Voucher ' || v_kode_label || ' dipindah keluar dari stok', auth.uid());

    v_new := v_wallet.saldo + p_harga_beli;
    update public.wallets set saldo = v_new, updated_at = now() where id = v_wallet.id;
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_wallet.id, v_wallet.saldo, v_new, p_harga_beli,
       'Voucher ' || v_kode_label || ' masuk ke stok baru', auth.uid());
  end if;

  -- Geser tanggal jurnal pembelian stok (bila tertaut) & approved tanggal masuk.
  if v_journal_date_changed and v_voucher.entry_transaction_id is not null then
    update public.transactions
    set tanggal = v_tanggal, updated_at = now()
    where id = v_voucher.entry_transaction_id;
  end if;

  -- Bila harga beli berubah dan jurnal tertaut, ikuti nominal jurnal.
  if v_voucher.entry_transaction_id is not null and p_harga_beli <> v_voucher.harga_beli then
    update public.transactions
    set nominal = p_harga_beli, updated_at = now()
    where id = v_voucher.entry_transaction_id;
  end if;

  -- Bila wallet voucher berubah dan jurnal tertaut, ikuti wallet tujuan.
  if v_voucher.entry_transaction_id is not null and p_wallet_id <> v_voucher.wallet_id then
    update public.transactions
    set wallet_destination_id = p_wallet_id, updated_at = now()
    where id = v_voucher.entry_transaction_id;
  end if;

  update public.voucher_stocks
  set kode_voucher = v_kode,
      product_id = p_product_id,
      wallet_id = p_wallet_id,
      harga_beli = p_harga_beli,
      harga_jual = p_harga_jual,
      converted_at = coalesce(v_tanggal, converted_at),
      updated_at = now()
  where id = p_id
  returning * into v_voucher;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values
    ('voucher_stocks', p_id::text, 'voucher_update',
     jsonb_build_object(
       'kode_voucher', v_voucher.kode_voucher,
       'product_id', v_voucher.product_id,
       'wallet_id', v_voucher.wallet_id,
       'harga_beli', v_voucher.harga_beli,
       'harga_jual', v_voucher.harga_jual
     ),
     jsonb_build_object(
       'kode_voucher', v_kode,
       'product_id', p_product_id,
       'wallet_id', p_wallet_id,
       'harga_beli', p_harga_beli,
       'harga_jual', p_harga_jual
     ),
     auth.uid());

  return jsonb_build_object(
    'id', v_voucher.id,
    'kode', v_voucher.kode_voucher,
    'product_id', v_voucher.product_id,
    'product_name', v_product.nama_produk,
    'wallet_id', v_voucher.wallet_id,
    'wallet_name', v_wallet.nama_wallet,
    'harga_beli', v_voucher.harga_beli,
    'harga_jual', v_voucher.harga_jual,
    'converted_at', v_voucher.converted_at
  );
end;
$$;

revoke execute on function public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric, date) from public, anon;
grant execute on function public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric, date) to authenticated;
