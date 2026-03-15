-- Mavi Facturacion - SQL Editor Ready (idempotent + migration-safe)
-- Public access model (no login required)

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Ensure tables exist
create table if not exists public.app_meta (
  id text primary key,
  months jsonb not null default '[]'::jsonb,
  active_month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key,
  month text not null,
  title text not null default '',
  client text not null default '',
  invoice_no text not null default '',
  base_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  issued_by text not null default '',
  issue_date date,
  due_date date,
  status text not null default 'Pendiente',
  paid_amount numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key,
  month text not null,
  client text not null default '',
  invoice_no text not null default '',
  amount numeric(12,2) not null default 0,
  status text not null default 'Pendiente',
  liquidation text not null default 'Pendiente',
  owe_amaia numeric(12,2) not null default 0,
  owe_oihane numeric(12,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Migrate old column names (period -> month) if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='period'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='month'
  ) then
    alter table public.invoices rename column period to month;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='settlements' and column_name='period'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='settlements' and column_name='month'
  ) then
    alter table public.settlements rename column period to month;
  end if;
end
$$;

-- 3) Ensure required columns exist (safe for pre-existing tables)
alter table public.invoices add column if not exists month text;
alter table public.invoices add column if not exists title text not null default '';
alter table public.invoices add column if not exists client text not null default '';
alter table public.invoices add column if not exists invoice_no text not null default '';
alter table public.invoices add column if not exists base_amount numeric(12,2) not null default 0;
alter table public.invoices add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.invoices add column if not exists issued_by text not null default '';
alter table public.invoices add column if not exists issue_date date;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists status text not null default 'Pendiente';
alter table public.invoices add column if not exists paid_amount numeric(12,2) not null default 0;
alter table public.invoices add column if not exists notes text not null default '';
alter table public.invoices add column if not exists created_at timestamptz not null default now();
alter table public.invoices add column if not exists updated_at timestamptz not null default now();

alter table public.settlements add column if not exists month text;
alter table public.settlements add column if not exists client text not null default '';
alter table public.settlements add column if not exists invoice_no text not null default '';
alter table public.settlements add column if not exists amount numeric(12,2) not null default 0;
alter table public.settlements add column if not exists status text not null default 'Pendiente';
alter table public.settlements add column if not exists liquidation text not null default 'Pendiente';
alter table public.settlements add column if not exists owe_amaia numeric(12,2) not null default 0;
alter table public.settlements add column if not exists owe_oihane numeric(12,2) not null default 0;
alter table public.settlements add column if not exists note text not null default '';
alter table public.settlements add column if not exists created_at timestamptz not null default now();
alter table public.settlements add column if not exists updated_at timestamptz not null default now();

alter table public.app_meta add column if not exists months jsonb not null default '[]'::jsonb;
alter table public.app_meta add column if not exists active_month text;
alter table public.app_meta add column if not exists created_at timestamptz not null default now();
alter table public.app_meta add column if not exists updated_at timestamptz not null default now();

-- 4) Triggers
drop trigger if exists trg_meta_touch_updated_at on public.app_meta;
create trigger trg_meta_touch_updated_at
before update on public.app_meta
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_invoices_touch_updated_at on public.invoices;
create trigger trg_invoices_touch_updated_at
before update on public.invoices
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_settlements_touch_updated_at on public.settlements;
create trigger trg_settlements_touch_updated_at
before update on public.settlements
for each row
execute function public.touch_updated_at();

-- 5) RLS + Public policies
alter table public.app_meta enable row level security;
alter table public.invoices enable row level security;
alter table public.settlements enable row level security;

drop policy if exists app_meta_all_public on public.app_meta;
create policy app_meta_all_public
on public.app_meta
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists invoices_all_public on public.invoices;
create policy invoices_all_public
on public.invoices
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists settlements_all_public on public.settlements;
create policy settlements_all_public
on public.settlements
for all
to anon, authenticated
using (true)
with check (true);
