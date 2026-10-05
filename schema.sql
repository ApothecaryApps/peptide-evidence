-- Intended cloud schema. Do not apply until RLS is reviewed.
-- Never use USING (true) on private tables.

create table if not exists profiles (
  user_id text primary key,
  role text not null check (role in ('patient','physician','lab','admin')),
  created_at timestamptz default now()
);

create table if not exists protocols (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(user_id),
  peptide text not null,
  diagnosis text not null,
  dose text,
  frequency text,
  route text,
  weeks numeric,
  status text,
  start_weight numeric,
  current_weight numeric,
  start_bf numeric,
  current_bf numeric,
  start_waist numeric,
  current_waist numeric,
  labs text,
  results text,
  side_effects text,
  efficacy_rating int,
  notes text,
  created_at timestamptz default now()
);

create table if not exists lot_reports (
  id uuid primary key default gen_random_uuid(),
  peptide text not null,
  vendor text,
  lot text not null,
  labeled_mg numeric,
  lab_id text not null references profiles(user_id),
  lab_name text not null,
  test_date date,
  assays jsonb not null default '[]',
  status text not null default 'submitted' check (status in ('submitted','lab_attested','rejected')),
  notes text,
  created_at timestamptz default now()
);

-- Public aggregates must be a view that strips user_id.
create or replace view protocol_aggregates as
select
  peptide,
  diagnosis,
  count(*)::int as n,
  avg(efficacy_rating) as mean_rating,
  count(*) filter (where status = 'Active') as active_n,
  count(*) filter (where status = 'Completed') as completed_n,
  count(*) filter (where status = 'Stopped') as stopped_n
from protocols
group by peptide, diagnosis;
