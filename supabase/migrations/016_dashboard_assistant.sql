-- Auditoría del asistente analítico del dashboard.

create table if not exists public.dashboard_assistant_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  question text not null,
  intent text not null,
  is_supported boolean not null default false,
  answer text not null default '',
  provider text not null default 'openai',
  model text not null,
  status text not null check (status in ('succeeded', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_assistant_runs_created_idx
  on public.dashboard_assistant_runs (created_at desc);
create index if not exists dashboard_assistant_runs_user_idx
  on public.dashboard_assistant_runs (requested_by, created_at desc);

alter table public.dashboard_assistant_runs enable row level security;

create policy "dashboard users can read assistant metrics"
  on public.dashboard_assistant_runs for select to authenticated
  using (public.has_permission('dashboards.view'));

