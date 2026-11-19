-- Modal disetor untuk laporan "aset vs laba" di halaman Wallet & Aset.
-- Laba berjalan = total aset aktif - modal disetor.
alter table public.payout_settings
  add column if not exists modal_disetor numeric(14,2) not null default 0
  check (modal_disetor >= 0);

comment on column public.payout_settings.modal_disetor is
  'Modal yang disetor pemilik. Dipakai untuk menghitung laba berjalan = total aset - modal.';

-- Nilai awal untuk konter ini: modal disetor Rp 1.000.000.
update public.payout_settings
set modal_disetor = 1000000
where id = 1 and modal_disetor = 0;

create or replace function public.update_modal_disetor(p_modal numeric)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_old jsonb;
  v_row public.payout_settings;
begin
  if v_role is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_modal is null or p_modal < 0 or p_modal <> trunc(p_modal) then
    raise exception 'VALIDATION_ERROR:modal' using errcode = '22023';
  end if;

  select to_jsonb(s) into v_old from public.payout_settings s where s.id = 1;

  insert into public.payout_settings as s (id, modal_disetor, updated_by)
  values (1, p_modal, auth.uid())
  on conflict (id) do update
    set modal_disetor = excluded.modal_disetor,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  insert into public.audit_logs
    (table_name, record_id, action, old_values, new_values, actor_id)
  values
    ('payout_settings', '1', 'update', v_old, to_jsonb(v_row), auth.uid());

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.update_modal_disetor(numeric) from public, anon;
grant execute on function public.update_modal_disetor(numeric) to authenticated;
