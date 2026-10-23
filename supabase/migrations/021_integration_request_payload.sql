-- Conserva el JSON exacto enviado por cada ejecución para fines de trazabilidad.

alter table public.integration_deliveries
  add column if not exists request_payload jsonb;

comment on column public.integration_deliveries.request_payload is
  'Copia del payload enviado al servicio externo. No incluye credenciales ni encabezados de autenticación.';
