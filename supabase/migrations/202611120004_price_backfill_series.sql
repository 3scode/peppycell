-- 202611120004_price_backfill_series.sql
-- 1) Titik harga historis dari transaksi tertua tiap produk, supaya penjualan
--    bertanggal mundur tetap memakai harga saat itu.
insert into public.product_prices (product_id, effective_from, harga_beli, harga_jual, created_at)
select distinct on (t.product_id)
  t.product_id,
  (t.tanggal at time zone 'Asia/Jakarta')::date,
  coalesce(tc.unit_cost, pc.harga_beli, 0),
  t.unit_price,
  t.tanggal
from public.transactions t
left join public.transaction_costs tc on tc.transaction_id = t.id
left join public.product_costs pc on pc.product_id = t.product_id
where t.tipe = 'income'
  and t.product_id is not null
  and t.unit_price is not null
order by t.product_id, t.tanggal asc
on conflict (product_id, effective_from) do nothing;

-- 2) Seri grafik dashboard untuk 7/30 hari (income = omzet, profit = margin - opex).
create or replace function public.dashboard_series(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_start date := v_today - (v_days - 1);
  v_result jsonb;
begin
  if v_role is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if v_role = 'karyawan' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(d::date, 'YYYY-MM-DD'),
      'income', (
        select count(*) from public.transactions t
        where t.user_id = auth.uid() and t.tipe = 'income' and t.status = 'active'
          and t.reversal_of is null and t.import_batch_id is null
          and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
      ),
      'expense', 0,
      'profit', 0
    ) order by d), '[]'::jsonb)
    into v_result
    from generate_series(v_start, v_today, interval '1 day') d;
    return v_result;
  end if;

  if v_role not in ('admin', 'investor') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d::date, 'YYYY-MM-DD'),
    'income', coalesce((
      select sum(t.nominal) from public.transactions t
      where t.tipe = 'income' and t.status = 'active' and t.reversal_of is null
        and t.import_batch_id is null
        and (t.tanggal at time zone 'Asia/Jakarta')::date = d::date
    ), 0),
    'expense', coalesce((
      select sum(t.nominal) from public.transactions t
      where t.tipe = 'expense' and t.status = 'active' and t.reversal_of is null
        and t.import_batch_id is null
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
  into v_result
  from generate_series(v_start, v_today, interval '1 day') d;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_series(integer) from public, anon;
grant execute on function public.dashboard_series(integer) to authenticated;
