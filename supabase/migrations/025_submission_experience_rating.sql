-- Calificación opcional de la experiencia después de responder un formulario.

alter table public.form_submissions
  add column if not exists experience_rating smallint,
  add column if not exists experience_rated_at timestamptz,
  add column if not exists experience_rating_token uuid not null default gen_random_uuid();

alter table public.form_submissions
  drop constraint if exists form_submissions_experience_rating_range,
  add constraint form_submissions_experience_rating_range
    check (experience_rating is null or experience_rating between 1 and 5),
  drop constraint if exists form_submissions_experience_rating_pair,
  add constraint form_submissions_experience_rating_pair
    check ((experience_rating is null) = (experience_rated_at is null));

create or replace function public.rate_submission_experience(
  submission_id_arg uuid,
  rating_token_arg uuid,
  rating_arg integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if rating_arg < 1 or rating_arg > 5 then
    raise exception 'La calificación debe estar entre 1 y 5.' using errcode = '22023';
  end if;

  update public.form_submissions
  set experience_rating = rating_arg,
      experience_rated_at = now()
  where id = submission_id_arg
    and experience_rating_token = rating_token_arg
    and experience_rating is null;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.rate_submission_experience(uuid, uuid, integer) from public;
grant execute on function public.rate_submission_experience(uuid, uuid, integer) to anon, authenticated;

create index if not exists form_submissions_experience_rating_idx
  on public.form_submissions (experience_rating)
  where experience_rating is not null;

create unique index if not exists form_submissions_experience_rating_token_idx
  on public.form_submissions (experience_rating_token);
