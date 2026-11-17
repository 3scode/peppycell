-- 202611150004_user_soft_delete.sql
-- Menghapus pengguna tidak bisa dilakukan dengan hard delete: public.users
-- dirujuk banyak foreign key riwayat (transaksi, audit log, payout, wallet
-- adjustment, dll) tanpa ON DELETE, sehingga penghapusan selalu gagal.
--
-- Solusinya soft delete: baris public.users dipertahankan agar nama pada
-- riwayat tetap valid, lalu deleted_at diisi dan is_active dimatikan.
-- Akun auth-nya juga di-soft-delete lewat Supabase Auth admin API.

alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_deleted_at_idx on public.users (deleted_at);

-- Akun yang sudah dihapus tidak boleh dihitung sebagai admin aktif.
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
    new.deleted_at := old.deleted_at;
  end if;

  if old.role = 'admin' and old.is_active and old.deleted_at is null
     and (new.role <> 'admin' or new.is_active = false or new.deleted_at is not null) then
    if not exists (
      select 1 from public.users
      where role = 'admin' and is_active = true and deleted_at is null and id <> old.id
    ) then
      raise exception 'CONFLICT:admin terakhir tidak boleh dinonaktifkan/diturunkan'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
