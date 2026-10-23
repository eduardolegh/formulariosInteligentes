-- Datos controlados para medir la actividad de los usuarios BackOffice activos.

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
    raise exception 'No tienes permiso para consultar las métricas de BackOffice.';
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
   and h.new_status in ('in_review', 'approved', 'rejected', 'completed')
  order by b.full_name, h.changed_at;
end;
$$;

revoke all on function public.get_backoffice_dashboard_activity() from public;
grant execute on function public.get_backoffice_dashboard_activity() to authenticated;
