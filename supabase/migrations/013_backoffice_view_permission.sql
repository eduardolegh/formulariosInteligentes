insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'backoffice' and p.key = 'forms.view'
on conflict do nothing;
