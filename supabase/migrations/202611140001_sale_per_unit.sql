-- 202611140001_sale_per_unit.sql
-- Setiap unit penjualan dicatat sebagai transaksi terpisah (qty = 1), bukan
-- satu transaksi dengan qty > 1. Dengan begitu tiap unit punya jurnal, biaya
-- modal, dan konversi voucher sendiri.

-- Satu produk sekarang boleh menghasilkan beberapa baris transaksi dalam satu
-- batch, sehingga unique index (batch, produk) tidak berlaku lagi.
drop index if exists public.transactions_batch_product_uidx;
create index if not exists transactions_batch_user_idx
  on public.transactions (client_batch_id, user_id)
  where client_batch_id is not null;

create or replace function public.create_sales(
  p_items jsonb,
  p_keterangan text,
  p_tanggal date,
  p_batch_id text,
  p_source_wallet_id uuid default null,
  p_source_cost numeric default null,
  p_wallet_id uuid default null
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
  v_units integer := 0;
  v_existing integer;
  v_existing_units integer;
  v_plan record;
  v_row_no integer := 0;
  v_i integer;
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
  -- Hanya admin yang boleh menentukan wallet tujuan.
  if v_role <> 'admin' then
    p_wallet_id := null;
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

  -- Serialisasi retry dengan batch yang sama supaya idempotensi tetap aman
  -- meskipun unique index batch+produk sudah dihapus.
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || btrim(p_batch_id), 0)
  );

  v_count := jsonb_array_length(p_items);
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item->>'product_id') is null
       or (v_item->>'qty') is null
       or (v_item->>'qty') !~ '^[0-9]{1,2}$' then
      raise exception 'VALIDATION_ERROR:items' using errcode = '22023';
    end if;
    if (v_item->>'qty')::integer < 1 or (v_item->>'qty')::integer > 99 then
      raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
    end if;
    v_units := v_units + (v_item->>'qty')::integer;
  end loop;
  if (
    select count(distinct x->>'product_id')
    from jsonb_array_elements(p_items) x
  ) <> v_count then
    raise exception 'VALIDATION_ERROR:duplikat' using errcode = '22023';
  end if;

  -- Idempotensi dihitung dari total unit (bukan jumlah baris produk), supaya
  -- retry batch lama yang masih qty > 1 juga tetap dikenali.
  select count(*), coalesce(sum(t.qty), 0)
  into v_existing, v_existing_units
  from public.transactions t
  where t.client_batch_id = p_batch_id and t.user_id = auth.uid();

  if v_existing > 0 then
    if v_existing_units <> v_units then
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
      ) order by p.nama_produk, t.created_at, t.id)
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

  select coalesce(sum(sp.cost * sp.qty), 0) into v_cost_total
  from _sale_plans sp;
  v_source_cost := coalesce(p_source_cost, v_cost_total);

  -- Wallet tujuan (penerima hasil jual): pilihan admin, atau wallet default.
  if p_wallet_id is not null then
    select * into v_wallet from public.wallets
    where id = p_wallet_id and is_active = true and deleted_at is null
    for update;
    if not found then
      raise exception 'WALLET_INACTIVE:tujuan' using errcode = 'P0002';
    end if;
  else
    select * into v_wallet from public.wallets
    where is_default = true and is_active = true
    for update;
    if not found then
      raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
    end if;
  end if;

  -- Wallet sumber (modal): pilihan user, atau wallet tujuan bila tidak dipilih.
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

  if v_source.saldo < v_source_cost then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  -- Bagi source_cost ke tiap unit. Default: pakai harga beli unit itu sendiri
  -- supaya refund/konversi voucher per transaksi akurat. Jika admin mengisi
  -- manual, bagi rata dan unit terakhir menerima sisa persis.
  v_source_cost_left := v_source_cost;
  for v_plan in
    select p.product_id, p.product_name, p.qty, p.price, p.cost
    from _sale_plans p
    order by p.product_id
  loop
    for v_i in 1 .. v_plan.qty loop
      v_row_no := v_row_no + 1;
      if p_source_cost is null then
        v_alloc := v_plan.cost;
      elsif v_row_no = v_units then
        v_alloc := v_source_cost_left;
      else
        v_alloc := floor(
          v_source_cost_left::numeric(16,4) / (v_units - v_row_no + 1)
        );
        v_source_cost_left := v_source_cost_left - v_alloc;
      end if;

      insert into public.transactions
        (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, source_wallet_id,
         product_id, keterangan, user_id, client_request_id, client_batch_id)
      values
        (v_tanggal, 'income', 'penjualan', v_plan.price, 1,
         v_plan.price, v_wallet.id,
         case when p_source_wallet_id is not null then v_source.id else null end,
         v_plan.product_id,
         nullif(btrim(p_keterangan), ''), auth.uid(), gen_random_uuid(), p_batch_id)
      returning * into v_tx;

      insert into public.transaction_costs
        (transaction_id, unit_cost, margin, source_cost)
      values (v_tx.id, v_plan.cost, v_plan.price - v_plan.cost,
              coalesce(v_alloc, 0));

      v_total := v_total + v_tx.nominal;

      insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
      values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', v_tx.id, 'product_id', v_plan.product_id,
        'product_name', v_plan.product_name, 'qty', 1,
        'unit_price', v_plan.price, 'unit_cost', v_plan.cost,
        'source_cost', coalesce(v_alloc, 0),
        'margin', v_plan.price - v_plan.cost,
        'nominal', v_tx.nominal, 'wallet_name', v_wallet.nama_wallet,
        'source_wallet_name',
          case when p_source_wallet_id is not null
               then (select nama_wallet from public.wallets where id = v_source.id)
               else null end,
        'tanggal', v_tx.tanggal, 'duplicate', false
      ));
    end loop;
  end loop;

  -- Potong modal dulu, masukin hasil jual.
  if p_source_wallet_id is not null then
    update public.wallets set saldo = saldo - v_source_cost where id = v_source.id;
  end if;
  update public.wallets set saldo = saldo + v_total where id = v_wallet.id;

  return v_result;
end;
$$;

revoke execute on function public.create_sales(jsonb, text, date, text, uuid, numeric, uuid) from public, anon;
grant execute on function public.create_sales(jsonb, text, date, text, uuid, numeric, uuid) to authenticated;
