-- Alta y baja administrativa de formularios.

alter table public.forms
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null;

-- Conserva la intención de los formularios que ya utilizaban el estado archivado.
update public.forms
set is_active = false,
    deactivated_at = coalesce(deactivated_at, updated_at)
where status = 'archived' and is_active = true;

create index if not exists forms_is_active_updated_at_idx
  on public.forms (is_active, updated_at desc);

create or replace function public.ensure_form_is_active_for_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.forms f
    where f.id = new.form_id and f.is_active = true
  ) then
    raise exception 'Este formulario se encuentra de baja y ya no acepta respuestas.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_form_is_active_for_submission_trigger on public.form_submissions;
create trigger ensure_form_is_active_for_submission_trigger
before insert on public.form_submissions
for each row execute function public.ensure_form_is_active_for_submission();

-- Permite mostrar un mensaje preciso sin exponer el contenido del formulario.
create or replace function public.get_form_availability(share_token_arg uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.forms f where f.share_token = share_token_arg) then 'not_found'
    when exists (select 1 from public.forms f where f.share_token = share_token_arg and f.is_active = false) then 'inactive'
    when exists (select 1 from public.forms f where f.share_token = share_token_arg and f.status <> 'published') then 'unpublished'
    else 'available'
  end;
$$;

revoke all on function public.get_form_availability(uuid) from public;
grant execute on function public.get_form_availability(uuid) to anon, authenticated;

drop policy if exists "public forms: anyone can read published public forms" on public.forms;
create policy "public forms: anyone can read published public forms"
  on public.forms for select to anon
  using (status = 'published' and visibility = 'public' and is_active = true);

drop policy if exists "published forms: participants can read" on public.forms;
drop policy if exists "published forms: participants by department" on public.forms;
create policy "published forms: participants by department"
  on public.forms for select to authenticated
  using (
    status = 'published' and is_active = true and (
      visibility = 'public' or (
        public.has_permission('forms.respond') and (
          not exists (select 1 from public.form_departments fd where fd.form_id = forms.id)
          or exists (
            select 1 from public.form_departments fd
            join public.profiles p on p.department = fd.department
            where fd.form_id = forms.id and p.id = auth.uid()
          )
        )
      )
    )
  );

drop policy if exists "public sections: anyone can read published public sections" on public.form_sections;
create policy "public sections: anyone can read published public sections"
  on public.form_sections for select to anon
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
      and f.visibility = 'public' and f.is_active = true
  ));

drop policy if exists "published sections: participants can read" on public.form_sections;
drop policy if exists "published sections: participants by department" on public.form_sections;
create policy "published sections: participants by department"
  on public.form_sections for select to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published' and f.is_active = true and (
      f.visibility = 'public' or (
        public.has_permission('forms.respond') and (
          not exists (select 1 from public.form_departments fd where fd.form_id = f.id)
          or exists (
            select 1 from public.form_departments fd
            join public.profiles p on p.department = fd.department
            where fd.form_id = f.id and p.id = auth.uid()
          )
        )
      )
    )
  ));

drop policy if exists "public fields: anyone can read published public fields" on public.form_fields;
create policy "public fields: anyone can read published public fields"
  on public.form_fields for select to anon
  using (exists (
    select 1 from public.form_sections s
    join public.forms f on f.id = s.form_id
    where s.id = section_id and f.status = 'published'
      and f.visibility = 'public' and f.is_active = true
  ));

drop policy if exists "published fields: participants can read" on public.form_fields;
drop policy if exists "published fields: participants by department" on public.form_fields;
create policy "published fields: participants by department"
  on public.form_fields for select to authenticated
  using (exists (
    select 1 from public.form_sections s
    join public.forms f on f.id = s.form_id
    where s.id = section_id and f.status = 'published' and f.is_active = true
      and (f.visibility = 'public' or public.has_permission('forms.respond'))
  ));

drop policy if exists "forms: eligible users can submit" on public.form_submissions;
create policy "forms: eligible users can submit"
  on public.form_submissions for insert to anon, authenticated
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published' and f.is_active = true
      and (f.visibility = 'public' or (auth.uid() is not null and public.has_permission('forms.respond')))
  ));
