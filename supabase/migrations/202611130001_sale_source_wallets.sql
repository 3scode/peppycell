-- 202611130001_sale_source_wallets.sql
-- Penjualan dua wallet: wallet sumber (modal, saldo dikurangi biaya beli)
-- dan wallet tujuan (harga jual, saldo ditambah). Saldo sumber di-set manual
-- oleh admin per transaksi; default = total harga beli efektif.

-- ============================================================
-- Skema
-- ============================================================
alter table public.transactions
  add column if not exists source_wallet_id uuid references public.wallets(id) on delete set null;

-- source_cost: total biaya modal yang benar-benar dipotong dari wallet sumber
-- (bisa berbeda dari Σ unit_cost × qty, dsb. diskon beli).
alter table public.transaction_costs
  add column if not exists source_cost numeric(14,2) check (source_cost >= 0);

create index if not exists transactions_source_wallet_idx
  on public.transactions (source_wallet_id)
  where source_wallet_id is not null;


-- ============================================================
-- create_sales dengan wallet sumber
-- ============================================================
create or replace function public.create_sales(
  p_items jsonb,
  p_keterangan text,
  p_tanggal date,
  p_batch_id text,
  p_source_wallet_id uuid default null,
  p_source_cost numeric default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_wallet public.wallets;
  v_source public.wallets;
  v_date date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_tanggal timestamptz;
  v_item jsonb;
  v_count integer;
  v_existing integer;
  v_plan_count integer;
  v_plan record;
  v_tx public.transactions;
  v_result jsonb := '[]'::jsonb;
  v_total numeric(14,2) := 0;
  v_cost_total numeric(14,2) := 0;
  v_source_cost numeric(14,2);
  v_source_cost_left numeric(14,2);
  v_alloc numeric(14,2);
begin
  if v_role is null or v_role not in ('admin', 'karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_batch_id is null or char_length(btrim(p_batch_id)) < 8 then
    raise exception 'VALIDATION_ERROR:batch' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION_ERROR:items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'VALIDATION_ERROR:items' using errcode = '22023';
  end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;
  if p_keterangan is not null and char_length(btrim(p_keterangan)) > 200 then
    raise exception 'VALIDATION_ERROR:keterangan' using errcode = '22023';
  end if;
  if p_source_cost is not null and (p_source_cost < 0 or p_source_cost <> trunc(p_source_cost)) then
    raise exception 'VALIDATION_ERROR:source_cost' using errcode = '22023';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  select count(*) into v_existing from public.transactions
  where client_batch_id = p_batch_id and user_id = auth.uid();

  if v_existing > 0 then
    if v_existing <> v_count then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'product_id', t.product_id,
        'product_name', p.nama_produk, 'qty', t.qty,
        'unit_price', t.unit_price, 'nominal', t.nominal,
        'wallet_name', w.nama_wallet,
        'source_wallet_id', t.source_wallet_id,
        'source_cost', tc.source_cost,
        'tanggal', t.tanggal, 'duplicate', true
      ) order by t.created_at)
      from public.transactions t
      join public.products p on p.id = t.product_id
      join public.wallets w on w.id = t.wallet_id
      left join public.transaction_costs tc on tc.transaction_id = t.id
      where t.client_batch_id = p_batch_id and t.user_id = auth.uid()
    ), '[]'::jsonb);
  end if;

  drop table if exists pg_temp._sale_plans;
  create temp table _sale_plans (
    product_id uuid primary key,
    product_name text not null,
    qty integer not null,
    price numeric(14,2) not null,
    cost numeric(14,2) not null,
    source_cost numeric(14,2) default 0
  ) on commit drop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item->>'product_id') is null
       or (v_item->>'qty') is null then
      raise exception 'VALIDATION_ERROR:items' using errcode = '22023';
    end if;
    if (v_item->>'qty')::integer < 1 or (v_item->>'qty')::integer > 99 then
      raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
    end if;
    if exists (
      select 1 from _sale_plans where product_id = (v_item->>'product_id')::uuid
    ) then
      raise exception 'VALIDATION_ERROR:duplikat' using errcode = '22023';
    end if;
    insert into _sale_plans (product_id, product_name, qty, price, cost)
    select p.id, p.nama_produk, (v_item->>'qty')::integer, pp.harga_jual, pp.harga_beli
    from public.products p
    cross join lateral public.product_price_at(p.id, v_date) pp
    where p.id = (v_item->>'product_id')::uuid
      and p.is_active = true
      and p.deleted_at is null;
    if not found then
      raise exception 'PRODUCT_INACTIVE' using errcode = 'P0002';
    end if;
  end loop;

  if (select count(*) from _sale_plans) <> v_count then
    raise exception 'VALIDATION_ERROR:items' using errcode = '22023';
  end if;
  if exists (select 1 from _sale_plans where cost is null) then
    raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
  end if;
  if exists (select 1 from _sale_plans where price < cost) then
    raise exception 'INVALID_MARGIN' using errcode = 'P0001';
  end if;

  select coalesce(sum(v_plan.cost * v_plan.qty), 0) into v_cost_total
  from _sale_plans v_plan;
  v_source_cost := coalesce(p_source_cost, v_cost_total);

  -- Wallet tujuan (penerima hasil jual) = wallet default.
  select * into v_wallet from public.wallets
  where is_default = true and is_active = true
  for update;
  if not found then
    raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
  end if;

  -- Wallet sumber (modal): pilihan user, atau wallet default bila tidak dipilih.
  if p_source_wallet_id is not null then
    select * into v_source from public.wallets
    where id = p_source_wallet_id and is_active = true and deleted_at is null
    for update;
    if not found then
      raise exception 'WALLET_INACTIVE:sumber' using errcode = 'P0002';
    end if;
  else
    v_source := v_wallet;
  end if;

  if v_source.id = v_wallet.id and v_source.saldo < v_source_cost then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  -- Bagi source_cost ke tiap baris: baris terakhir menerima sisa persis.

  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  v_source_cost_left := v_source_cost;
  select coalesce(count(*), 0) into v_plan_count from _sale_plans;
  for v_plan in
    select p.product_id, p.product_name, p.qty, p.price, p.cost,
           row_number() over (order by p.product_id) as rn
    from _sale_plans p
  loop
    if v_plan.rn = v_plan_count then
      v_alloc := v_source_cost_left;
    else
      v_alloc := floor(v_source_cost_left::numeric(16,4) / v_plan_count);
      v_source_cost_left := v_source_cost_left - v_alloc;
    end if;
    update _sale_plans set source_cost = v_alloc where product_id = v_plan.product_id;

    insert into public.transactions
      (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, source_wallet_id,
       product_id, keterangan, user_id, client_request_id, client_batch_id)
    values
      (v_tanggal, 'income', 'penjualan', v_plan.price * v_plan.qty, v_plan.qty,
       v_plan.price, v_wallet.id,
       case when p_source_wallet_id is not null then v_source.id else null end,
       v_plan.product_id,
       nullif(btrim(p_keterangan), ''), auth.uid(), gen_random_uuid(), p_batch_id)
    returning * into v_tx;

    insert into public.transaction_costs
      (transaction_id, unit_cost, margin, source_cost)
    values (v_tx.id, v_plan.cost, (v_plan.price - v_plan.cost) * v_plan.qty,
            coalesce(v_alloc, 0));

    v_total := v_total + v_tx.nominal;

    insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
    values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_tx.id, 'product_id', v_plan.product_id,
      'product_name', v_plan.product_name, 'qty', v_plan.qty,
      'unit_price', v_plan.price, 'unit_cost', v_plan.cost,
      'source_cost', coalesce(v_alloc, 0),
      'margin', (v_plan.price - v_plan.cost) * v_plan.qty,
      'nominal', v_tx.nominal, 'wallet_name', v_wallet.nama_wallet,
      'source_wallet_name',
        case when p_source_wallet_id is not null
             then (select nama_wallet from public.wallets where id = v_source.id)
             else null end,
      'tanggal', v_tx.tanggal, 'duplicate', false
    ));
  end loop;

  -- Potong modal dulu, masukin hasil jual. (Wallet sama: cek saldo di atas.)
  if p_source_wallet_id is not null then
    update public.wallets set saldo = saldo - v_source_cost where id = v_source.id;
  end if;
  update public.wallets set saldo = saldo + v_total where id = v_wallet.id;

  return v_result;
end;
$$;

-- ============================================================
-- Void: kembalikan saldo sumber bila ada
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

-- ============================================================
-- Edit transaksi: wallet sumber penjualan dapat dipindah/diubah
-- ============================================================
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
  p_source_cost numeric default null
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

    -- Koreksi saldo tujuan (wallet penerima hasil jual).
    if v_tx.wallet_id = v_new_wallet_id then
      if v_wallet.saldo + (v_nominal - v_tx.nominal) < 0 then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo + (v_nominal - v_tx.nominal)
      where id = v_wallet.id;
    else
      if (select saldo from public.wallets where id = v_new_wallet_id) < v_nominal then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      update public.wallets set saldo = saldo - v_nominal where id = v_new_wallet_id;
      update public.wallets set saldo = saldo + v_tx.nominal where id = v_tx.wallet_id;
    end if;

    -- Wallet sumber (modal) hanya berlaku untuk income.
    v_old_source := v_tx.source_wallet_id;
    v_new_source := coalesce(p_source_wallet_id, v_tx.source_wallet_id);
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

    if v_old_source is not null and (v_old_source <> v_new_source or v_new_source_cost <> v_old_source_cost) then
      update public.wallets set saldo = saldo + v_old_source_cost where id = v_old_source;
    end if;
    if v_new_source is not null and (v_new_source <> v_old_source or v_new_source_cost <> v_old_source_cost) then
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

-- ============================================================
-- Hapus transaksi: kembalikan saldo sumber bila ada
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
revoke execute on function public.create_sales(jsonb, text, date, text, uuid, numeric) from public, anon;
grant execute on function public.create_sales(jsonb, text, date, text, uuid, numeric) to authenticated;

revoke execute on function public.void_transaction(uuid, text) from public, anon;
grant execute on function public.void_transaction(uuid, text) to authenticated;

revoke execute on function public.update_transaction(uuid, date, text, uuid, integer, numeric, text, uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.update_transaction(uuid, date, text, uuid, integer, numeric, text, uuid, uuid, uuid, numeric) to authenticated;

revoke execute on function public.delete_transactions(uuid[]) from public, anon;
grant execute on function public.delete_transactions(uuid[]) to authenticated;
