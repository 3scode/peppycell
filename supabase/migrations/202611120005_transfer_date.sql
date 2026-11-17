-- 202611120005_transfer_date.sql
-- Tambah tanggal pilihan untuk transaksi transfer tanpa mengubah pemanggil lama.
create or replace function public.transfer_wallet(
  p_from_id uuid,
  p_to_id uuid,
  p_nominal numeric,
  p_keterangan text,
  p_client_request_id uuid,
  p_tanggal date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.wallets;
  v_to public.wallets;
  v_tx public.transactions;
  v_date date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_tanggal timestamptz;
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
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'VALIDATION_ERROR:tanggal' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions
  where client_request_id = p_client_request_id;
  if found then
    if v_tx.tipe <> 'transfer' or v_tx.wallet_id <> p_from_id
       or v_tx.wallet_destination_id <> p_to_id or v_tx.nominal <> p_nominal
       or (p_tanggal is not null and (v_tx.tanggal at time zone 'Asia/Jakarta')::date <> v_date) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', v_tx.id, 'tanggal', v_tx.tanggal, 'duplicate', true);
  end if;

  perform 1 from public.wallets
  where id in (p_from_id, p_to_id)
  order by id
  for update;

  select * into v_from from public.wallets
  where id = p_from_id and is_active = true and deleted_at is null;
  if not found then raise exception 'WALLET_INACTIVE:asal' using errcode = 'P0002'; end if;
  select * into v_to from public.wallets
  where id = p_to_id and is_active = true and deleted_at is null;
  if not found then raise exception 'WALLET_INACTIVE:tujuan' using errcode = 'P0002'; end if;
  if v_from.saldo < p_nominal then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  v_tanggal := (v_date::timestamp + time '12:00') at time zone 'Asia/Jakarta';

  insert into public.transactions
    (tanggal, tipe, kategori, nominal, qty, wallet_id, wallet_destination_id,
     keterangan, user_id, client_request_id)
  values
    (v_tanggal, 'transfer', 'transfer', p_nominal, 1, p_from_id, p_to_id,
     btrim(p_keterangan), auth.uid(), p_client_request_id)
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

revoke execute on function public.transfer_wallet(uuid, uuid, numeric, text, uuid, date) from public, anon;
grant execute on function public.transfer_wallet(uuid, uuid, numeric, text, uuid, date) to authenticated;
