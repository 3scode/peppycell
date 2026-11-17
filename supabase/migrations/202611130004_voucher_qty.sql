-- 202611130004_voucher_qty.sql
-- Konversi voucher mendukung penjualan dengan qty > 1:
--   voucher_convert_preview mengembalikan qty tiap transaksi.
--   convert_sales_to_vouchers menerima kodes[] per transaksi; jumlah kode harus sama dengan qty.
--   Satu transaksi menghasilkan qty voucher, origin_transaction_id boleh berulang.
-- Aturan kelayakan lain tidak berubah.

-- ============================================================
-- Index unik origin tidak lagi berlaku (satu penjualan bisa jadi banyak voucher).
-- ============================================================
drop index if exists public.voucher_stocks_origin_uidx;
create index if not exists voucher_stocks_origin_idx
  on public.voucher_stocks (origin_transaction_id)
  where origin_transaction_id is not null;

-- ============================================================
-- Preview konversi (dipakai dialog)
-- ============================================================
drop function if exists public.voucher_convert_preview(uuid[]);
create function public.voucher_convert_preview(p_ids uuid[])
returns table (
  transaction_id uuid,
  product_id uuid,
  product_name text,
  tanggal timestamptz,
  nominal numeric,
  unit_cost numeric,
  harga_jual numeric,
  qty integer,
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
      coalesce(t.unit_price, t.nominal / greatest(t.qty, 1)) as harga_jual
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
    b.qty,
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
        when base.qty is null or base.qty < 1 then 'Qty transaksi tidak valid.'
        when base.product_id is null then 'Transaksi tanpa produk.'
        when base.unit_cost <= 0 then 'Harga beli produk belum diatur.'
        when coalesce(base.unit_price, base.nominal / greatest(base.qty, 1)) < base.unit_cost then
          'Harga jual di bawah harga beli.'
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
-- Konversi penjualan menjadi stok voucher (N voucher per qty)
-- ============================================================
drop function if exists public.convert_sales_to_vouchers(jsonb, uuid, uuid);
create function public.convert_sales_to_vouchers(
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
  v_kode text;
  v_kodes jsonb;
  v_idx integer;
  v_qty integer;
  v_tx public.transactions;
  v_voucher public.voucher_stocks;
  v_wallet public.wallets;
  v_cash public.wallets;
  v_source public.wallets;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_remaining_cost numeric(14,2);
  v_remaining_source_cost numeric(14,2);
  v_alloc_cost numeric(14,2);
  v_alloc_source_cost numeric(14,2);
  v_remaining_price_sum numeric(14,2);
  v_alloc_price numeric(14,2);
  v_source_cost numeric(14,2);
  v_total_cost numeric(14,2) := 0;
  v_total_count integer := 0;
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
       'Reversal penjualan voucher ' || (select string_agg(btrim(kode), ', ' order by ord)
                                         from jsonb_array_elements_text(v_kodes) with ordinality as t(kode, ord)),
       auth.uid());
    v_cash.saldo := v_new;

    -- 2. Refund modal ke wallet sumber, lalu pakai untuk beli stok (net 0).
    if v_tx.source_wallet_id is not null and v_source_cost > 0 then
      select * into v_source from public.wallets where id = v_tx.source_wallet_id;
      v_new := v_source.saldo + v_source_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_source.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_source.id, v_source.saldo, v_new, v_source_cost,
         'Refund modal penjualan voucher ' || (select string_agg(btrim(kode), ', ' order by ord)
                                               from jsonb_array_elements_text(v_kodes) with ordinality as t(kode, ord)),
         auth.uid());
      v_source.saldo := v_new;

      v_new := v_source.saldo - v_source_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_source.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_source.id, v_source.saldo, v_new, -v_source_cost,
         'Pembelian stok voucher ' || (select string_agg(btrim(kode), ', ' order by ord)
                                       from jsonb_array_elements_text(v_kodes) with ordinality as t(kode, ord)),
         auth.uid());
      v_source.saldo := v_new;
    end if;

    -- 3. Nilai stok masuk ke wallet voucher, per unit (baris pertama menanggung pembulatan).
    v_remaining_cost := v_cost * v_tx.qty;
    v_remaining_source_cost := v_source_cost;
    v_remaining_price_sum := v_price * v_tx.qty;

    for v_idx in 0 .. v_qty - 1 loop
      v_kode := btrim((v_kodes->>v_idx));

      if v_idx = v_qty - 1 then
        v_alloc_cost := v_remaining_cost;
        v_alloc_price := v_remaining_price_sum;
        v_alloc_source_cost := v_remaining_source_cost;
      else
        v_alloc_cost := floor(v_remaining_cost / (v_qty - v_idx));
        v_alloc_price := floor(v_remaining_price_sum / (v_qty - v_idx));
        v_alloc_source_cost := case
          when v_remaining_source_cost = 0 then 0
          else floor(v_remaining_source_cost / (v_qty - v_idx))
        end;
      end if;
      v_remaining_cost := v_remaining_cost - v_alloc_cost;
      v_remaining_price_sum := v_remaining_price_sum - v_alloc_price;
      v_remaining_source_cost := v_remaining_source_cost - v_alloc_source_cost;

      select * into v_wallet from public.wallets where id = p_wallet_id;
      v_new := v_wallet.saldo + v_alloc_cost;
      update public.wallets set saldo = v_new, updated_at = now() where id = v_wallet.id;
      insert into public.wallet_adjustments
        (wallet_id, old_balance, new_balance, delta, reason, actor_id)
      values
        (v_wallet.id, v_wallet.saldo, v_new, v_alloc_cost,
         'Stok voucher ' || v_kode || ' masuk', auth.uid());
      v_wallet.saldo := v_new;

      insert into public.voucher_stocks
        (kode_voucher, product_id, wallet_id, harga_beli, harga_jual,
         origin_transaction_id, client_request_id, converted_by)
      values
        (v_kode, v_tx.product_id, p_wallet_id, v_alloc_cost, v_alloc_price,
         v_tx.id, p_client_request_id, auth.uid())
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

revoke execute on function public.voucher_convert_preview(uuid[]) from public, anon;
revoke execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid) from public, anon;
grant execute on function public.voucher_convert_preview(uuid[]) to authenticated;
grant execute on function public.convert_sales_to_vouchers(jsonb, uuid, uuid) to authenticated;
