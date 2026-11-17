-- 202611070006_functions.sql
-- Trigger & RPC bisnis. Semua fungsi bisnis security definer + search_path aman.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger wallets_updated_at before update on public.wallets
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_costs_updated_at before update on public.product_costs
for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.set_updated_at();
create trigger payout_settings_updated_at before update on public.payout_settings
for each row execute function public.set_updated_at();

-- Profil dibuat otomatis saat user diundang lewat Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_share numeric(5,2);
begin
  v_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'karyawan');
  v_share := coalesce((new.raw_user_meta_data->>'default_profit_share')::numeric, 0);
  insert into public.users (id, email, full_name, role, default_profit_share, invited_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    v_role,
    least(greatest(v_share, 0), 100),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Self-update tidak boleh mengubah role, porsi, status, email; admin terakhir dilindungi.
create or replace function public.guard_user_update()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.default_profit_share := old.default_profit_share;
    new.is_active := old.is_active;
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or new.is_active = false) then
    if not exists (
      select 1 from public.users
      where role = 'admin' and is_active = true and id <> old.id
    ) then
      raise exception 'CONFLICT:admin terakhir tidak boleh dinonaktifkan/diturunkan'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger users_guard_update before update on public.users
for each row execute function public.guard_user_update();

-- Harga beli tidak boleh melebihi harga jual produk.
create or replace function public.assert_product_margin()
returns trigger
language plpgsql
as $$
declare
  v_price numeric(14,2);
begin
  select harga_jual into v_price from public.products where id = new.product_id;
  if v_price is null then
    raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
  end if;
  if new.harga_beli > v_price then
    raise exception 'INVALID_MARGIN:harga beli melebihi harga jual' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger product_costs_margin_check
before insert or update on public.product_costs
for each row execute function public.assert_product_margin();

-- ============================================================
-- Penjualan
-- ============================================================
create or replace function public.create_sale(
  p_product_id uuid,
  p_qty integer,
  p_keterangan text,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_product public.products;
  v_cost numeric(14,2);
  v_wallet public.wallets;
  v_tx public.transactions;
  v_nominal numeric(14,2);
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_product_id is null or p_client_request_id is null then
    raise exception 'VALIDATION_ERROR:payload' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions
  where client_request_id = p_client_request_id and user_id = auth.uid();
  if found then
    if v_tx.product_id is distinct from p_product_id or v_tx.qty is distinct from p_qty then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_product from public.products where id = v_tx.product_id;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    return jsonb_build_object(
      'id', v_tx.id, 'nama_produk', v_product.nama_produk, 'qty', v_tx.qty,
      'subtotal', v_tx.nominal, 'wallet_nama', v_wallet.nama_wallet,
      'tanggal', v_tx.tanggal, 'duplicate', true
    );
  end if;

  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
  end if;
  if p_keterangan is not null and char_length(btrim(p_keterangan)) > 200 then
    raise exception 'VALIDATION_ERROR:keterangan' using errcode = '22023';
  end if;

  select * into v_product from public.products
  where id = p_product_id and is_active = true;
  if not found then
    raise exception 'PRODUCT_INACTIVE' using errcode = 'P0002';
  end if;

  select harga_beli into v_cost from public.product_costs where product_id = p_product_id;
  if v_cost is null then
    raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
  end if;

  select * into v_wallet from public.wallets
  where is_default = true and is_active = true
  for update;
  if not found then
    raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
  end if;

  v_nominal := v_product.harga_jual * p_qty;

  insert into public.transactions
    (tipe, kategori, nominal, qty, unit_price, wallet_id, product_id, keterangan,
     user_id, client_request_id)
  values
    ('income', 'penjualan', v_nominal, p_qty, v_product.harga_jual, v_wallet.id,
     v_product.id, nullif(btrim(p_keterangan), ''), auth.uid(), p_client_request_id)
  returning * into v_tx;

  insert into public.transaction_costs (transaction_id, unit_cost, margin)
  values (v_tx.id, v_cost, (v_product.harga_jual - v_cost) * p_qty);

  update public.wallets set saldo = saldo + v_nominal where id = v_wallet.id;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'id', v_tx.id,
    'nama_produk', v_product.nama_produk,
    'qty', p_qty,
    'subtotal', v_nominal,
    'wallet_nama', v_wallet.nama_wallet,
    'tanggal', v_tx.tanggal,
    'duplicate', false
  );
exception
  when unique_violation then
    select * into v_tx from public.transactions where client_request_id = p_client_request_id;
    if not found or v_tx.user_id is distinct from auth.uid() then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_tx.product_id is distinct from p_product_id or v_tx.qty is distinct from p_qty then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_product from public.products where id = v_tx.product_id;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    return jsonb_build_object(
      'id', v_tx.id, 'nama_produk', v_product.nama_produk, 'qty', v_tx.qty,
      'subtotal', v_tx.nominal, 'wallet_nama', v_wallet.nama_wallet,
      'tanggal', v_tx.tanggal, 'duplicate', true
    );
end;
$$;

-- ============================================================
-- Pengeluaran
-- ============================================================
create or replace function public.create_expense(
  p_wallet_id uuid,
  p_nominal numeric,
  p_kategori text,
  p_keterangan text,
  p_tanggal date,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_wallet public.wallets;
  v_tx public.transactions;
  v_tanggal timestamptz;
  v_request uuid := coalesce(p_client_request_id, gen_random_uuid());
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_kategori not in ('operasional', 'gaji', 'deviden', 'lainnya') then
    raise exception 'VALIDATION_ERROR:kategori' using errcode = '22023';
  end if;
  if p_nominal is null or p_nominal <= 0 or p_nominal <> trunc(p_nominal) then
    raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
  end if;
  if p_keterangan is null or char_length(btrim(p_keterangan)) not between 5 and 200 then
    raise exception 'VALIDATION_ERROR:keterangan' using errcode = '22023';
  end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions
  where client_request_id = v_request and user_id = auth.uid();
  if found then
    if v_tx.tipe <> 'expense' or v_tx.nominal <> p_nominal
       or v_tx.kategori <> p_kategori
       or (v_tx.tanggal at time zone 'Asia/Jakarta')::date <> p_tanggal then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    return jsonb_build_object(
      'id', v_tx.id, 'nominal', v_tx.nominal, 'kategori', v_tx.kategori,
      'wallet_nama', v_wallet.nama_wallet, 'tanggal', v_tx.tanggal, 'duplicate', true
    );
  end if;

  if v_role = 'admin' and p_wallet_id is not null then
    select * into v_wallet from public.wallets
    where id = p_wallet_id and is_active = true for update;
  else
    select * into v_wallet from public.wallets
    where is_default = true and is_active = true for update;
  end if;
  if not found then
    raise exception 'WALLET_INACTIVE' using errcode = 'P0002';
  end if;
  if v_wallet.saldo < p_nominal then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  v_tanggal := (p_tanggal::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  insert into public.transactions
    (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, keterangan,
     user_id, client_request_id)
  values
    (v_tanggal, 'expense', p_kategori, p_nominal, 1, null, v_wallet.id,
     btrim(p_keterangan), auth.uid(), v_request)
  returning * into v_tx;

  update public.wallets set saldo = saldo - p_nominal where id = v_wallet.id;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'id', v_tx.id, 'nominal', v_tx.nominal, 'kategori', v_tx.kategori,
    'wallet_nama', v_wallet.nama_wallet, 'tanggal', v_tx.tanggal,
    'saldo_baru', case when v_role = 'admin' then v_wallet.saldo - p_nominal else null end,
    'duplicate', false
  );
end;
$$;

-- ============================================================
-- Transfer & penyesuaian saldo
-- ============================================================
create or replace function public.transfer_wallet(
  p_from_id uuid,
  p_to_id uuid,
  p_nominal numeric,
  p_keterangan text,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.wallets;
  v_to public.wallets;
  v_tx public.transactions;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_from_id is null or p_to_id is null or p_from_id = p_to_id then
    raise exception 'SAME_WALLET' using errcode = '22023';
  end if;
  if p_nominal is null or p_nominal <= 0 or p_nominal <> trunc(p_nominal) then
    raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
  end if;
  if p_keterangan is null or char_length(btrim(p_keterangan)) not between 5 and 200 then
    raise exception 'VALIDATION_ERROR:keterangan' using errcode = '22023';
  end if;
  if p_client_request_id is null then
    raise exception 'VALIDATION_ERROR:client_request_id' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions
  where client_request_id = p_client_request_id;
  if found then
    if v_tx.tipe <> 'transfer' or v_tx.wallet_id <> p_from_id
       or v_tx.wallet_destination_id <> p_to_id or v_tx.nominal <> p_nominal then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', v_tx.id, 'tanggal', v_tx.tanggal, 'duplicate', true);
  end if;

  perform 1 from public.wallets
  where id in (p_from_id, p_to_id)
  order by id
  for update;

  select * into v_from from public.wallets where id = p_from_id and is_active = true;
  if not found then raise exception 'WALLET_INACTIVE:asal' using errcode = 'P0002'; end if;
  select * into v_to from public.wallets where id = p_to_id and is_active = true;
  if not found then raise exception 'WALLET_INACTIVE:tujuan' using errcode = 'P0002'; end if;
  if v_from.saldo < p_nominal then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.transactions
    (tipe, kategori, nominal, qty, wallet_id, wallet_destination_id, keterangan,
     user_id, client_request_id)
  values
    ('transfer', 'transfer', p_nominal, 1, p_from_id, p_to_id, btrim(p_keterangan),
     auth.uid(), p_client_request_id)
  returning * into v_tx;

  update public.wallets set saldo = saldo - p_nominal where id = p_from_id;
  update public.wallets set saldo = saldo + p_nominal where id = p_to_id;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'id', v_tx.id, 'nominal', p_nominal, 'from_nama', v_from.nama_wallet,
    'to_nama', v_to.nama_wallet, 'saldo_asal', v_from.saldo - p_nominal,
    'saldo_tujuan', v_to.saldo + p_nominal, 'tanggal', v_tx.tanggal, 'duplicate', false
  );
end;
$$;

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

-- ============================================================
-- Void transaksi (reversal journal)
-- ============================================================
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

  perform 1 from public.wallets
  where id in (v_orig.wallet_id, coalesce(v_orig.wallet_destination_id, v_orig.wallet_id))
  order by id
  for update;

  if v_orig.tipe = 'income' then
    insert into public.transactions
      (tipe, kategori, nominal, qty, unit_price, wallet_id, product_id, keterangan,
       user_id, status, reversal_of, client_request_id)
    values
      ('income', v_orig.kategori, v_orig.nominal, v_orig.qty, v_orig.unit_price,
       v_orig.wallet_id, v_orig.product_id,
       'Pembatalan: ' || coalesce(v_orig.keterangan, v_orig.id::text),
       auth.uid(), 'active', v_orig.id, gen_random_uuid())
    returning * into v_rev;

    insert into public.transaction_costs (transaction_id, unit_cost, margin)
    select v_rev.id, unit_cost, -margin from public.transaction_costs
    where transaction_id = v_orig.id;

    update public.wallets set saldo = saldo - v_orig.nominal where id = v_orig.wallet_id;

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

-- ============================================================
-- Produk & wallet
-- ============================================================
create or replace function public.upsert_product(
  p_id uuid,
  p_nama text,
  p_operator text,
  p_harga_beli numeric,
  p_harga_jual numeric
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products;
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_nama is null or char_length(btrim(p_nama)) not between 2 and 60 then
    raise exception 'VALIDATION_ERROR:nama' using errcode = '22023';
  end if;
  if p_operator is null or char_length(btrim(p_operator)) not between 1 and 40 then
    raise exception 'VALIDATION_ERROR:operator' using errcode = '22023';
  end if;
  if p_harga_jual is null or p_harga_jual <= 0 or p_harga_jual <> trunc(p_harga_jual)
     or p_harga_beli is null or p_harga_beli < 0 or p_harga_beli <> trunc(p_harga_beli) then
    raise exception 'VALIDATION_ERROR:harga' using errcode = '22023';
  end if;
  if p_harga_beli > p_harga_jual then
    raise exception 'INVALID_MARGIN' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.products (nama_produk, operator, harga_jual)
    values (btrim(p_nama), btrim(p_operator), p_harga_jual)
    returning * into v_product;

    insert into public.product_costs (product_id, harga_beli, updated_by)
    values (v_product.id, p_harga_beli, auth.uid());
  else
    select to_jsonb(p) into v_old from public.products p where p.id = p_id;
    if v_old is null then raise exception 'NOT_FOUND:produk' using errcode = 'P0002'; end if;

    update public.products
    set nama_produk = btrim(p_nama), operator = btrim(p_operator), harga_jual = p_harga_jual
    where id = p_id
    returning * into v_product;

    insert into public.product_costs (product_id, harga_beli, updated_by)
    values (p_id, p_harga_beli, auth.uid())
    on conflict (product_id) do update
      set harga_beli = excluded.harga_beli,
          updated_by = excluded.updated_by,
          updated_at = now();
  end if;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values
    ('products', v_product.id::text, case when p_id is null then 'insert' else 'update' end,
     v_old, to_jsonb(v_product), auth.uid());

  return jsonb_build_object(
    'id', v_product.id, 'nama_produk', v_product.nama_produk,
    'operator', v_product.operator, 'harga_jual', v_product.harga_jual,
    'harga_beli', p_harga_beli, 'is_active', v_product.is_active
  );
end;
$$;

create or replace function public.create_wallet(
  p_nama text,
  p_tipe public.wallet_type,
  p_saldo_awal numeric,
  p_is_default boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_nama is null or char_length(btrim(p_nama)) not between 1 and 40 then
    raise exception 'VALIDATION_ERROR:nama' using errcode = '22023';
  end if;
  if p_saldo_awal is null or p_saldo_awal < 0 or p_saldo_awal <> trunc(p_saldo_awal) then
    raise exception 'VALIDATION_ERROR:saldo' using errcode = '22023';
  end if;

  if coalesce(p_is_default, false) then
    update public.wallets set is_default = false where is_default = true;
  end if;

  insert into public.wallets (nama_wallet, tipe, saldo, is_default)
  values (btrim(p_nama), p_tipe, p_saldo_awal, coalesce(p_is_default, false))
  returning * into v_wallet;

  if p_saldo_awal > 0 then
    insert into public.wallet_adjustments
      (wallet_id, old_balance, new_balance, delta, reason, actor_id)
    values
      (v_wallet.id, 0, p_saldo_awal, p_saldo_awal, 'Saldo awal wallet', auth.uid());
  end if;

  insert into public.audit_logs
    (table_name, record_id, action, new_values, actor_id)
  values ('wallets', v_wallet.id::text, 'insert', to_jsonb(v_wallet), auth.uid());

  return to_jsonb(v_wallet);
end;
$$;

create or replace function public.update_wallet(
  p_id uuid,
  p_nama text,
  p_tipe public.wallet_type,
  p_is_default boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_nama is null or char_length(btrim(p_nama)) not between 1 and 40 then
    raise exception 'VALIDATION_ERROR:nama' using errcode = '22023';
  end if;

  select * into v_wallet from public.wallets where id = p_id for update;
  if not found then raise exception 'NOT_FOUND:wallet' using errcode = 'P0002'; end if;
  if not v_wallet.is_active and coalesce(p_is_default, false) then
    raise exception 'WALLET_INACTIVE' using errcode = 'P0002';
  end if;
  v_old := to_jsonb(v_wallet);

  if coalesce(p_is_default, false) then
    update public.wallets set is_default = false where is_default = true and id <> p_id;
  end if;

  update public.wallets
  set nama_wallet = btrim(p_nama), tipe = p_tipe, is_default = coalesce(p_is_default, false)
  where id = p_id
  returning * into v_wallet;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values ('wallets', p_id::text, 'update', v_old, to_jsonb(v_wallet), auth.uid());

  return to_jsonb(v_wallet);
end;
$$;

create or replace function public.toggle_wallet(
  p_id uuid,
  p_is_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_wallet from public.wallets where id = p_id for update;
  if not found then raise exception 'NOT_FOUND:wallet' using errcode = 'P0002'; end if;

  if p_is_active = false then
    if v_wallet.is_default then
      raise exception 'CONFLICT:wallet default tidak boleh nonaktif' using errcode = 'P0001';
    end if;
    if v_wallet.saldo > 0 then
      raise exception 'CONFLICT:saldo harus 0 sebelum nonaktif' using errcode = 'P0001';
    end if;
  end if;

  update public.wallets set is_active = p_is_active where id = p_id
  returning * into v_wallet;

  insert into public.audit_logs
    (table_name, record_id, action, new_values, actor_id)
  values ('wallets', p_id::text, case when p_is_active then 'activate' else 'deactivate' end,
          to_jsonb(v_wallet), auth.uid());

  return to_jsonb(v_wallet);
end;
$$;

-- ============================================================
-- Payout settings, preview, eksekusi
-- ============================================================
create or replace function public.update_payout_settings(
  p_retained numeric,
  p_admin numeric,
  p_investor numeric,
  p_employee numeric
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.payout_settings;
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_retained not between 0 and 100 or p_admin not between 0 and 100
     or p_investor not between 0 and 100 or p_employee not between 0 and 100
     or (p_retained + p_admin + p_investor + p_employee) <> 100 then
    raise exception 'INVALID_ALLOCATION' using errcode = '22023';
  end if;

  select to_jsonb(s) into v_old from public.payout_settings s where s.id = 1;

  insert into public.payout_settings as s
    (id, retained_pct, admin_pct, investor_pct, employee_pct, updated_by)
  values (1, p_retained, p_admin, p_investor, p_employee, auth.uid())
  on conflict (id) do update
    set retained_pct = excluded.retained_pct,
        admin_pct = excluded.admin_pct,
        investor_pct = excluded.investor_pct,
        employee_pct = excluded.employee_pct,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values ('payout_settings', '1', 'update', v_old, to_jsonb(v_row), auth.uid());

  return to_jsonb(v_row);
end;
$$;

create or replace function public.build_payout_items(
  p_admin_pool numeric,
  p_investor_pool numeric,
  p_employee_pool numeric
) returns table (
  user_id uuid,
  category public.payout_category,
  weight_pct numeric(5,2),
  amount numeric(14,2)
)
language sql stable security definer
set search_path = public, pg_temp
as $$
with pools(category, pool) as (
  values
    ('admin_dividend'::public.payout_category, p_admin_pool),
    ('investor_dividend'::public.payout_category, p_investor_pool),
    ('employee_commission'::public.payout_category, p_employee_pool)
),
recipients as (
  select u.id,
         case u.role
           when 'admin' then 'admin_dividend'
           when 'investor' then 'investor_dividend'
           else 'employee_commission'
         end::public.payout_category as category,
         u.default_profit_share
  from public.users u
  where u.is_active = true and u.role in ('admin', 'investor', 'karyawan')
),
weighted as (
  select p.category, p.pool, r.id as user_id, r.default_profit_share,
         sum(r.default_profit_share) over (partition by p.category) as total_raw
  from pools p
  join recipients r on r.category = p.category
  where p.pool > 0
),
normalized as (
  select category, pool, user_id,
         case when total_raw = 0 then 1 else default_profit_share end as weight
  from weighted
),
totals as (
  select category, pool, user_id, weight,
         sum(weight) over (partition by category) as total_weight
  from normalized
),
ranked as (
  select category, pool, user_id, weight, total_weight,
         (pool * weight / total_weight) as exact,
         floor(pool * weight / total_weight) as floor_amount,
         row_number() over (
           partition by category
           order by (pool * weight / total_weight)
                    - floor(pool * weight / total_weight) desc,
                    user_id
         ) as rn,
         sum(floor(pool * weight / total_weight)) over (partition by category) as allocated
  from totals
),
final as (
  select user_id, category,
         round(weight / total_weight * 100, 2) as weight_pct,
         floor_amount + case when rn <= (pool - allocated) then 1 else 0 end as amount
  from ranked
)
select user_id, category, weight_pct, amount::numeric(14,2)
from final
where amount > 0;
$$;

revoke execute on function public.build_payout_items(numeric, numeric, numeric)
  from public, anon, authenticated;

create or replace function public.preview_payout(
  p_start date,
  p_end date,
  p_allocations jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_alloc jsonb;
  v_gross numeric(14,2);
  v_opex numeric(14,2);
  v_net numeric(14,2);
  v_positive numeric(14,2);
  v_admin_pool numeric(14,2);
  v_investor_pool numeric(14,2);
  v_employee_pool numeric(14,2);
  v_total_out numeric(14,2);
  v_items jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end <> p_start + 6
     or extract(isodow from p_start) <> 1 then
    raise exception 'VALIDATION_ERROR:periode' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.transactions t
    where t.import_batch_id is not null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end
  ) then
    raise exception 'HISTORICAL_PERIOD' using errcode = '22023';
  end if;

  if p_allocations is null then
    select jsonb_build_object(
      'retained', retained_pct, 'admin', admin_pct,
      'investor', investor_pct, 'employee', employee_pct
    ) into v_alloc
    from public.payout_settings where id = 1;
    v_alloc := coalesce(v_alloc,
      jsonb_build_object('retained', 20, 'admin', 40, 'investor', 30, 'employee', 10));
  else
    v_alloc := p_allocations;
  end if;

  if jsonb_typeof(v_alloc) <> 'object'
     or not (v_alloc ?& array['retained', 'admin', 'investor', 'employee'])
     or (select count(*) from jsonb_object_keys(v_alloc)) <> 4
     or jsonb_typeof(v_alloc->'retained') <> 'number'
     or jsonb_typeof(v_alloc->'admin') <> 'number'
     or jsonb_typeof(v_alloc->'investor') <> 'number'
     or jsonb_typeof(v_alloc->'employee') <> 'number'
     or (v_alloc->>'retained')::numeric not between 0 and 100
     or (v_alloc->>'admin')::numeric not between 0 and 100
     or (v_alloc->>'investor')::numeric not between 0 and 100
     or (v_alloc->>'employee')::numeric not between 0 and 100
     or ((v_alloc->>'retained')::numeric + (v_alloc->>'admin')::numeric
         + (v_alloc->>'investor')::numeric + (v_alloc->>'employee')::numeric) <> 100 then
    raise exception 'INVALID_ALLOCATION' using errcode = '22023';
  end if;

  select coalesce(sum(tc.margin), 0) into v_gross
  from public.transactions t
  join public.transaction_costs tc on tc.transaction_id = t.id
  where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
    and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  select coalesce(sum(t.nominal), 0) into v_opex
  from public.transactions t
  where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
    and t.reversal_of is null and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  v_net := v_gross - v_opex;
  v_positive := greatest(v_net, 0);

  v_admin_pool := floor(v_positive * (v_alloc->>'admin')::numeric / 100);
  v_investor_pool := floor(v_positive * (v_alloc->>'investor')::numeric / 100);
  v_employee_pool := floor(v_positive * (v_alloc->>'employee')::numeric / 100);

  drop table if exists pg_temp._preview_items;
  create temp table _preview_items on commit drop as
    select * from public.build_payout_items(v_admin_pool, v_investor_pool, v_employee_pool);

  select coalesce(sum(amount), 0) into v_total_out from _preview_items;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', i.user_id,
    'full_name', u.full_name,
    'role', u.role,
    'category', i.category,
    'weight_pct', i.weight_pct,
    'amount', i.amount
  ) order by i.category, u.full_name), '[]'::jsonb)
  into v_items
  from _preview_items i
  join public.users u on u.id = i.user_id;

  if v_net <= 0 then
    v_warnings := v_warnings || to_jsonb(array['NEGATIVE_NET_PROFIT']);
  end if;
  if v_admin_pool > 0 and not exists (
    select 1 from _preview_items where category = 'admin_dividend'
  ) then
    v_warnings := v_warnings || to_jsonb(array['POOL_NO_RECIPIENT:admin_dividend']);
  end if;
  if v_investor_pool > 0 and not exists (
    select 1 from _preview_items where category = 'investor_dividend'
  ) then
    v_warnings := v_warnings || to_jsonb(array['POOL_NO_RECIPIENT:investor_dividend']);
  end if;
  if v_employee_pool > 0 and not exists (
    select 1 from _preview_items where category = 'employee_commission'
  ) then
    v_warnings := v_warnings || to_jsonb(array['POOL_NO_RECIPIENT:employee_commission']);
  end if;
  if (v_positive - v_admin_pool - v_investor_pool - v_employee_pool)
     <> (v_net - v_total_out) then
    v_warnings := v_warnings || to_jsonb(array['ROUNDING_RETAINED']);
  end if;

  return jsonb_build_object(
    'start_date', p_start,
    'end_date', p_end,
    'gross_margin', v_gross,
    'operating_expense', v_opex,
    'net_profit', v_net,
    'allocations', v_alloc,
    'pools', jsonb_build_object(
      'retained', v_positive - v_admin_pool - v_investor_pool - v_employee_pool,
      'admin', v_admin_pool,
      'investor', v_investor_pool,
      'employee', v_employee_pool
    ),
    'retained_actual', v_net - v_total_out,
    'items', v_items,
    'warnings', v_warnings
  );
end;
$$;

create or replace function public.execute_payout(
  p_start date,
  p_end date,
  p_wallet_id uuid,
  p_allocations jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.payout_history;
  v_wallet public.wallets;
  v_gross numeric(14,2);
  v_opex numeric(14,2);
  v_net numeric(14,2);
  v_retained numeric(14,2);
  v_admin_pool numeric(14,2);
  v_investor_pool numeric(14,2);
  v_employee_pool numeric(14,2);
  v_total_out numeric(14,2);
  v_payout public.payout_history;
  v_item record;
  v_tx public.transactions;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_wallet_id is null or p_allocations is null
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'VALIDATION_ERROR:payload' using errcode = '22023';
  end if;
  if p_end < p_start or p_end <> p_start + 6 or extract(isodow from p_start) <> 1 then
    raise exception 'VALIDATION_ERROR:periode' using errcode = '22023';
  end if;
  if p_end >= (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'PAYOUT_PERIOD_OPEN' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.transactions t
    where t.import_batch_id is not null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end
  ) then
    raise exception 'HISTORICAL_PERIOD' using errcode = '22023';
  end if;
  if jsonb_typeof(p_allocations) <> 'object'
     or not (p_allocations ?& array['retained', 'admin', 'investor', 'employee'])
     or (select count(*) from jsonb_object_keys(p_allocations)) <> 4
     or jsonb_typeof(p_allocations->'retained') <> 'number'
     or jsonb_typeof(p_allocations->'admin') <> 'number'
     or jsonb_typeof(p_allocations->'investor') <> 'number'
     or jsonb_typeof(p_allocations->'employee') <> 'number' then
    raise exception 'INVALID_ALLOCATION' using errcode = '22023';
  end if;
  if (p_allocations->>'retained')::numeric not between 0 and 100
     or (p_allocations->>'admin')::numeric not between 0 and 100
     or (p_allocations->>'investor')::numeric not between 0 and 100
     or (p_allocations->>'employee')::numeric not between 0 and 100
     or ((p_allocations->>'retained')::numeric + (p_allocations->>'admin')::numeric
         + (p_allocations->>'investor')::numeric + (p_allocations->>'employee')::numeric) <> 100 then
    raise exception 'INVALID_ALLOCATION' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('payout:' || p_start || ':' || p_end));

  select * into v_existing from public.payout_history
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.start_date is distinct from p_start
       or v_existing.end_date is distinct from p_end
       or v_existing.wallet_id is distinct from p_wallet_id
       or v_existing.allocations is distinct from p_allocations then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_existing from public.payout_history
  where start_date = p_start and end_date = p_end;
  if found then
    raise exception 'DUPLICATE_PAYOUT' using errcode = '23505';
  end if;

  select coalesce(sum(tc.margin), 0) into v_gross
  from public.transactions t
  join public.transaction_costs tc on tc.transaction_id = t.id
  where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
    and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  select coalesce(sum(t.nominal), 0) into v_opex
  from public.transactions t
  where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
    and t.reversal_of is null and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  v_net := v_gross - v_opex;
  if v_net <= 0 then
    raise exception 'PAYOUT_LOSS' using errcode = 'P0001';
  end if;

  v_admin_pool := floor(v_net * (p_allocations->>'admin')::numeric / 100);
  v_investor_pool := floor(v_net * (p_allocations->>'investor')::numeric / 100);
  v_employee_pool := floor(v_net * (p_allocations->>'employee')::numeric / 100);

  drop table if exists pg_temp._payout_items;
  create temp table _payout_items on commit drop as
    select * from public.build_payout_items(v_admin_pool, v_investor_pool, v_employee_pool);

  select coalesce(sum(amount), 0) into v_total_out from _payout_items;
  v_retained := v_net - v_total_out;

  select * into v_wallet from public.wallets
  where id = p_wallet_id and is_active = true for update;
  if not found then
    raise exception 'WALLET_INACTIVE' using errcode = 'P0002';
  end if;
  if v_wallet.saldo < v_total_out then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.payout_history
    (start_date, end_date, gross_margin_total, operating_expense_total, net_profit_total,
     retained_earnings, total_distributed, wallet_id, status, idempotency_key,
     allocations, created_by, completed_at, notes)
  values
    (p_start, p_end, v_gross, v_opex, v_net, v_retained, v_total_out, p_wallet_id,
     'completed', p_idempotency_key, p_allocations, auth.uid(), now(),
     case when v_retained > 0
       then 'Retained earnings = porsi retained + sisa pembulatan + pool tanpa penerima.'
     end)
  returning * into v_payout;

  update public.wallets set saldo = saldo - v_total_out where id = p_wallet_id;

  for v_item in select * from _payout_items loop
    insert into public.transactions
      (tipe, kategori, nominal, wallet_id, payout_id, user_id, keterangan, client_request_id)
    values
      ('payout',
       case when v_item.category = 'employee_commission' then 'gaji' else 'deviden' end,
       v_item.amount, p_wallet_id, v_payout.id, v_item.user_id,
       'Payout ' || p_start || ' s/d ' || p_end, gen_random_uuid())
    returning * into v_tx;

    insert into public.payout_items
      (payout_id, user_id, category, weight_pct, amount, transaction_id)
    values
      (v_payout.id, v_item.user_id, v_item.category, v_item.weight_pct,
       v_item.amount, v_tx.id);
  end loop;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('payout_history', v_payout.id::text, 'payout', to_jsonb(v_payout), auth.uid());

  return to_jsonb(v_payout);
exception
  when unique_violation then
    select * into v_existing from public.payout_history
    where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.start_date is distinct from p_start
         or v_existing.end_date is distinct from p_end
         or v_existing.wallet_id is distinct from p_wallet_id
         or v_existing.allocations is distinct from p_allocations then
        raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      return to_jsonb(v_existing);
    end if;
    raise exception 'DUPLICATE_PAYOUT' using errcode = '23505';
end;
$$;

-- ============================================================
-- Dashboard & receipt
-- ============================================================
create or replace function public.get_dashboard_metrics(
  p_start date default null,
  p_end date default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_this_monday date;
  v_closed_start date;
  v_closed_end date;
  v_start date;
  v_end date;
  v_gross numeric(14,2);
  v_opex numeric(14,2);
  v_net numeric(14,2);
  v_closed_net numeric(14,2);
  v_assets numeric(14,2);
  v_tx_count integer;
  v_series jsonb;
  v_recent jsonb;
  v_ready boolean;
  v_last_dividend numeric(14,2);
  v_my_count integer;
  v_my_sales numeric(14,2);
  v_my_products integer;
begin
  if v_role is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  v_this_monday := v_today - (extract(isodow from v_today)::int - 1);
  v_closed_start := v_this_monday - 7;
  v_closed_end := v_this_monday - 1;
  v_start := coalesce(p_start, v_this_monday);
  v_end := coalesce(p_end, v_today);
  if v_end < v_start then
    raise exception 'VALIDATION_ERROR:periode' using errcode = '22023';
  end if;

  if v_role in ('admin', 'investor') then
    select coalesce(sum(tc.margin), 0) into v_gross
    from public.transactions t
    join public.transaction_costs tc on tc.transaction_id = t.id
    where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
      and t.import_batch_id is null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between v_start and v_end;

    select coalesce(sum(t.nominal), 0) into v_opex
    from public.transactions t
    where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
      and t.reversal_of is null and t.import_batch_id is null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between v_start and v_end;

    v_net := v_gross - v_opex;

    select count(*) into v_tx_count
    from public.transactions t
    where t.status = 'active' and t.reversal_of is null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between v_start and v_end;

    select coalesce(sum(saldo), 0) into v_assets
    from public.wallets where is_active = true;

    select coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(d::date, 'YYYY-MM-DD'),
      'income', coalesce((
        select sum(tc.margin) from public.transactions t
        join public.transaction_costs tc on tc.transaction_id = t.id
        where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
          and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
      ), 0),
      'expense', coalesce((
        select sum(t.nominal) from public.transactions t
        where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
          and t.reversal_of is null and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
      ), 0),
      'profit', coalesce((
        select sum(tc.margin) from public.transactions t
        join public.transaction_costs tc on tc.transaction_id = t.id
        where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
          and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
      ), 0) - coalesce((
        select sum(t.nominal) from public.transactions t
        where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
          and t.reversal_of is null and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
      ), 0)
    ) order by d), '[]'::jsonb)
    into v_series
    from generate_series(v_end - 6, v_end, interval '1 day') d;

    if v_role = 'admin' then
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_recent
      from (
        select t.id, t.tanggal, t.tipe, t.kategori, t.nominal,
               coalesce(t.keterangan, '') as keterangan, u.full_name as user_name
        from public.transactions t
        join public.users u on u.id = t.user_id
        where (t.tanggal at time zone 'Asia/Jakarta')::date between v_start and v_end
        order by t.tanggal desc
        limit 5
      ) x;

      select coalesce(sum(tc.margin), 0) into v_closed_net
      from public.transactions t
      join public.transaction_costs tc on tc.transaction_id = t.id
      where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
        and t.import_batch_id is null
        and (t.tanggal at time zone 'Asia/Jakarta')::date
            between v_closed_start and v_closed_end;

      v_closed_net := v_closed_net - coalesce((
        select sum(t.nominal) from public.transactions t
        where t.tipe = 'expense' and t.kategori = 'operasional' and t.status = 'active'
          and t.reversal_of is null and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date
              between v_closed_start and v_closed_end
      ), 0);

      v_ready := v_closed_net > 0 and not exists (
        select 1 from public.payout_history
        where start_date = v_closed_start and end_date = v_closed_end
      );

      return jsonb_build_object(
        'role', 'admin',
        'period', jsonb_build_object('start', v_start, 'end', v_end),
        'gross_margin', v_gross,
        'operating_expense', v_opex,
        'net_profit', v_net,
        'total_assets', v_assets,
        'transaction_count', v_tx_count,
        'series', v_series,
        'recent_transactions', v_recent,
        'payout_ready', v_ready,
        'payout_period', jsonb_build_object('start', v_closed_start, 'end', v_closed_end),
        'payout_ready_net_profit', v_closed_net
      );
    end if;

    select pi.amount into v_last_dividend
    from public.payout_items pi
    join public.payout_history p on p.id = pi.payout_id
    where pi.user_id = auth.uid()
    order by p.end_date desc
    limit 1;

    return jsonb_build_object(
      'role', 'investor',
      'period', jsonb_build_object('start', v_start, 'end', v_end),
      'gross_margin', v_gross,
      'net_profit', v_net,
      'total_assets', v_assets,
      'last_dividend', coalesce(v_last_dividend, 0),
      'series', v_series,
      'payout_history_mini', coalesce((
        select jsonb_agg(to_jsonb(x))
        from (
          select p.id, p.start_date, p.end_date, sum(pi.amount) as amount
          from public.payout_history p
          join public.payout_items pi on pi.payout_id = p.id
          where pi.user_id = auth.uid()
          group by p.id
          order by p.start_date desc
          limit 5
        ) x
      ), '[]'::jsonb)
    );
  end if;

  select count(*), coalesce(sum(t.nominal), 0)
  into v_my_count, v_my_sales
  from public.transactions t
  where t.tipe = 'income' and t.user_id = auth.uid()
    and t.status = 'active' and t.reversal_of is null and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date = v_today;

  select coalesce(sum(t.qty), 0) into v_my_products
  from public.transactions t
  where t.tipe = 'income' and t.user_id = auth.uid()
    and t.status = 'active' and t.reversal_of is null and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date = v_today;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d::date, 'YYYY-MM-DD'),
    'count', (
      select count(*) from public.transactions t
      where t.user_id = auth.uid() and t.status = 'active' and t.reversal_of is null
        and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
    )
  ) order by d), '[]'::jsonb)
  into v_series
  from generate_series(v_end - 6, v_end, interval '1 day') d;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_recent
  from (
    select t.id, t.tanggal, t.tipe, t.kategori, t.nominal,
           coalesce(t.keterangan, '') as keterangan
    from public.transactions t
    where t.user_id = auth.uid()
      and (t.tanggal at time zone 'Asia/Jakarta')::date = v_today
    order by t.tanggal desc
    limit 5
  ) x;

  return jsonb_build_object(
    'role', 'karyawan',
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'my_transaction_count_today', v_my_count,
    'my_sales_today', v_my_sales,
    'my_products_sold_today', v_my_products,
    'my_series_7d', v_series,
    'recent_transactions', v_recent
  );
end;
$$;

create or replace function public.get_investor_dividends(
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_user_role() <> 'investor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x))
    from (
      select p.id as payout_id, p.start_date, p.end_date, p.status,
             pi.category, pi.weight_pct, pi.amount, pi.created_at
      from public.payout_items pi
      join public.payout_history p on p.id = pi.payout_id
      where pi.user_id = auth.uid()
      order by p.start_date desc
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      offset greatest(coalesce(p_offset, 0), 0)
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_payout_receipt(p_payout_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_result jsonb;
begin
  if v_role is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if v_role not in ('admin', 'investor') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select to_jsonb(p) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(pi) order by pi.category, pi.created_at)
      from public.payout_items pi
      where pi.payout_id = p.id
        and (v_role = 'admin' or pi.user_id = auth.uid())
    ), '[]'::jsonb)
  )
  into v_result
  from public.payout_history p
  where p.id = p_payout_id
    and (
      v_role = 'admin'
      or exists (
        select 1 from public.payout_items pi
        where pi.payout_id = p.id and pi.user_id = auth.uid()
      )
    );

  if v_result is null then
    raise exception 'NOT_FOUND:payout' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

-- Grants: bisnis hanya authenticated; helper internal tidak.
revoke execute on function public.create_sale(uuid, integer, text, uuid) from public, anon;
revoke execute on function public.create_expense(uuid, numeric, text, text, date, uuid) from public, anon;
revoke execute on function public.transfer_wallet(uuid, uuid, numeric, text, uuid) from public, anon;
revoke execute on function public.adjust_wallet_balance(uuid, numeric, text, uuid) from public, anon;
revoke execute on function public.void_transaction(uuid, text) from public, anon;
revoke execute on function public.upsert_product(uuid, text, text, numeric, numeric) from public, anon;
revoke execute on function public.create_wallet(text, public.wallet_type, numeric, boolean) from public, anon;
revoke execute on function public.update_wallet(uuid, text, public.wallet_type, boolean) from public, anon;
revoke execute on function public.toggle_wallet(uuid, boolean) from public, anon;
revoke execute on function public.update_payout_settings(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function public.preview_payout(date, date, jsonb) from public, anon;
revoke execute on function public.execute_payout(date, date, uuid, jsonb, text) from public, anon;
revoke execute on function public.get_dashboard_metrics(date, date) from public, anon;
revoke execute on function public.get_investor_dividends(integer, integer) from public, anon;
revoke execute on function public.get_payout_receipt(uuid) from public, anon;

grant execute on function public.create_sale(uuid, integer, text, uuid) to authenticated;
grant execute on function public.create_expense(uuid, numeric, text, text, date, uuid) to authenticated;
grant execute on function public.transfer_wallet(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.adjust_wallet_balance(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.void_transaction(uuid, text) to authenticated;
grant execute on function public.upsert_product(uuid, text, text, numeric, numeric) to authenticated;
grant execute on function public.create_wallet(text, public.wallet_type, numeric, boolean) to authenticated;
grant execute on function public.update_wallet(uuid, text, public.wallet_type, boolean) to authenticated;
grant execute on function public.toggle_wallet(uuid, boolean) to authenticated;
grant execute on function public.update_payout_settings(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.preview_payout(date, date, jsonb) to authenticated;
grant execute on function public.execute_payout(date, date, uuid, jsonb, text) to authenticated;
grant execute on function public.get_dashboard_metrics(date, date) to authenticated;
grant execute on function public.get_investor_dividends(integer, integer) to authenticated;
grant execute on function public.get_payout_receipt(uuid) to authenticated;
