-- Asignación atómica de solicitudes a usuarios BackOffice.

alter table public.form_submissions
  drop constraint if exists form_submissions_status_check;

alter table public.form_submissions
  add constraint form_submissions_status_check
  check (status in ('submitted', 'assigned', 'in_review', 'approved', 'rejected', 'completed'));

alter table public.form_submissions
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists form_submissions_assigned_to_idx
  on public.form_submissions (assigned_to, assigned_at desc)
  where assigned_to is not null;

-- Conserva un responsable razonable para solicitudes históricas ya gestionadas.
with first_management as (
  select distinct on (h.submission_id)
    h.submission_id,
    h.changed_by,
    h.changed_at
  from public.submission_status_history h
  where h.changed_by is not null
    and h.new_status in ('in_review', 'approved', 'rejected', 'completed')
  order by h.submission_id, h.changed_at, h.id
)
update public.form_submissions fs
set assigned_to = fm.changed_by,
    assigned_at = fm.changed_at
from first_management fm
where fs.id = fm.submission_id
  and fs.assigned_to is null
  and fs.status <> 'submitted';

create or replace function public.enforce_submission_assignment_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  privileged boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    if new.assigned_to is distinct from old.assigned_to
      or new.assigned_at is distinct from old.assigned_at then
      raise exception 'La asignacion solo puede modificarse al tomar una solicitud.';
    end if;
    return new;
  end if;

  if actor is null then
    raise exception 'Debes iniciar sesion para cambiar el estado de la solicitud.';
  end if;

  privileged := public.has_permission('users.manage');

  if old.status = 'submitted' then
    if new.status <> 'assigned' then
      raise exception 'Primero debes asignarte la solicitud.';
    end if;
    if new.assigned_to is distinct from actor or new.assigned_at is null then
      raise exception 'La solicitud debe quedar asignada al usuario que la toma.';
    end if;
    return new;
  end if;

  if old.assigned_to is null then
    raise exception 'La solicitud no tiene un responsable asignado.';
  end if;

  if old.assigned_to <> actor and not privileged then
    raise exception 'Esta solicitud esta asignada a otro usuario.';
  end if;

  if new.assigned_to is distinct from old.assigned_to
    or new.assigned_at is distinct from old.assigned_at then
    raise exception 'No se puede cambiar el responsable durante la atencion.';
  end if;

  if old.status = 'assigned' and new.status <> 'in_review' then
    raise exception 'La solicitud asignada debe iniciar revision antes de decidirse.';
  elsif old.status = 'in_review' and new.status not in ('approved', 'rejected') then
    raise exception 'Desde revision solo se puede aprobar o rechazar.';
  elsif old.status in ('approved', 'rejected') and new.status not in ('in_review', 'completed') then
    raise exception 'La transicion de estado solicitada no es valida.';
  elsif old.status = 'completed' then
    raise exception 'Una solicitud finalizada no puede cambiar de estado.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_submission_assignment_workflow_trigger
  on public.form_submissions;
create trigger enforce_submission_assignment_workflow_trigger
before update of status, assigned_to, assigned_at on public.form_submissions
for each row execute function public.enforce_submission_assignment_workflow();

create or replace function public.claim_form_submission(target_submission_id uuid)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target public.form_submissions%rowtype;
  broad_access boolean;
  actor_department text;
begin
  if actor is null then
    raise exception 'Debes iniciar sesion para asignarte una solicitud.';
  end if;

  broad_access := public.has_permission('users.manage');

  select p.department into actor_department
  from public.profiles p
  where p.id = actor;

  select fs.* into target
  from public.form_submissions fs
  where fs.id = target_submission_id;

  if target.id is null then
    raise exception 'No se encontro la solicitud.';
  end if;

  if not broad_access and not public.has_permission('forms.inbox') then
    raise exception 'Tu usuario no tiene habilitado el permiso de Bandeja de formularios.';
  end if;

  if not broad_access
    and exists (
      select 1
      from public.form_departments fd
      where fd.form_id = target.form_id
    )
    and not exists (
      select 1
      from public.form_departments fd
      where fd.form_id = target.form_id
        and lower(trim(fd.department)) = lower(trim(coalesce(actor_department, '')))
    )
  then
    raise exception 'Esta solicitud pertenece a otro departamento. Revisa el departamento configurado en tu perfil y en el formulario.';
  end if;

  update public.form_submissions fs
  set status = 'assigned',
      assigned_to = actor,
      assigned_at = now()
  where fs.id = target_submission_id
    and fs.status = 'submitted'
    and fs.assigned_to is null
  returning fs.* into target;

  if target.id is null or target.status <> 'assigned' then
    raise exception 'La solicitud ya fue asignada a otro usuario o cambio de estado.';
  end if;

  return target;
end;
$$;

revoke all on function public.claim_form_submission(uuid) from public;
grant execute on function public.claim_form_submission(uuid) to authenticated;

create or replace function public.get_submission_assignments()
returns table (
  submission_id uuid,
  assigned_to uuid,
  assigned_at timestamptz,
  assigned_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para consultar asignaciones.';
  end if;

  if not (
    public.has_permission('users.manage')
    or public.has_permission('forms.edit')
    or public.has_permission('forms.view')
    or public.has_permission('forms.inbox')
    or public.has_permission('dashboards.view')
  ) then
    raise exception 'No tienes permiso para consultar asignaciones.';
  end if;

  return query
  select
    fs.id,
    fs.assigned_to,
    fs.assigned_at,
    coalesce(nullif(trim(p.full_name), ''), 'Usuario BackOffice')
  from public.form_submissions fs
  left join public.profiles p on p.id = fs.assigned_to
  where fs.assigned_to is not null
    and (
      public.has_permission('users.manage')
      or public.has_permission('forms.edit')
      or public.has_permission('forms.view')
      or public.has_permission('dashboards.view')
      or exists (
        select 1
        from public.form_departments fd
        join public.profiles viewer on viewer.department = fd.department
        where fd.form_id = fs.form_id and viewer.id = auth.uid()
      )
    );
end;
$$;

revoke all on function public.get_submission_assignments() from public;
grant execute on function public.get_submission_assignments() to authenticated;

create or replace function public.get_backoffice_dashboard_activity()
returns table (
  user_id uuid,
  full_name text,
  department text,
  submission_id uuid,
  action_status text,
  action_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    public.has_permission('dashboards.view')
    or public.has_permission('users.manage')
  ) then
    raise exception 'No tienes permiso para consultar las metricas de BackOffice.';
  end if;

  return query
  with backoffice_users as (
    select distinct p.id, p.full_name, p.department
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    join public.roles r on r.id = ur.role_id
    where p.is_active and r.key = 'backoffice'
  )
  select
    b.id,
    coalesce(nullif(trim(b.full_name), ''), 'Usuario BackOffice'),
    coalesce(nullif(trim(b.department), ''), 'Sin departamento'),
    h.submission_id,
    h.new_status,
    h.changed_at
  from backoffice_users b
  left join public.submission_status_history h
    on h.changed_by = b.id
   and h.new_status in ('assigned', 'in_review', 'approved', 'rejected', 'completed')
  order by b.full_name, h.changed_at;
end;
$$;
