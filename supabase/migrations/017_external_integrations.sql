-- Catálogo, asignaciones y trazabilidad de integraciones HTTP externas.

insert into public.permissions (key, name, description) values
  ('integrations.view', 'Ver integraciones', 'Consultar integraciones externas y sus ejecuciones'),
  ('integrations.manage', 'Configurar integraciones', 'Crear, editar, probar y asignar integraciones externas')
on conflict (key) do nothing;

insert into public.roles (key, name, description) values
  ('integration_admin', 'Administrador de integraciones', 'Configura APIs externas y consulta sus ejecuciones')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'integration_admin' and p.key in ('integrations.view', 'integrations.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin' and p.key in ('integrations.view', 'integrations.manage')
on conflict do nothing;

create table public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  url text not null,
  auth_type text not null default 'none' check (auth_type in ('none', 'bearer', 'api_key')),
  api_key_header text not null default 'X-API-Key',
  has_secret boolean not null default false,
  timeout_seconds integer not null default 15 check (timeout_seconds between 3 and 30),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sin políticas SELECT: únicamente las funciones con service role pueden leer credenciales.
create table public.external_integration_secrets (
  integration_id uuid primary key references public.external_integrations(id) on delete cascade,
  encrypted_secret text not null,
  updated_at timestamptz not null default now()
);

create table public.form_integrations (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  integration_id uuid not null references public.external_integrations(id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'in_review', 'approved', 'rejected', 'completed')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, integration_id, event_type)
);

create table public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  form_integration_id uuid not null references public.form_integrations(id) on delete cascade,
  integration_id uuid not null references public.external_integrations(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  http_status integer,
  duration_ms integer,
  response_excerpt text,
  error_message text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (form_integration_id, submission_id, event_type)
);

create index integration_deliveries_submission_idx on public.integration_deliveries (submission_id, created_at desc);
create index integration_deliveries_pending_idx on public.integration_deliveries (status, created_at);

alter table public.external_integrations enable row level security;
alter table public.external_integration_secrets enable row level security;
alter table public.form_integrations enable row level security;
alter table public.integration_deliveries enable row level security;

create policy "permitted users read integrations" on public.external_integrations
  for select to authenticated using (
    public.has_permission('integrations.view') or public.has_permission('integrations.manage') or public.has_permission('forms.edit')
  );

create policy "editors read form integrations" on public.form_integrations
  for select to authenticated using (
    public.has_permission('integrations.view') or public.has_permission('integrations.manage') or public.has_permission('forms.edit') or public.has_permission('forms.inbox')
  );
create policy "editors assign form integrations" on public.form_integrations
  for insert to authenticated with check (public.has_permission('integrations.manage') or public.has_permission('forms.edit'));
create policy "editors update form integrations" on public.form_integrations
  for update to authenticated using (public.has_permission('integrations.manage') or public.has_permission('forms.edit'))
  with check (public.has_permission('integrations.manage') or public.has_permission('forms.edit'));
create policy "editors delete form integrations" on public.form_integrations
  for delete to authenticated using (public.has_permission('integrations.manage') or public.has_permission('forms.edit'));

create policy "permitted users read deliveries" on public.integration_deliveries
  for select to authenticated using (
    public.has_permission('integrations.view') or public.has_permission('integrations.manage') or
    public.has_permission('forms.inbox') or public.has_permission('forms.view')
  );

create or replace function public.queue_submission_integrations()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_event text;
begin
  if tg_op = 'INSERT' then
    target_event := 'submitted';
  elsif new.status is distinct from old.status and new.status in ('in_review', 'approved', 'rejected', 'completed') then
    target_event := new.status;
  else
    return new;
  end if;

  insert into public.integration_deliveries
    (form_integration_id, integration_id, form_id, submission_id, event_type)
  select fi.id, fi.integration_id, new.form_id, new.id, target_event
  from public.form_integrations fi
  join public.external_integrations ei on ei.id = fi.integration_id
  where fi.form_id = new.form_id and fi.event_type = target_event
    and fi.is_active and ei.is_active
  on conflict (form_integration_id, submission_id, event_type) do nothing;
  return new;
end;
$$;

create trigger queue_integrations_on_submission
  after insert on public.form_submissions
  for each row execute function public.queue_submission_integrations();

create trigger queue_integrations_on_status
  after update of status on public.form_submissions
  for each row execute function public.queue_submission_integrations();
