-- Preguntas de documento de identidad, archivos PDF y almacenamiento privado compartido.

alter table public.form_fields drop constraint if exists form_fields_field_type_check;
alter table public.form_fields add constraint form_fields_field_type_check
  check (field_type in (
    'text', 'textarea', 'email', 'phone', 'number', 'date',
    'select', 'boolean', 'photo', 'photo_attachment', 'geolocation',
    'identity_document', 'document_attachment'
  ));

create table if not exists public.submission_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  field_id uuid not null references public.form_fields(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  attachment_kind text not null check (attachment_kind in ('identity_document', 'document', 'photo')),
  capture_source text not null check (capture_source in ('camera', 'file_upload')),
  validation_status text not null default 'not_required'
    check (validation_status in ('valid', 'pending', 'invalid', 'not_required')),
  validation_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists submission_attachments_submission_idx
  on public.submission_attachments (submission_id, created_at);
create index if not exists submission_attachments_field_idx
  on public.submission_attachments (field_id);

alter table public.submission_attachments enable row level security;

drop policy if exists "attachments: eligible users can insert" on public.submission_attachments;
create policy "attachments: eligible users can insert"
  on public.submission_attachments for insert to anon, authenticated
  with check (exists (
    select 1
    from public.form_submissions fs
    join public.forms f on f.id = fs.form_id
    join public.form_sections s on s.form_id = f.id
    join public.form_fields ff on ff.section_id = s.id
    where fs.id = submission_id
      and ff.id = field_id
      and (
        (attachment_kind = 'identity_document' and ff.field_type = 'identity_document' and mime_type like 'image/%')
        or (attachment_kind = 'document' and ff.field_type = 'document_attachment' and mime_type = 'application/pdf')
        or (attachment_kind = 'photo' and ff.field_type in ('photo', 'photo_attachment') and mime_type like 'image/%')
      )
      and fs.submitted_by is not distinct from auth.uid()
      and f.status = 'published'
      and coalesce(f.is_active, true)
      and (f.visibility = 'public' or (auth.uid() is not null and public.has_permission('forms.respond')))
  ));

drop policy if exists "attachments: owners and reviewers can read" on public.submission_attachments;
create policy "attachments: owners and reviewers can read"
  on public.submission_attachments for select to authenticated
  using (exists (
    select 1 from public.form_submissions fs
    where fs.id = submission_id
      and (fs.submitted_by = auth.uid() or public.has_permission('forms.view'))
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-files',
  'submission-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "submission files: eligible users can upload" on storage.objects;
create policy "submission files: eligible users can upload"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'submission-files'
    and exists (
      select 1
      from public.form_submissions fs
      join public.forms f on f.id = fs.form_id
      join public.form_sections s on s.form_id = f.id
      join public.form_fields ff on ff.section_id = s.id
      where fs.id::text = (storage.foldername(name))[1]
        and ff.id::text = (storage.foldername(name))[2]
        and fs.submitted_by is not distinct from auth.uid()
        and f.status = 'published'
        and coalesce(f.is_active, true)
        and (f.visibility = 'public' or (auth.uid() is not null and public.has_permission('forms.respond')))
    )
  );

drop policy if exists "submission files: owners and reviewers can read" on storage.objects;
create policy "submission files: owners and reviewers can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'submission-files'
    and exists (
      select 1
      from public.submission_attachments a
      join public.form_submissions fs on fs.id = a.submission_id
      where a.storage_path = name
        and (fs.submitted_by = auth.uid() or public.has_permission('forms.view'))
    )
  );

alter table public.llm_operation_runs drop constraint if exists llm_operation_runs_operation_type_check;
alter table public.llm_operation_runs add constraint llm_operation_runs_operation_type_check
  check (operation_type in (
    'form_generation', 'form_edit', 'dashboard_assistant', 'identity_document_validation'
  ));
