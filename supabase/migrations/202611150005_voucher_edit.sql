-- 202611150005_voucher_edit.sql
-- Edit voucher stok yang belum terjual (kode, produk, wallet, harga beli, harga jual).
-- Voucher terjual/void tidak bisa diedit karena transaksi & saldo sudah terikat.
-- Perubahan harga beli / perpindahan wallet menyesuaikan saldo wallet stok.

create or replace function public.update_voucher_stock(
  p_id uuid,
  p_kode text,
  p_product_id uuid,
  p_wallet_id uuid,
  p_harga_beli numeric,
  p_harga_jual numeric
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

  update public.voucher_stocks
  set kode_voucher = v_kode,
      product_id = p_product_id,
      wallet_id = p_wallet_id,
      harga_beli = p_harga_beli,
      harga_jual = p_harga_jual,
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
    'harga_jual', v_voucher.harga_jual
  );
end;
$$;

revoke execute on function public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.update_voucher_stock(uuid, text, uuid, uuid, numeric, numeric) to authenticated;
