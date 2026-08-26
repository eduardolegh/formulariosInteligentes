-- Publicación pública/privada, rol Participante y respuestas de formularios.

alter table public.forms
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private'));

alter table public.forms
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists forms_share_token_idx on public.forms (share_token);

insert into public.roles (key, name, description) values
  ('participant', 'Participante', 'Puede consultar y responder formularios publicados')
on conflict (key) do nothing;

insert into public.permissions (key, name, description) values
  ('forms.respond', 'Responder formularios', 'Puede responder formularios publicados')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'participant' and p.key = 'forms.respond'
on conflict do nothing;

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'completed')),
  submitted_at timestamptz not null default now()
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  field_id uuid not null references public.form_fields(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  unique (submission_id, field_id)
);

create index if not exists form_submissions_form_id_idx on public.form_submissions (form_id);
create index if not exists form_submissions_submitted_by_idx on public.form_submissions (submitted_by);
create index if not exists submission_answers_submission_id_idx on public.submission_answers (submission_id);

alter table public.form_submissions enable row level security;
alter table public.submission_answers enable row level security;

-- Formularios publicados públicos se pueden consultar sin iniciar sesión.
create policy "public forms: anyone can read published public forms"
  on public.forms for select to anon
  using (status = 'published' and visibility = 'public');

create policy "published forms: participants can read"
  on public.forms for select to authenticated
  using (
    status = 'published' and (visibility = 'public' or public.has_permission('forms.respond'))
  );

create policy "public sections: anyone can read published public sections"
  on public.form_sections for select to anon
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published' and f.visibility = 'public'
  ));

create policy "published sections: participants can read"
  on public.form_sections for select to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
      and (f.visibility = 'public' or public.has_permission('forms.respond'))
  ));

create policy "public fields: anyone can read published public fields"
  on public.form_fields for select to anon
  using (exists (
    select 1 from public.form_sections s
    join public.forms f on f.id = s.form_id
    where s.id = section_id and f.status = 'published' and f.visibility = 'public'
  ));

create policy "published fields: participants can read"
  on public.form_fields for select to authenticated
  using (exists (
    select 1 from public.form_sections s
    join public.forms f on f.id = s.form_id
    where s.id = section_id and f.status = 'published'
      and (f.visibility = 'public' or public.has_permission('forms.respond'))
  ));

create policy "forms: eligible users can submit"
  on public.form_submissions for insert to anon, authenticated
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
      and (f.visibility = 'public' or (auth.uid() is not null and public.has_permission('forms.respond')))
  ));

create policy "submissions: owners and reviewers can read"
  on public.form_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.has_permission('forms.view'));

create policy "answers: eligible users can insert"
  on public.submission_answers for insert to anon, authenticated
  with check (exists (
    select 1
    from public.form_submissions fs
    join public.forms f on f.id = fs.form_id
    where fs.id = submission_id and fs.submitted_by is not distinct from auth.uid()
      and f.status = 'published'
      and (f.visibility = 'public' or (auth.uid() is not null and public.has_permission('forms.respond')))
  ));

create policy "answers: owners and reviewers can read"
  on public.submission_answers for select to authenticated
  using (exists (
    select 1 from public.form_submissions fs
    where fs.id = submission_id
      and (fs.submitted_by = auth.uid() or public.has_permission('forms.view'))
  ));
