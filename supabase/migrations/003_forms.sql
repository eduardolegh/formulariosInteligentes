-- Estructura inicial para formularios, secciones y preguntas.

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.form_sections(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'boolean')),
  is_required boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists forms_created_by_idx on public.forms (created_by);
create index if not exists forms_status_idx on public.forms (status);
create index if not exists form_sections_form_id_idx on public.form_sections (form_id);
create index if not exists form_fields_section_id_idx on public.form_fields (section_id);

alter table public.forms enable row level security;
alter table public.form_sections enable row level security;
alter table public.form_fields enable row level security;

create policy "forms: permitted users can read"
  on public.forms for select to authenticated
  using (created_by = auth.uid() or public.has_permission('forms.view'));

create policy "forms: creators can insert"
  on public.forms for insert to authenticated
  with check (created_by = auth.uid() and public.has_permission('forms.create'));

create policy "forms: editors can update"
  on public.forms for update to authenticated
  using (public.has_permission('forms.edit'))
  with check (public.has_permission('forms.edit'));

create policy "forms: editors can delete"
  on public.forms for delete to authenticated
  using (public.has_permission('forms.edit'));

create policy "sections: permitted users can read"
  on public.form_sections for select to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and (f.created_by = auth.uid() or public.has_permission('forms.view'))
  ));

create policy "sections: editors can insert"
  on public.form_sections for insert to authenticated
  with check (public.has_permission('forms.edit') and exists (
    select 1 from public.forms f where f.id = form_id
  ));

create policy "sections: editors can update"
  on public.form_sections for update to authenticated
  using (public.has_permission('forms.edit'))
  with check (public.has_permission('forms.edit'));

create policy "sections: editors can delete"
  on public.form_sections for delete to authenticated
  using (public.has_permission('forms.edit'));

create policy "fields: permitted users can read"
  on public.form_fields for select to authenticated
  using (exists (
    select 1 from public.form_sections s
    join public.forms f on f.id = s.form_id
    where s.id = section_id and (f.created_by = auth.uid() or public.has_permission('forms.view'))
  ));

create policy "fields: editors can insert"
  on public.form_fields for insert to authenticated
  with check (public.has_permission('forms.edit') and exists (
    select 1 from public.form_sections s where s.id = section_id
  ));

create policy "fields: editors can update"
  on public.form_fields for update to authenticated
  using (public.has_permission('forms.edit'))
  with check (public.has_permission('forms.edit'));

create policy "fields: editors can delete"
  on public.form_fields for delete to authenticated
  using (public.has_permission('forms.edit'));
