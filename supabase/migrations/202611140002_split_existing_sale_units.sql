-- 202611140002_split_existing_sale_units.sql
-- Pisahkan transaksi penjualan lama yang masih qty > 1 menjadi satu transaksi
-- per unit. Total nominal, margin, biaya modal, dan saldo wallet tidak berubah
-- karena hanya barisnya yang dipecah.
--
-- Yang diproses: penjualan aktif yang bukan hasil import, bukan payout, dan
-- bukan jurnal reversal. Transaksi void dan pasangan reversal-nya sengaja
-- dilewati agar jejak audit pembatalan tetap utuh.

-- Jaga-jaga bila migration 202611140001 belum diterapkan.
drop index if exists public.transactions_batch_product_uidx;

-- Backup baris asli sebelum dipecah. Bisa dihapus manual setelah data dicek.
create table if not exists public.sale_split_backup_20261114 (
  transaction_id uuid primary key,
  old_transaction jsonb not null,
  old_cost jsonb,
  split_at timestamptz not null default now()
);
revoke all on public.sale_split_backup_20261114 from anon, authenticated;
alter table public.sale_split_backup_20261114 enable row level security;
comment on table public.sale_split_backup_20261114 is
  'Backup transaksi penjualan qty > 1 sebelum dipecah per unit (14 Nov 2026). Aman dihapus setelah data diverifikasi.';

do $$
declare
  v_id uuid;
  v_tx public.transactions;
  v_updated public.transactions;
  v_new public.transactions;
  v_cost public.transaction_costs;
  v_has_cost boolean;
  v_qty integer;
  v_price numeric(14,2);
  v_unit_cost numeric(14,2);
  v_total_margin numeric(14,2);
  v_total_source numeric(14,2);
  v_remaining_nominal numeric(14,2);
  v_remaining_margin numeric(14,2);
  v_remaining_source numeric(14,2);
  v_nominal numeric(14,2);
  v_margin numeric(14,2);
  v_source numeric(14,2);
  v_i integer;
  v_created integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('202611140002_split_existing_sale_units', 0)
  );

  drop table if exists pg_temp._split_sale_targets;
  create temp table _split_sale_targets on commit drop as
  select t.id
  from public.transactions t
  where t.tipe = 'income'
    and t.kategori = 'penjualan'
    and t.qty > 1
    and t.status = 'active'
    and t.reversal_of is null
    and t.import_batch_id is null
    and t.payout_id is null
    and t.product_id is not null
    and t.unit_price is not null
  order by t.tanggal, t.id;

  for v_id in select id from _split_sale_targets loop
    select * into v_tx from public.transactions where id = v_id for update;
    if not found then
      continue;
    end if;

    v_qty := v_tx.qty;
    v_price := v_tx.unit_price;

    select * into v_cost
    from public.transaction_costs
    where transaction_id = v_tx.id;
    v_has_cost := found;

    if v_has_cost then
      v_unit_cost := coalesce(v_cost.unit_cost, 0);
      v_total_margin := coalesce(v_cost.margin, (v_price - v_unit_cost) * v_qty);
      v_total_source := coalesce(
        v_cost.source_cost,
        case when v_tx.source_wallet_id is not null then v_unit_cost * v_qty else 0 end
      );
    else
      select pp.harga_beli into v_unit_cost
      from public.product_price_at(
        v_tx.product_id,
        (v_tx.tanggal at time zone 'Asia/Jakarta')::date
      ) pp;
      v_unit_cost := coalesce(v_unit_cost, 0);
      v_total_margin := (v_price - v_unit_cost) * v_qty;
      v_total_source := case
        when v_tx.source_wallet_id is not null then v_unit_cost * v_qty
        else 0
      end;
    end if;

    v_remaining_nominal := v_tx.nominal;
    v_remaining_margin := v_total_margin;
    v_remaining_source := v_total_source;

    insert into public.sale_split_backup_20261114
      (transaction_id, old_transaction, old_cost)
    values (
      v_tx.id,
      to_jsonb(v_tx),
      case when v_has_cost then to_jsonb(v_cost) else null end
    )
    on conflict (transaction_id) do nothing;

    for v_i in 1 .. v_qty loop
      if v_i = v_qty then
        v_nominal := v_remaining_nominal;
        v_margin := v_remaining_margin;
        v_source := v_remaining_source;
      else
        v_nominal := trunc(v_remaining_nominal / (v_qty - v_i + 1), 2);
        v_margin := trunc(v_remaining_margin / (v_qty - v_i + 1), 2);
        v_source := trunc(v_remaining_source / (v_qty - v_i + 1), 2);
      end if;
      v_remaining_nominal := v_remaining_nominal - v_nominal;
      v_remaining_margin := v_remaining_margin - v_margin;
      v_remaining_source := v_remaining_source - v_source;

      if v_i = 1 then
        -- Unit pertama tetap memakai id transaksi lama.
        update public.transactions
        set qty = 1,
            nominal = v_nominal,
            unit_price = v_price,
            updated_at = now()
        where id = v_tx.id
        returning * into v_updated;

        if v_has_cost then
          update public.transaction_costs
          set unit_cost = v_unit_cost,
              margin = v_margin,
              source_cost = v_source
          where transaction_id = v_tx.id;
        else
          insert into public.transaction_costs
            (transaction_id, unit_cost, margin, source_cost)
          values (v_tx.id, v_unit_cost, v_margin, v_source);
        end if;

        insert into public.audit_logs
          (table_name, record_id, action, old_values, new_values, reason, actor_id)
        values
          ('transactions', v_tx.id::text, 'split_sale_unit',
           to_jsonb(v_tx), to_jsonb(v_updated),
           'Pecah qty ' || v_qty || ' menjadi transaksi per unit.', v_tx.user_id);
      else
        insert into public.transactions
          (tanggal, tipe, kategori, nominal, qty, unit_price, wallet_id,
           wallet_destination_id, product_id, keterangan, payout_id, user_id,
           status, reversal_of, legacy_ref, client_request_id, import_batch_id,
           created_at, updated_at, client_batch_id, source_wallet_id)
        values
          (v_tx.tanggal, v_tx.tipe, v_tx.kategori, v_nominal, 1, v_price,
           v_tx.wallet_id, v_tx.wallet_destination_id, v_tx.product_id,
           v_tx.keterangan, v_tx.payout_id, v_tx.user_id, v_tx.status,
           v_tx.reversal_of, null, gen_random_uuid(), v_tx.import_batch_id,
           v_tx.created_at, now(), v_tx.client_batch_id, v_tx.source_wallet_id)
        returning * into v_new;

        insert into public.transaction_costs
          (transaction_id, unit_cost, margin, source_cost)
        values (v_new.id, v_unit_cost, v_margin, v_source);

        insert into public.audit_logs
          (table_name, record_id, action, old_values, new_values, reason, actor_id)
        values
          ('transactions', v_new.id::text, 'insert', null, to_jsonb(v_new),
           'Pecah qty ' || v_qty || ' menjadi transaksi per unit.', v_tx.user_id);
      end if;
    end loop;

    v_created := v_created + v_qty - 1;
  end loop;

  raise notice 'Split selesai: % transaksi baru dibuat.', v_created;
end;
$$;
