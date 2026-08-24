-- Agrega el correo al perfil para mostrarlo en el panel administrativo.

alter table public.profiles
  add column if not exists email text;

create index if not exists profiles_email_idx on public.profiles (email);

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;
