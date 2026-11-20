-- Corrige el alcance de asignacion de solicitudes para BackOffice.
-- Los formularios sin departamento pueden ser atendidos por cualquier usuario
-- con permiso forms.inbox. Cuando existen departamentos, la comparacion se
-- normaliza para evitar diferencias por mayusculas o espacios.

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
