create table if not exists public.departments (id uuid primary key default gen_random_uuid(), name text not null unique, is_active boolean not null default true, created_at timestamptz not null default now());
insert into public.departments(name) values ('Ventas'),('Digitación'),('Recursos Humanos'),('Finanzas'),('Operaciones') on conflict (name) do nothing;
alter table public.departments enable row level security;
create policy "departments: authenticated can read" on public.departments for select to authenticated using (true);
create policy "departments: managers can manage" on public.departments for all to authenticated using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));
