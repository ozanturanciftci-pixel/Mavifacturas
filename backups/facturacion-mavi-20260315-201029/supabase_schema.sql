-- Mavi Facturacion: acceso publico (sin login)
-- Ejecutar en Supabase SQL Editor

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

alter table public.app_meta enable row level security;
alter table public.invoices enable row level security;
alter table public.settlements enable row level security;

-- Acceso publico completo (anon + authenticated)
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
