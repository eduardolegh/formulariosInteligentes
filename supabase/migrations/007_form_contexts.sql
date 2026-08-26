alter table public.forms add column if not exists ai_enabled boolean not null default false;
create table if not exists public.form_contexts (id uuid primary key default gen_random_uuid(), form_id uuid not null references public.forms(id) on delete cascade, objective text not null default '', instructions text not null default '', rules text not null default '', restrictions text not null default '', expected_output text not null default '', version integer not null default 1, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(form_id, version));
create index if not exists form_contexts_form_id_idx on public.form_contexts(form_id);
alter table public.form_contexts enable row level security;
create policy "contexts: permitted users can read" on public.form_contexts for select to authenticated using (public.has_permission('forms.view'));
create policy "contexts: editors can insert" on public.form_contexts for insert to authenticated with check (public.has_permission('forms.edit'));
create policy "contexts: editors can update" on public.form_contexts for update to authenticated using (public.has_permission('forms.edit')) with check (public.has_permission('forms.edit'));
