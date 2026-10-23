-- Nuevo tipo de pregunta para capturar o seleccionar coordenadas.

alter table public.form_fields drop constraint if exists form_fields_field_type_check;
alter table public.form_fields add constraint form_fields_field_type_check
  check (field_type in (
    'text', 'textarea', 'email', 'phone', 'number', 'date',
    'select', 'boolean', 'photo', 'photo_attachment', 'geolocation'
  ));
