-- Formularios que no requieren revisión humana ni análisis con IA.

alter table public.forms
  add column if not exists requires_attention boolean not null default true;

alter table public.forms
  drop constraint if exists forms_ai_requires_attention,
  add constraint forms_ai_requires_attention
    check (requires_attention = true or ai_enabled = false);

create or replace function public.apply_form_attention_on_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.forms f
    where f.id = new.form_id and f.requires_attention = false
  ) then
    new.status := 'approved';
    new.review_started_at := null;
    new.decided_at := coalesce(new.decided_at, now());
    new.observation := 'Aprobado automáticamente: este formulario no requiere atención.';
  end if;
  return new;
end;
$$;

drop trigger if exists apply_form_attention_on_submission_trigger on public.form_submissions;
create trigger apply_form_attention_on_submission_trigger
before insert on public.form_submissions
for each row execute function public.apply_form_attention_on_submission();

create or replace function public.disable_ai_when_attention_is_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requires_attention = false then
    new.ai_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists disable_ai_when_attention_is_disabled_trigger on public.forms;
create trigger disable_ai_when_attention_is_disabled_trigger
before insert or update of requires_attention, ai_enabled on public.forms
for each row execute function public.disable_ai_when_attention_is_disabled();

create or replace function public.deactivate_context_when_attention_is_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.requires_attention = true and new.requires_attention = false then
    update public.form_contexts set is_active = false where form_id = new.id and is_active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists deactivate_context_when_attention_is_disabled_trigger on public.forms;
create trigger deactivate_context_when_attention_is_disabled_trigger
after update of requires_attention on public.forms
for each row execute function public.deactivate_context_when_attention_is_disabled();

create or replace function public.prevent_context_without_attention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and exists (
    select 1 from public.forms f where f.id = new.form_id and f.requires_attention = false
  ) then
    raise exception 'No se puede activar contexto en un formulario que no requiere atención.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_context_without_attention_trigger on public.form_contexts;
create trigger prevent_context_without_attention_trigger
before insert or update of form_id, is_active on public.form_contexts
for each row execute function public.prevent_context_without_attention();

-- En una aprobación automática se generan ambos eventos: creación y aprobación.
create or replace function public.queue_submission_integrations()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.integration_deliveries
      (form_integration_id, integration_id, form_id, submission_id, event_type)
    select fi.id, fi.integration_id, new.form_id, new.id, fi.event_type
    from public.form_integrations fi
    join public.external_integrations ei on ei.id = fi.integration_id
    where fi.form_id = new.form_id
      and (fi.event_type = 'submitted' or (new.status = 'approved' and fi.event_type = 'approved'))
      and fi.is_active and ei.is_active
    on conflict (form_integration_id, submission_id, event_type) do nothing;
    return new;
  elsif new.status is distinct from old.status and new.status in ('in_review', 'approved', 'rejected', 'completed') then
    target_event := new.status;
  else
    return new;
  end if;

  insert into public.integration_deliveries
    (form_integration_id, integration_id, form_id, submission_id, event_type)
  select fi.id, fi.integration_id, new.form_id, new.id, target_event
  from public.form_integrations fi
  join public.external_integrations ei on ei.id = fi.integration_id
  where fi.form_id = new.form_id and fi.event_type = target_event
    and fi.is_active and ei.is_active
  on conflict (form_integration_id, submission_id, event_type) do nothing;
  return new;
end;
$$;
