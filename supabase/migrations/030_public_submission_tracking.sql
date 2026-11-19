-- Portal publico de seguimiento y entrega de correo transaccional.

alter table public.forms
  add column if not exists tracking_enabled boolean not null default false;

alter table public.form_submissions
  add column if not exists tracking_email text,
  add column if not exists tracking_code text,
  add column if not exists tracking_token uuid;

create unique index if not exists form_submissions_tracking_code_idx
  on public.form_submissions (upper(tracking_code))
  where tracking_code is not null;

create unique index if not exists form_submissions_tracking_token_idx
  on public.form_submissions (tracking_token)
  where tracking_token is not null;

create index if not exists form_submissions_tracking_email_idx
  on public.form_submissions (lower(tracking_email))
  where tracking_email is not null;

create table if not exists public.submission_tracking_emails (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.form_submissions(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  error_message text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submission_tracking_emails_status_idx
  on public.submission_tracking_emails (status, created_at desc);

alter table public.submission_tracking_emails enable row level security;

create policy "tracking emails: administrators can read"
  on public.submission_tracking_emails for select to authenticated
  using (
    public.has_permission('forms.view')
    or public.has_permission('dashboards.view')
  );

create or replace function public.validate_submission_tracking_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracking_required boolean;
begin
  select f.tracking_enabled
  into tracking_required
  from public.forms f
  where f.id = new.form_id;

  if tracking_required then
    new.tracking_email := lower(trim(coalesce(new.tracking_email, '')));
    new.tracking_code := upper(trim(coalesce(new.tracking_code, '')));

    if new.tracking_email = ''
      or new.tracking_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
      raise exception 'Debes proporcionar un correo electronico valido para el seguimiento.'
        using errcode = '23514';
    end if;

    if new.tracking_code !~ '^FI-[A-F0-9]{8}-[A-F0-9]{8}$' then
      raise exception 'El codigo de seguimiento no tiene un formato valido.'
        using errcode = '23514';
    end if;

    if new.tracking_token is null then
      raise exception 'El enlace de seguimiento no tiene un token valido.'
        using errcode = '23514';
    end if;
  else
    new.tracking_email := null;
    new.tracking_code := null;
    new.tracking_token := null;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_submission_tracking_data_trigger on public.form_submissions;
create trigger validate_submission_tracking_data_trigger
before insert or update of form_id, tracking_email, tracking_code, tracking_token
on public.form_submissions
for each row execute function public.validate_submission_tracking_data();

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
        'changed_at', h.changed_at
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

