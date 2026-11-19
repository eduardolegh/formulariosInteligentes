-- Corrige las transiciones que parecían guardarse solo en la interfaz.

-- Los permisos agregados después de crear el rol administrador también deben
-- quedar asignados a dicho rol.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

drop policy if exists "backoffice can update department submissions"
  on public.form_submissions;

create policy "authorized users can update submissions"
  on public.form_submissions
  for update
  to authenticated
  using (
    public.has_permission('users.manage')
    or public.has_permission('forms.edit')
    or (
      public.has_permission('forms.inbox')
      and exists (
        select 1
        from public.form_departments fd
        join public.profiles p on p.department = fd.department
        where fd.form_id = form_submissions.form_id
          and p.id = auth.uid()
      )
    )
  )
  with check (
    public.has_permission('users.manage')
    or public.has_permission('forms.edit')
    or (
      public.has_permission('forms.inbox')
      and exists (
        select 1
        from public.form_departments fd
        join public.profiles p on p.department = fd.department
        where fd.form_id = form_submissions.form_id
          and p.id = auth.uid()
      )
    )
  );

