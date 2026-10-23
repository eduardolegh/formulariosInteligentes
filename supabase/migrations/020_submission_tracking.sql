-- Consulta segura del flujo de estados de una respuesta.

create or replace function public.get_submission_status_history(target_submission_id uuid)
returns table (
  id bigint,
  previous_status text,
  new_status text,
  changed_at timestamptz,
  changed_by uuid,
  changed_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para consultar el seguimiento.';
  end if;

  if not exists (
    select 1
    from public.form_submissions fs
    where fs.id = target_submission_id
      and (
        fs.submitted_by = auth.uid()
        or public.has_permission('forms.view')
        or public.has_permission('forms.inbox')
        or public.has_permission('dashboards.view')
      )
  ) then
    raise exception 'No tienes permiso para consultar este seguimiento.';
  end if;

  return query
  select
    h.id,
    h.previous_status,
    h.new_status,
    h.changed_at,
    h.changed_by,
    case
      when h.changed_by is null then 'Sistema o usuario público'
      when nullif(trim(p.full_name), '') is not null then p.full_name
      else 'Usuario del sistema'
    end as changed_by_name
  from public.submission_status_history h
  left join public.profiles p on p.id = h.changed_by
  where h.submission_id = target_submission_id
  order by h.changed_at;
end;
$$;

revoke all on function public.get_submission_status_history(uuid) from public;
grant execute on function public.get_submission_status_history(uuid) to authenticated;
