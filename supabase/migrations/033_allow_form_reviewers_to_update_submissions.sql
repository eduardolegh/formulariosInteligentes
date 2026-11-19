-- Alinea la actualización con el permiso utilizado por la pantalla de respuestas.

drop policy if exists "authorized users can update submissions"
  on public.form_submissions;

create policy "authorized users can update submissions"
  on public.form_submissions
  for update
  to authenticated
  using (
    public.has_permission('users.manage')
    or public.has_permission('forms.edit')
    or public.has_permission('forms.view')
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
    or public.has_permission('forms.view')
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

