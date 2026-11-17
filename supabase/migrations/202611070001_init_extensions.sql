-- 202611070001_init_extensions.sql
-- Ekstensi dasar untuk UUID, hashing, dan kebutuhan operasional Supabase.
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Timezone aplikasi: perhitungan periode memakai WIB eksplisit di fungsi SQL.
alter database postgres set timezone to 'Asia/Jakarta';
