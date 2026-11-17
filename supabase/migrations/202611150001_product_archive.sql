-- 202611150001_product_archive.sql
-- Arsip produk memakai mekanisme soft delete yang sudah ada (products.deleted_at).
-- Produk yang diarsipkan hilang dari katalog dan input penjualan, tetapi baris
-- transaksi lama tetap terhubung ke products sehingga riwayat tidak berubah.
-- Produk juga bisa dipulihkan kembali sebagai nonaktif.

create or replace function public.archive_products(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_archived integer := 0;
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

  get diagnostics v_archived = row_count;
  if v_archived = 0 then
    raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (table_name, record_id, action, old_values, actor_id)
  select 'products', p.id::text, 'archive', to_jsonb(p), auth.uid()
  from public.products p
  where p.id = any(p_ids)
    and p.deleted_at is not null
    and p.deleted_at > now() - interval '1 minute';

  return jsonb_build_object('archived', v_archived);
end;
$$;

create or replace function public.restore_products(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_restored integer := 0;
  v_conflict text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'VALIDATION_ERROR:ids' using errcode = '22023';
  end if;

  -- Nama produk unik untuk baris yang tidak diarsipkan. Cek lebih dulu agar
  -- pesan errornya jelas, bukan sekadar unique violation.
  select p.nama_produk into v_conflict
  from public.products p
  where p.id = any(p_ids)
    and p.deleted_at is not null
    and exists (
      select 1
      from public.products q
      where q.deleted_at is null
        and q.id <> p.id
        and lower(q.nama_produk) = lower(p.nama_produk)
    )
  limit 1;

  if v_conflict is not null then
    raise exception 'CONFLICT:Nama produk "%" masih dipakai produk lain. Ubah nama produk tersebut dulu.', v_conflict
      using errcode = 'P0001';
  end if;

  update public.products
  set deleted_at = null, is_active = false, updated_at = now()
  where id = any(p_ids) and deleted_at is not null;

  get diagnostics v_restored = row_count;
  if v_restored = 0 then
    raise exception 'NOT_FOUND:produk' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  select 'products', p.id::text, 'restore', to_jsonb(p), auth.uid()
  from public.products p
  where p.id = any(p_ids)
    and p.deleted_at is null
    and p.updated_at > now() - interval '1 minute';

  return jsonb_build_object('restored', v_restored);
end;
$$;

revoke execute on function public.archive_products(uuid[]) from public, anon;
revoke execute on function public.restore_products(uuid[]) from public, anon;
grant execute on function public.archive_products(uuid[]) to authenticated;
grant execute on function public.restore_products(uuid[]) to authenticated;
