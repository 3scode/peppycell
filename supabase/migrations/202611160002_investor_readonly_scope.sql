-- 202611160002_investor_readonly_scope.sql
-- Tujuan:
-- 1. Investor hanya bisa melihat payout/deviden miliknya lewat RPC dengan field aman.
-- 2. Akses langsung ke tabel payout_history/payout_items ditutup untuk investor,
--    supaya kolom sensitif (kas ditahan, total dibagikan, alokasi, pembuat)
--    tidak bisa dibaca lewat PostgREST hanya dengan JWT investor.

-- ============================================================
-- 1. Tutup akses tabel langsung untuk investor
-- ============================================================
drop policy if exists payout_items_investor on public.payout_items;
drop policy if exists payout_history_investor on public.payout_history;

-- ============================================================
-- 2. RPC daftar payout versi investor (field aman + item milik sendiri)
-- ============================================================
create or replace function public.list_investor_payouts(
  p_status text default null,
  p_year integer default null,
  p_month integer default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_rows jsonb;
begin
  if public.current_user_role() is distinct from 'investor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.payout_history p
  where exists (
      select 1 from public.payout_items pi
      where pi.payout_id = p.id and pi.user_id = auth.uid()
    )
    and (p_status is null or p.status::text = p_status)
    and (p_year is null or extract(year from p.start_date)::int = p_year)
    and (p_month is null or extract(month from p.start_date)::int = p_month);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      p.id,
      p.start_date,
      p.end_date,
      p.net_profit_total as net_profit,
      p.status,
      p.notes,
      p.created_at,
      p.completed_at,
      w.nama_wallet::text as wallet_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pi.id,
          'payout_id', pi.payout_id,
          'user_id', pi.user_id,
          'category', pi.category,
          'weight_pct', pi.weight_pct,
          'amount', pi.amount,
          'transaction_id', pi.transaction_id
        ) order by pi.created_at)
        from public.payout_items pi
        where pi.payout_id = p.id and pi.user_id = auth.uid()
      ), '[]'::jsonb) as items
    from public.payout_history p
    left join public.wallets w on w.id = p.wallet_id
    where exists (
        select 1 from public.payout_items pi
        where pi.payout_id = p.id and pi.user_id = auth.uid()
      )
      and (p_status is null or p.status::text = p_status)
      and (p_year is null or extract(year from p.start_date)::int = p_year)
      and (p_month is null or extract(month from p.start_date)::int = p_month)
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- ============================================================
-- 3. RPC detail payout versi investor
-- ============================================================
create or replace function public.get_investor_payout(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if public.current_user_role() is distinct from 'investor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select to_jsonb(x)
  into v_result
  from (
    select
      p.id,
      p.start_date,
      p.end_date,
      p.net_profit_total as net_profit,
      p.status,
      p.notes,
      p.created_at,
      p.completed_at,
      w.nama_wallet::text as wallet_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pi.id,
          'payout_id', pi.payout_id,
          'user_id', pi.user_id,
          'category', pi.category,
          'weight_pct', pi.weight_pct,
          'amount', pi.amount,
          'transaction_id', pi.transaction_id
        ) order by pi.created_at)
        from public.payout_items pi
        where pi.payout_id = p.id and pi.user_id = auth.uid()
      ), '[]'::jsonb) as items
    from public.payout_history p
    left join public.wallets w on w.id = p.wallet_id
    where p.id = p_id
      and exists (
        select 1 from public.payout_items pi
        where pi.payout_id = p.id and pi.user_id = auth.uid()
      )
  ) x;

  return v_result;
end;
$$;

-- ============================================================
-- 4. Masking RPC receipt lama agar tidak membocorkan field agregat
-- ============================================================
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

  -- Investor hanya boleh melihat profit bersih, status, periode, wallet, dan
  -- baris deviden miliknya. Field agregat perusahaan dibuang.
  if v_role = 'investor' then
    v_result := v_result
      - 'gross_margin_total'
      - 'operating_expense_total'
      - 'retained_earnings'
      - 'total_distributed'
      - 'allocations'
      - 'created_by'
      - 'idempotency_key'
      - 'failed_reason';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.list_investor_payouts(text, integer, integer, integer, integer) from public, anon;
revoke execute on function public.get_investor_payout(uuid) from public, anon;
grant execute on function public.list_investor_payouts(text, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_investor_payout(uuid) to authenticated;
