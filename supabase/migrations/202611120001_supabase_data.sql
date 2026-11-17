-- 202611120001_supabase_data.sql
-- Data layer produksi: riwayat harga produk per tanggal + RPC operasional yang
-- sebelumnya hanya ada di repository demo.

-- ============================================================
-- Skema tambahan
-- ============================================================
alter table public.products
  add column if not exists deleted_at timestamptz;

drop index if exists public.products_nama_lower_uidx;
create unique index products_nama_lower_uidx
  on public.products (lower(nama_produk))
  where deleted_at is null;

alter table public.transactions
  add column if not exists client_batch_id text;

create unique index if not exists transactions_batch_product_uidx
  on public.transactions (client_batch_id, product_id)
  where client_batch_id is not null;

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  effective_from date not null,
  harga_beli numeric(14,2) not null check (harga_beli >= 0),
  harga_jual numeric(14,2) not null check (harga_jual > 0),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (product_id, effective_from),
  check (harga_beli <= harga_jual)
);

create index if not exists product_prices_product_date_idx
  on public.product_prices (product_id, effective_from desc);

alter table public.product_prices enable row level security;

drop policy if exists product_prices_admin on public.product_prices;
create policy product_prices_admin on public.product_prices for select to authenticated
using (public.is_admin());

revoke insert, update, delete on public.product_prices from authenticated;
grant select on public.product_prices to authenticated;

insert into public.product_prices (product_id, effective_from, harga_beli, harga_jual, created_at)
select p.id,
       (p.created_at at time zone 'Asia/Jakarta')::date,
       coalesce(pc.harga_beli, 0),
       p.harga_jual,
       p.created_at
from public.products p
left join public.product_costs pc on pc.product_id = p.id
where not exists (
  select 1 from public.product_prices pp where pp.product_id = p.id
);

-- ============================================================
-- Helper harga per tanggal
-- ============================================================
create or replace function public.product_price_at(p_product_id uuid, p_date date)
returns table (harga_beli numeric, harga_jual numeric)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with point as (
    select pp.harga_beli as beli, pp.harga_jual as jual
    from public.product_prices pp
    where pp.product_id = p_product_id and pp.effective_from <= p_date
    order by pp.effective_from desc
    limit 1
  ),
  earliest as (
    select pp.harga_beli as beli, pp.harga_jual as jual
    from public.product_prices pp
    where pp.product_id = p_product_id
    order by pp.effective_from asc
    limit 1
  )
  select coalesce(point.beli, earliest.beli, pc.harga_beli, 0),
         coalesce(point.jual, earliest.jual, p.harga_jual)
  from public.products p
  left join public.product_costs pc on pc.product_id = p.id
  left join point on true
  left join earliest on true
  where p.id = p_product_id;
$$;

-- ============================================================
-- Penjualan dengan harga efektif per tanggal
-- ============================================================
create or replace function public.create_sale_at(
  p_product_id uuid,
  p_qty integer,
  p_keterangan text,
  p_client_request_id uuid,
  p_tanggal date,
  p_batch_id text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_product public.products;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_wallet public.wallets;
  v_tx public.transactions;
  v_nominal numeric(14,2);
  v_date date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_tanggal timestamptz;
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
      'id', v_tx.id, 'product_id', v_tx.product_id,
      'product_name', v_product.nama_produk, 'qty', v_tx.qty,
      'unit_price', v_tx.unit_price, 'nominal', v_tx.nominal,
      'wallet_name', v_wallet.nama_wallet, 'tanggal', v_tx.tanggal,
      'duplicate', true
    );
  end if;

  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
  end if;
  if p_keterangan is not null and char_length(btrim(p_keterangan)) > 200 then
    raise exception 'VALIDATION_ERROR:keterangan' using errcode = '22023';
  end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;

  select * into v_product from public.products
  where id = p_product_id and is_active = true and deleted_at is null;
  if not found then
    raise exception 'PRODUCT_INACTIVE' using errcode = 'P0002';
  end if;

  select pp.harga_beli, pp.harga_jual into v_cost, v_price
  from public.product_price_at(p_product_id, v_date) pp;
  if v_cost is null then
    raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
  end if;
  if v_price < v_cost then
    raise exception 'INVALID_MARGIN' using errcode = 'P0001';
  end if;

  select * into v_wallet from public.wallets
  where is_default = true and is_active = true
  for update;
  if not found then
    raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
  end if;

  v_nominal := v_price * p_qty;
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  insert into public.transactions
    (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, product_id, keterangan,
     user_id, client_request_id, client_batch_id)
  values
    (v_tanggal, 'income', 'penjualan', v_nominal, p_qty, v_price, v_wallet.id,
     v_product.id, nullif(btrim(p_keterangan), ''), auth.uid(), p_client_request_id, p_batch_id)
  returning * into v_tx;

  insert into public.transaction_costs (transaction_id, unit_cost, margin)
  values (v_tx.id, v_cost, (v_price - v_cost) * p_qty);

  update public.wallets set saldo = saldo + v_nominal where id = v_wallet.id;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'id', v_tx.id, 'product_id', v_tx.product_id,
    'product_name', v_product.nama_produk, 'qty', p_qty,
    'unit_price', v_price, 'unit_cost', v_cost,
    'margin', (v_price - v_cost) * p_qty, 'nominal', v_nominal,
    'wallet_name', v_wallet.nama_wallet, 'tanggal', v_tx.tanggal,
    'duplicate', false
  );
end;
$$;

create or replace function public.create_sales(
  p_items jsonb,
  p_keterangan text,
  p_tanggal date,
  p_batch_id text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_wallet public.wallets;
  v_date date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_tanggal timestamptz;
  v_item jsonb;
  v_count integer;
  v_existing integer;
  v_plan record;
  v_tx public.transactions;
  v_result jsonb := '[]'::jsonb;
  v_total numeric(14,2) := 0;
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
        'wallet_name', w.nama_wallet, 'tanggal', t.tanggal, 'duplicate', true
      ) order by t.created_at)
      from public.transactions t
      join public.products p on p.id = t.product_id
      join public.wallets w on w.id = t.wallet_id
      where t.client_batch_id = p_batch_id and t.user_id = auth.uid()
    ), '[]'::jsonb);
  end if;

  drop table if exists pg_temp._sale_plans;
  create temp table _sale_plans (
    product_id uuid primary key,
    product_name text not null,
    qty integer not null,
    price numeric(14,2) not null,
    cost numeric(14,2) not null
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

  select * into v_wallet from public.wallets
  where is_default = true and is_active = true
  for update;
  if not found then
    raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002';
  end if;

  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  for v_plan in select * from _sale_plans loop
    insert into public.transactions
      (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id, product_id, keterangan,
       user_id, client_request_id, client_batch_id)
    values
      (v_tanggal, 'income', 'penjualan', v_plan.price * v_plan.qty, v_plan.qty,
       v_plan.price, v_wallet.id, v_plan.product_id,
       nullif(btrim(p_keterangan), ''), auth.uid(), gen_random_uuid(), p_batch_id)
    returning * into v_tx;

    insert into public.transaction_costs (transaction_id, unit_cost, margin)
    values (v_tx.id, v_plan.cost, (v_plan.price - v_plan.cost) * v_plan.qty);

    v_total := v_total + v_tx.nominal;

    insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
    values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_tx.id, 'product_id', v_plan.product_id,
      'product_name', v_plan.product_name, 'qty', v_plan.qty,
      'unit_price', v_plan.price, 'unit_cost', v_plan.cost,
      'margin', (v_plan.price - v_plan.cost) * v_plan.qty,
      'nominal', v_tx.nominal, 'wallet_name', v_wallet.nama_wallet,
      'tanggal', v_tx.tanggal, 'duplicate', false
    ));
  end loop;

  update public.wallets set saldo = saldo + v_total where id = v_wallet.id;

  return v_result;
end;
$$;

-- ============================================================
-- Produk: riwayat harga, toggle, hapus
-- ============================================================
create or replace function public.change_product_prices(
  p_ids uuid[],
  p_mode text,
  p_jual numeric,
  p_beli numeric,
  p_effective_from date,
  p_rounding text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_round integer;
  v_id uuid;
  v_product public.products;
  v_base_beli numeric(14,2);
  v_base_jual numeric(14,2);
  v_next_beli numeric(14,2);
  v_next_jual numeric(14,2);
  v_price_beli numeric(14,2);
  v_price_jual numeric(14,2);
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    raise exception 'VALIDATION_ERROR:ids' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('percent', 'nominal') then
    raise exception 'VALIDATION_ERROR:mode' using errcode = '22023';
  end if;
  if p_rounding is null or p_rounding not in ('none', '100', '500', '1000') then
    raise exception 'VALIDATION_ERROR:rounding' using errcode = '22023';
  end if;
  if p_effective_from is null or p_effective_from > v_today then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;
  if coalesce(p_jual, 0) < 0 or coalesce(p_beli, 0) < 0
     or (coalesce(p_jual, 0) = 0 and coalesce(p_beli, 0) = 0) then
    raise exception 'VALIDATION_ERROR:nilai' using errcode = '22023';
  end if;
  if p_mode = 'percent' and (coalesce(p_jual, 0) > 100 or coalesce(p_beli, 0) > 100) then
    raise exception 'VALIDATION_ERROR:persen' using errcode = '22023';
  end if;

  v_round := case p_rounding when '100' then 100 when '500' then 500 when '1000' then 1000 else 0 end;

  for v_id in select distinct unnest(p_ids) loop
    select * into v_product from public.products
    where id = v_id and deleted_at is null for update;
    if not found then
      raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
    end if;

    select pp.harga_beli, pp.harga_jual into v_base_beli, v_base_jual
    from public.product_price_at(v_id, p_effective_from) pp;

    if coalesce(p_jual, 0) > 0 then
      v_next_jual := case when p_mode = 'percent'
        then v_base_jual * (1 + p_jual / 100) else v_base_jual + p_jual end;
      v_next_jual := case when v_round > 0
        then ceil(v_next_jual / v_round) * v_round else round(v_next_jual) end;
    else
      v_next_jual := v_base_jual;
    end if;

    if coalesce(p_beli, 0) > 0 then
      v_next_beli := case when p_mode = 'percent'
        then v_base_beli * (1 + p_beli / 100) else v_base_beli + p_beli end;
      v_next_beli := case when v_round > 0
        then ceil(v_next_beli / v_round) * v_round else round(v_next_beli) end;
    else
      v_next_beli := v_base_beli;
    end if;

    if v_next_jual <= 0 then
      raise exception 'VALIDATION_ERROR:harga' using errcode = '22023';
    end if;
    if v_next_jual < v_next_beli then
      raise exception 'INVALID_MARGIN' using errcode = 'P0001';
    end if;

    insert into public.product_prices
      (product_id, effective_from, harga_beli, harga_jual, created_by)
    values (v_id, p_effective_from, v_next_beli, v_next_jual, auth.uid())
    on conflict (product_id, effective_from) do update
      set harga_beli = excluded.harga_beli,
          harga_jual = excluded.harga_jual,
          created_by = excluded.created_by,
          created_at = now();

    select pp.harga_beli, pp.harga_jual into v_price_beli, v_price_jual
    from public.product_price_at(v_id, v_today) pp;

    update public.products
    set harga_jual = v_price_jual, updated_at = now()
    where id = v_id;

    insert into public.product_costs (product_id, harga_beli, updated_by)
    values (v_id, v_price_beli, auth.uid())
    on conflict (product_id) do update
      set harga_beli = excluded.harga_beli,
          updated_by = excluded.updated_by,
          updated_at = now();

    insert into public.audit_logs
      (table_name, record_id, action, old_values, new_values, actor_id)
    values
      ('products', v_id::text, 'price_change',
       jsonb_build_object('effective_from', p_effective_from,
                          'harga_beli', v_base_beli, 'harga_jual', v_base_jual),
       jsonb_build_object('effective_from', p_effective_from,
                          'harga_beli', v_next_beli, 'harga_jual', v_next_jual),
       auth.uid());

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object('updated', v_updated);
end;
$$;

create or replace function public.toggle_product(p_id uuid, p_is_active boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.products
  set is_active = p_is_active, updated_at = now()
  where id = p_id and deleted_at is null
  returning * into v_product;
  if not found then
    raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('products', p_id::text, case when p_is_active then 'activate' else 'deactivate' end,
          to_jsonb(v_product), auth.uid());
  return to_jsonb(v_product);
end;
$$;

create or replace function public.delete_products(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'VALIDATION_ERROR:ids' using errcode = '22023';
  end if;

  update public.products
  set deleted_at = now(), is_active = false, updated_at = now()
  where id = any(p_ids) and deleted_at is null;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (table_name, record_id, action, old_values, actor_id)
  select 'products', p.id::text, 'delete', to_jsonb(p), auth.uid()
  from public.products p
  where p.id = any(p_ids) and p.deleted_at is not null
    and p.deleted_at > now() - interval '1 minute';

  return jsonb_build_object('deleted', v_deleted);
end;
$$;

-- Upsert produk: catat riwayat harga saat harga berubah.
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
  v_cost numeric(14,2);
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_price_changed boolean := true;
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

    insert into public.product_prices
      (product_id, effective_from, harga_beli, harga_jual, created_by)
    values (v_product.id, v_today, p_harga_beli, p_harga_jual, auth.uid())
    on conflict (product_id, effective_from) do update
      set harga_beli = excluded.harga_beli,
          harga_jual = excluded.harga_jual;

    insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
    values ('products', v_product.id::text, 'insert', to_jsonb(v_product), auth.uid());
  else
    select * into v_product from public.products
    where id = p_id and deleted_at is null for update;
    if not found then
      raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
    end if;

    select harga_beli into v_cost from public.product_costs where product_id = p_id;
    v_price_changed := v_product.harga_jual is distinct from p_harga_jual
      or coalesce(v_cost, -1) is distinct from p_harga_beli;
    v_old := to_jsonb(v_product);

    update public.products
    set nama_produk = btrim(p_nama), operator = btrim(p_operator),
        harga_jual = p_harga_jual, updated_at = now()
    where id = p_id
    returning * into v_product;

    insert into public.product_costs (product_id, harga_beli, updated_by)
    values (p_id, p_harga_beli, auth.uid())
    on conflict (product_id) do update
      set harga_beli = excluded.harga_beli,
          updated_by = excluded.updated_by,
          updated_at = now();

    if v_price_changed then
      insert into public.product_prices
        (product_id, effective_from, harga_beli, harga_jual, created_by)
      values (p_id, v_today, p_harga_beli, p_harga_jual, auth.uid())
      on conflict (product_id, effective_from) do update
        set harga_beli = excluded.harga_beli,
            harga_jual = excluded.harga_jual,
            created_by = excluded.created_by,
            created_at = now();
    end if;

    insert into public.audit_logs
      (table_name, record_id, action, old_values, new_values, actor_id)
    values ('products', v_product.id::text, 'update', v_old, to_jsonb(v_product), auth.uid());
  end if;

  return to_jsonb(v_product) || jsonb_build_object('harga_beli', p_harga_beli);
end;
$$;

-- ============================================================
-- Edit & hapus transaksi
-- ============================================================
create or replace function public.update_transaction(
  p_id uuid,
  p_tanggal date,
  p_keterangan text,
  p_product_id uuid,
  p_qty integer,
  p_nominal numeric,
  p_kategori text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_wallet public.wallets;
  v_product public.products;
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_nominal numeric(14,2);
  v_delta numeric(14,2);
  v_qty integer;
  v_date date;
  v_tanggal timestamptz;
  v_reversal_exists boolean;
  v_old jsonb;
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

  select * into v_wallet from public.wallets where id = v_tx.wallet_id for update;
  if not found then
    raise exception 'NOT_FOUND:wallet' using errcode = 'P0002';
  end if;
  v_old := to_jsonb(v_tx);
  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  if v_tx.tipe = 'income' then
    select * into v_product from public.products
    where id = coalesce(p_product_id, v_tx.product_id) and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
    end if;

    select pp.harga_beli, pp.harga_jual into v_cost, v_price
    from public.product_price_at(v_product.id, v_date) pp;
    if v_cost is null then
      raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002';
    end if;
    if v_price < v_cost then
      raise exception 'INVALID_MARGIN' using errcode = 'P0001';
    end if;

    v_qty := coalesce(p_qty, v_tx.qty);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
    end if;
    v_nominal := v_price * v_qty;
    v_delta := v_nominal - v_tx.nominal;
    if v_wallet.saldo + v_delta < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.wallets set saldo = saldo + v_delta where id = v_wallet.id;
    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal, qty = v_qty, unit_price = v_price,
        product_id = v_product.id,
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;

    insert into public.transaction_costs (transaction_id, unit_cost, margin)
    values (v_tx.id, v_cost, (v_price - v_cost) * v_qty)
    on conflict (transaction_id) do update
      set unit_cost = excluded.unit_cost, margin = excluded.margin;
  elsif v_tx.tipe = 'expense' then
    v_nominal := coalesce(p_nominal, v_tx.nominal);
    if v_nominal <= 0 then
      raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
    end if;
    if v_wallet.saldo + (v_tx.nominal - v_nominal) < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;
    update public.wallets
    set saldo = saldo + (v_tx.nominal - v_nominal) where id = v_wallet.id;
    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal,
        kategori = coalesce(nullif(btrim(p_kategori), ''), kategori),
        keterangan = coalesce(nullif(btrim(p_keterangan), ''), keterangan),
        updated_at = now()
    where id = v_tx.id
    returning * into v_tx;
  elsif v_tx.tipe = 'transfer' then
    v_nominal := coalesce(p_nominal, v_tx.nominal);
    if v_nominal <= 0 then
      raise exception 'VALIDATION_ERROR:nominal' using errcode = '22023';
    end if;
    if v_wallet.saldo + (v_tx.nominal - v_nominal) < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;
    update public.wallets set saldo = saldo + (v_tx.nominal - v_nominal) where id = v_wallet.id;
    update public.wallets set saldo = saldo - (v_tx.nominal - v_nominal)
    where id = v_tx.wallet_destination_id;
    update public.transactions
    set tanggal = v_tanggal, nominal = v_nominal,
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
  v_delta numeric(14,2);
  v_deleted integer := 0;
  v_snapshot jsonb;
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
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.product_price_at(uuid, date)',
    'public.create_sale_at(uuid, integer, text, uuid, date, text)',
    'public.create_sales(jsonb, text, date, text)',
    'public.change_product_prices(uuid[], text, numeric, numeric, date, text)',
    'public.toggle_product(uuid, boolean)',
    'public.delete_products(uuid[])',
    'public.update_transaction(uuid, date, text, uuid, integer, numeric, text)',
    'public.delete_transactions(uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
