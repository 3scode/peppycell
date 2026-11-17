-- 202611070003_core_tables.sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 2 and 60),
  role public.user_role not null default 'karyawan',
  default_profit_share numeric(5,2) not null default 0 check (default_profit_share between 0 and 100),
  is_active boolean not null default true,
  avatar_url text,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  notification_payout boolean not null default true,
  invited_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_uidx on public.users (lower(email));

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  nama_wallet varchar(40) not null unique,
  tipe public.wallet_type not null default 'cash',
  saldo numeric(14,2) not null default 0 check (saldo >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index wallets_default_uidx on public.wallets (is_default) where is_default;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  nama_produk varchar(60) not null,
  operator varchar(20) not null,
  harga_jual numeric(14,2) not null check (harga_jual > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_nama_lower_uidx on public.products (lower(nama_produk));

create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  harga_beli numeric(14,2) not null check (harga_beli >= 0),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table public.payout_settings (
  id smallint primary key default 1 check (id = 1),
  retained_pct numeric(5,2) not null default 20 check (retained_pct between 0 and 100),
  admin_pct numeric(5,2) not null default 40 check (admin_pct between 0 and 100),
  investor_pct numeric(5,2) not null default 30 check (investor_pct between 0 and 100),
  employee_pct numeric(5,2) not null default 10 check (employee_pct between 0 and 100),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  check (retained_pct + admin_pct + investor_pct + employee_pct = 100)
);

create table public.payout_history (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  gross_margin_total numeric(14,2) not null default 0,
  operating_expense_total numeric(14,2) not null default 0,
  net_profit_total numeric(14,2) not null default 0,
  retained_earnings numeric(14,2) not null default 0,
  total_distributed numeric(14,2) not null default 0,
  wallet_id uuid not null references public.wallets(id),
  status public.payout_status not null default 'processing',
  idempotency_key text not null unique,
  allocations jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_reason text,
  unique (start_date, end_date),
  check (total_distributed = net_profit_total - retained_earnings)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('csv', 'xlsx', 'manual')),
  filename text not null,
  row_count integer not null default 0,
  status text not null check (status in ('dry_run', 'committed', 'rolled_back', 'failed')),
  report jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  tanggal timestamptz not null default now(),
  tipe public.transaction_type not null,
  kategori varchar(30) not null,
  nominal numeric(14,2) not null check (nominal > 0),
  qty integer not null default 1 check (qty > 0),
  unit_price numeric(14,2) check (unit_price >= 0),
  wallet_id uuid not null references public.wallets(id),
  wallet_destination_id uuid references public.wallets(id),
  product_id uuid references public.products(id),
  keterangan text check (char_length(keterangan) <= 200),
  payout_id uuid references public.payout_history(id),
  user_id uuid not null references public.users(id),
  status public.transaction_status not null default 'active',
  reversal_of uuid references public.transactions(id),
  legacy_ref text unique,
  client_request_id uuid not null unique default gen_random_uuid(),
  import_batch_id uuid references public.import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_tipe_shape check (
    (tipe = 'income'   and product_id is not null and unit_price is not null
                       and wallet_destination_id is null) or
    (tipe = 'expense'  and product_id is null and unit_price is null
                       and wallet_destination_id is null) or
    (tipe = 'transfer' and product_id is null and unit_price is null
                       and wallet_destination_id is not null
                       and wallet_destination_id <> wallet_id) or
    (tipe = 'payout'   and product_id is null and unit_price is null
                       and wallet_destination_id is null and payout_id is not null)
  )
);
create unique index transactions_reversal_uidx
  on public.transactions (reversal_of) where reversal_of is not null;

create table public.transaction_costs (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  margin numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table public.payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_history(id) on delete cascade,
  user_id uuid not null references public.users(id),
  category public.payout_category not null,
  weight_pct numeric(5,2) not null default 0 check (weight_pct between 0 and 100),
  amount numeric(14,2) not null check (amount > 0),
  transaction_id uuid unique references public.transactions(id),
  created_at timestamptz not null default now(),
  unique (payout_id, user_id, category)
);

create table public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id),
  old_balance numeric(14,2) not null,
  new_balance numeric(14,2) not null check (new_balance >= 0),
  delta numeric(14,2) not null check (delta <> 0),
  reason text not null check (char_length(reason) >= 10),
  actor_id uuid not null references public.users(id),
  client_request_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  reason text,
  actor_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
