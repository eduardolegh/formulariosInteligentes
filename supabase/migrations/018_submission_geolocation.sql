-- Ubicación compartida voluntariamente al responder un formulario.

alter table public.form_submissions
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_captured_at timestamptz;

alter table public.form_submissions
  drop constraint if exists form_submissions_latitude_range,
  add constraint form_submissions_latitude_range
    check (latitude is null or latitude between -90 and 90),
  drop constraint if exists form_submissions_longitude_range,
  add constraint form_submissions_longitude_range
    check (longitude is null or longitude between -180 and 180),
  drop constraint if exists form_submissions_location_pair,
  add constraint form_submissions_location_pair
    check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  drop constraint if exists form_submissions_accuracy_positive,
  add constraint form_submissions_accuracy_positive
    check (location_accuracy_m is null or location_accuracy_m >= 0);

create index if not exists form_submissions_geolocation_idx
  on public.form_submissions (latitude, longitude)
  where latitude is not null and longitude is not null;

comment on column public.form_submissions.latitude is 'Latitud compartida voluntariamente por el dispositivo al responder.';
comment on column public.form_submissions.longitude is 'Longitud compartida voluntariamente por el dispositivo al responder.';
comment on column public.form_submissions.location_accuracy_m is 'Precisión aproximada reportada por el navegador, en metros.';
