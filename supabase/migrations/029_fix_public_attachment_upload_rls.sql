-- Corrige la validación de adjuntos para respuestas públicas.
-- La función SECURITY DEFINER permite comprobar únicamente el envío indicado
-- sin conceder a usuarios anónimos permiso para listar otros envíos.

create or replace function public.can_attach_to_submission(
  submission_id_arg uuid,
  field_id_arg uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.form_submissions fs
    join public.forms f on f.id = fs.form_id
    join public.form_sections s on s.form_id = f.id
    join public.form_fields ff on ff.section_id = s.id
    where fs.id = submission_id_arg
      and ff.id = field_id_arg
      and fs.submitted_by is not distinct from auth.uid()
      and f.status = 'published'
      and coalesce(f.is_active, true)
      and (
        f.visibility = 'public'
        or (auth.uid() is not null and public.has_permission('forms.respond'))
      )
  );
$$;

create or replace function public.can_register_submission_attachment(
  submission_id_arg uuid,
  field_id_arg uuid,
  attachment_kind_arg text,
  mime_type_arg text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.can_attach_to_submission(submission_id_arg, field_id_arg)
    and exists (
      select 1
      from public.form_fields ff
      where ff.id = field_id_arg
        and (
          (attachment_kind_arg = 'identity_document' and ff.field_type = 'identity_document' and mime_type_arg like 'image/%')
          or (attachment_kind_arg = 'document' and ff.field_type = 'document_attachment' and mime_type_arg = 'application/pdf')
          or (attachment_kind_arg = 'photo' and ff.field_type in ('photo', 'photo_attachment') and mime_type_arg like 'image/%')
        )
    );
$$;

revoke all on function public.can_attach_to_submission(uuid, uuid) from public;
revoke all on function public.can_register_submission_attachment(uuid, uuid, text, text) from public;
grant execute on function public.can_attach_to_submission(uuid, uuid) to anon, authenticated;
grant execute on function public.can_register_submission_attachment(uuid, uuid, text, text) to anon, authenticated;

drop policy if exists "attachments: eligible users can insert" on public.submission_attachments;
create policy "attachments: eligible users can insert"
  on public.submission_attachments for insert to anon, authenticated
  with check (
    public.can_register_submission_attachment(
      submission_id,
      field_id,
      attachment_kind,
      mime_type
    )
  );

drop policy if exists "submission files: eligible users can upload" on storage.objects;
create policy "submission files: eligible users can upload"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'submission-files'
    and array_length(storage.foldername(name), 1) = 2
    and public.can_attach_to_submission(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );
