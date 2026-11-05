-- Captura configurable y obligatoria de coordenadas por formulario.

alter table public.forms
  add column if not exists capture_coordinates boolean not null default false;

create or replace function public.enforce_submission_coordinates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.forms f
    where f.id = new.form_id
      and f.capture_coordinates = true
  ) and (
    new.latitude is null
    or new.longitude is null
    or new.location_captured_at is null
  ) then
    raise exception 'Este formulario requiere capturar la ubicación antes de enviarlo.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists require_submission_coordinates on public.form_submissions;
create trigger require_submission_coordinates
before insert or update of form_id, latitude, longitude, location_captured_at
on public.form_submissions
for each row execute function public.enforce_submission_coordinates();
