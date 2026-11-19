-- Consulta segura de las respuestas desde el portal público de seguimiento.

create or replace function public.get_public_submission_answers(
  tracking_code_arg text default null,
  tracking_token_arg uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_submission_id uuid;
  answer_items jsonb;
begin
  if tracking_token_arg is null and nullif(trim(tracking_code_arg), '') is null then
    return null;
  end if;

  select fs.id
  into target_submission_id
  from public.form_submissions fs
  join public.forms f on f.id = fs.form_id
  where f.tracking_enabled = true
    and (
      (tracking_token_arg is not null and fs.tracking_token = tracking_token_arg)
      or (
        tracking_token_arg is null
        and upper(fs.tracking_code) = upper(trim(tracking_code_arg))
      )
    )
  limit 1;

  if target_submission_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'section_title', section_data.title,
        'question', section_data.label,
        'field_type', section_data.field_type,
        'value', section_data.public_value
      ) order by section_data.section_position, section_data.field_position
    ),
    '[]'::jsonb
  )
  into answer_items
  from (
    select
      s.title,
      s.position as section_position,
      ff.label,
      ff.field_type,
      ff.position as field_position,
      case
        when ff.field_type = 'identity_document' then
          coalesce(sa.value, '{}'::jsonb) - 'attachment_id' - 'validation'
        when ff.field_type in ('photo', 'photo_attachment', 'document_attachment') then
          jsonb_build_object(
            'file_submitted', sa.id is not null,
            'original_name', nullif(sa.value ->> 'original_name', '')
          )
        else coalesce(sa.value, 'null'::jsonb)
      end as public_value
    from public.form_sections s
    join public.form_fields ff on ff.section_id = s.id
    left join public.submission_answers sa
      on sa.field_id = ff.id and sa.submission_id = target_submission_id
    where exists (
      select 1
      from public.form_submissions fs
      where fs.id = target_submission_id and fs.form_id = s.form_id
    )
      and ff.is_active = true
  ) section_data;

  return jsonb_build_object('answers', answer_items);
end;
$$;

revoke all on function public.get_public_submission_answers(text, uuid) from public;
grant execute on function public.get_public_submission_answers(text, uuid) to anon, authenticated;

