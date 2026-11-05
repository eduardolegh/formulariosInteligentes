-- Observabilidad unificada para operaciones del LLM distintas del análisis de respuestas.

create table if not exists public.llm_operation_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  form_id uuid references public.forms(id) on delete set null,
  operation_type text not null check (operation_type in ('form_generation', 'form_edit', 'dashboard_assistant')),
  provider text not null,
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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists llm_operation_runs_started_idx on public.llm_operation_runs (started_at desc);
create index if not exists llm_operation_runs_user_idx on public.llm_operation_runs (requested_by, started_at desc);
create index if not exists llm_operation_runs_operation_idx on public.llm_operation_runs (operation_type, started_at desc);

alter table public.llm_operation_runs enable row level security;
drop policy if exists "dashboard users read llm operation runs" on public.llm_operation_runs;
create policy "dashboard users read llm operation runs" on public.llm_operation_runs for select to authenticated
using (requested_by = auth.uid() or public.has_permission('dashboards.view') or public.has_permission('users.manage'));

-- Incorpora el historial que ya existía para el asistente del dashboard.
insert into public.llm_operation_runs (id, requested_by, operation_type, provider, model, status, started_at, completed_at, duration_ms, input_tokens, output_tokens, total_tokens, estimated_cost_usd, error_message, metadata, created_at)
select id, requested_by, 'dashboard_assistant', provider, model, status, started_at, completed_at, duration_ms, input_tokens, output_tokens, total_tokens, estimated_cost_usd, error_message, jsonb_build_object('intent', intent, 'supported', is_supported), created_at
from public.dashboard_assistant_runs
on conflict (id) do nothing;

create or replace function public.get_llm_operation_runs()
returns table (id uuid, requested_by uuid, requested_by_name text, form_id uuid, form_name text, operation_type text, provider text, model text, status text, started_at timestamptz, completed_at timestamptz, duration_ms integer, input_tokens integer, output_tokens integer, total_tokens integer, estimated_cost_usd numeric, error_message text, metadata jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.has_permission('dashboards.view') or public.has_permission('users.manage')) then
    raise exception 'No tienes permiso para consultar las ejecuciones del LLM.';
  end if;
  return query
  select r.id, r.requested_by, coalesce(nullif(trim(p.full_name), ''), 'Usuario del sistema'), r.form_id, f.name, r.operation_type, r.provider, r.model, r.status, r.started_at, r.completed_at, r.duration_ms, r.input_tokens, r.output_tokens, r.total_tokens, r.estimated_cost_usd, r.error_message, r.metadata
  from public.llm_operation_runs r
  left join public.profiles p on p.id = r.requested_by
  left join public.forms f on f.id = r.form_id
  order by r.started_at desc;
end;
$$;

revoke all on function public.get_llm_operation_runs() from public;
grant execute on function public.get_llm_operation_runs() to authenticated;
