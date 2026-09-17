create policy "backoffice can read department form links"
  on public.form_departments for select to authenticated
  using (public.has_permission('forms.inbox'));

create policy "backoffice can read department forms"
  on public.forms for select to authenticated
  using (
    public.has_permission('forms.inbox')
    and exists (
      select 1 from public.form_departments fd
      join public.profiles p on p.department = fd.department
      where fd.form_id = forms.id and p.id = auth.uid()
    )
  );
