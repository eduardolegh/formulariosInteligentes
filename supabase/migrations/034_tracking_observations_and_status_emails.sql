-- Observaciones públicas del seguimiento y cola de correos por cambio de estado.

alter table public.submission_status_history
  add column if not exists observation text;

create table if not exists public.submission_tracking_notifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  observation text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  error_message text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submission_tracking_notifications_pending_idx
  on public.submission_tracking_notifications (submission_id, status, created_at);

alter table public.submission_tracking_notifications enable row level security;

drop policy if exists "tracking notifications: administrators can read"
  on public.submission_tracking_notifications;
create policy "tracking notifications: administrators can read"
  on public.submission_tracking_notifications for select to authenticated
  using (
    public.has_permission('forms.view')
    or public.has_permission('forms.inbox')
    or public.has_permission('dashboards.view')
  );

create or replace function public.initialize_submission_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.submission_status_history
    (submission_id, previous_status, new_status, changed_by, changed_at, observation)
  values (
    new.id,
    null,
    new.status,
    auth.uid(),
    new.submitted_at,
    nullif(trim(coalesce(new.observation, '')), '')
  );
  return new;
end;
$$;

create or replace function public.track_submission_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  history_observation text;
begin
  if new.status is distinct from old.status then
    if new.status = 'in_review' and old.status <> 'in_review' then
      new.review_started_at := now();
      new.decided_at := null;
    elsif new.status in ('approved', 'rejected') then
      new.review_started_at := coalesce(new.review_started_at, now());
      new.decided_at := now();
    end if;

    history_observation := case
      when new.observation is distinct from old.observation
        then nullif(trim(coalesce(new.observation, '')), '')
      when new.status in ('approved', 'rejected')
        then nullif(trim(coalesce(new.observation, '')), '')
      else null
    end;

    insert into public.submission_status_history
      (submission_id, previous_status, new_status, changed_by, changed_at, observation)
    values (new.id, old.status, new.status, auth.uid(), now(), history_observation);

    if new.status in ('approved', 'rejected') then
      update public.ai_analysis_runs
      set human_decision = new.status,
          human_decided_at = now()
      where id = (
        select id
        from public.ai_analysis_runs
        where submission_id = new.id
          and status = 'succeeded'
          and human_decision is null
        order by completed_at desc
        limit 1
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.queue_submission_tracking_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tracking_email is null or new.tracking_token is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.submission_tracking_notifications
      (submission_id, previous_status, new_status, observation)
    values (
      new.id,
      null,
      new.status,
      nullif(trim(coalesce(new.observation, '')), '')
    );
  elsif new.status is distinct from old.status then
    insert into public.submission_tracking_notifications
      (submission_id, previous_status, new_status, observation)
    values (
      new.id,
      old.status,
      new.status,
      case
        when new.observation is distinct from old.observation
          or new.status in ('approved', 'rejected')
          then nullif(trim(coalesce(new.observation, '')), '')
        else null
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_submission_tracking_notification_trigger
  on public.form_submissions;
create trigger queue_submission_tracking_notification_trigger
after insert or update of status on public.form_submissions
for each row execute function public.queue_submission_tracking_notification();

-- Recupera la observación actual para decisiones ya registradas antes de esta migración.
update public.submission_status_history h
set observation = nullif(trim(fs.observation), '')
from public.form_submissions fs
where h.submission_id = fs.id
  and fs.observation <> ''
  and h.observation is null
  and h.id = (
    select decision_history.id
    from public.submission_status_history decision_history
    where decision_history.submission_id = fs.id
      and decision_history.new_status in ('approved', 'rejected')
    order by decision_history.changed_at desc, decision_history.id desc
    limit 1
  );

create or replace function public.get_public_submission_tracking(
  tracking_code_arg text default null,
  tracking_token_arg uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_submission public.form_submissions%rowtype;
  target_form public.forms%rowtype;
  status_events jsonb;
begin
  if tracking_token_arg is null and nullif(trim(tracking_code_arg), '') is null then
    return null;
  end if;

  select fs.*
  into target_submission
  from public.form_submissions fs
  join public.forms f on f.id = fs.form_id
  where f.tracking_enabled = true
    and (
      (tracking_token_arg is not null and fs.tracking_token = tracking_token_arg)
      or (
        tracking_token_arg is null
        and upper(fs.tracking_code) = upper(trim(tracking_code_arg))
      )
    )
  limit 1;

  if target_submission.id is null then
    return null;
  end if;

  select f.* into target_form
  from public.forms f
  where f.id = target_submission.form_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', h.new_status,
        'changed_at', h.changed_at,
        'observation', h.observation
      ) order by h.changed_at, h.id
    ),
    '[]'::jsonb
  )
  into status_events
  from public.submission_status_history h
  where h.submission_id = target_submission.id;

  return jsonb_build_object(
    'form_name', target_form.name,
    'current_status', target_submission.status,
    'submitted_at', target_submission.submitted_at,
    'last_updated_at', coalesce(
      (select max(h.changed_at) from public.submission_status_history h where h.submission_id = target_submission.id),
      target_submission.submitted_at
    ),
    'events', status_events
  );
end;
$$;

revoke all on function public.get_public_submission_tracking(text, uuid) from public;
grant execute on function public.get_public_submission_tracking(text, uuid) to anon, authenticated;

