insert into public.permissions (key, name, description) values ('forms.inbox', 'Bandeja de formularios', 'Consultar formularios del departamento') on conflict (key) do nothing;
insert into public.roles (key, name, description) values ('backoffice', 'BackOffice', 'Revisa formularios del departamento') on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id) select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'backoffice' and p.key in ('forms.inbox') on conflict do nothing;
