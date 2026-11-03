-- 002 · Fase 1: tipos de cuenta, códigos de activación, solicitudes de entrenador y administración.
-- Se puede ejecutar más de una vez sin romper nada.
--
-- Tipos de cuenta (role): dev (desarrollador), trainer (entrenador), client (cliente, fase 2),
-- free (usuario libre, con código) y pending (pendiente de activar).
-- Además, cualquier cuenta puede estar bloqueada (blocked).
-- Solo las cuentas activas (no pending y no bloqueadas) pueden escribir sus datos;
-- todas pueden leerlos, descargarlos y borrar su cuenta.

/* ---------- perfiles ---------- */

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  name text not null default '',
  role text not null default 'pending' check (role in ('dev', 'trainer', 'client', 'free', 'pending')),
  blocked boolean not null default false,
  blocked_at timestamptz,
  code_used text,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_dev() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dev' and not p.blocked);
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'pending' and not p.blocked);
$$;

drop policy if exists "ver su perfil" on public.profiles;
create policy "ver su perfil" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_dev());
-- Nadie escribe directamente: todos los cambios pasan por las funciones de abajo
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Cada cuenta nueva nace como «pendiente de activar»
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), left(coalesce(trim(new.raw_user_meta_data ->> 'name'), ''), 60))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para las cuentas que ya existían
insert into public.profiles (id, email) select id, lower(email) from auth.users on conflict (id) do nothing;

/* ---------- datos sincronizados: escribir solo con la cuenta activa ---------- */

drop policy if exists "cada uno sus datos" on public.kv;
drop policy if exists "leer sus datos" on public.kv;
drop policy if exists "crear sus datos" on public.kv;
drop policy if exists "cambiar sus datos" on public.kv;
drop policy if exists "borrar sus datos" on public.kv;
create policy "leer sus datos" on public.kv for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "crear sus datos" on public.kv for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_active());
create policy "cambiar sus datos" on public.kv for update to authenticated
  using ((select auth.uid()) = user_id and public.is_active())
  with check ((select auth.uid()) = user_id and public.is_active());
create policy "borrar sus datos" on public.kv for delete to authenticated
  using ((select auth.uid()) = user_id and public.is_active());

/* ---------- códigos de activación ---------- */

create table if not exists public.activation_codes (
  code text primary key,
  max_uses int not null default 1 check (max_uses >= 1),
  uses_left int not null default 1 check (uses_left >= 0),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  note text not null default '',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.code_redemptions (
  code text not null references public.activation_codes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  used_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.activation_codes enable row level security;
alter table public.code_redemptions enable row level security;
revoke all on public.activation_codes, public.code_redemptions from anon, authenticated;

/* ---------- solicitudes para ser entrenador ---------- */

create table if not exists public.trainer_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reply text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users on delete set null
);
create unique index if not exists trainer_requests_one_pending on public.trainer_requests (user_id) where status = 'pending';
alter table public.trainer_requests enable row level security;
revoke all on public.trainer_requests from anon, authenticated;

/* ---------- funciones del usuario ---------- */

-- Perfil propio, con la última solicitud de entrenador
create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'role', p.role, 'blocked', p.blocked,
    'code_used', p.code_used, 'activated_at', p.activated_at, 'created_at', p.created_at,
    'request', (select json_build_object('status', r.status, 'reply', r.reply, 'created_at', r.created_at)
                from public.trainer_requests r where r.user_id = p.id order by r.created_at desc limit 1)
  )
  from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.set_my_name(p_name text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set name = left(trim(coalesce(p_name, '')), 60) where id = auth.uid();
  return public.my_profile();
end $$;

create or replace function public.redeem_code(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  pr public.profiles;
  c public.activation_codes;
begin
  select * into pr from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'no_profile'; end if;
  if pr.blocked then raise exception 'blocked'; end if;
  if pr.role <> 'pending' then raise exception 'already_active'; end if;
  select * into c from public.activation_codes where code = upper(trim(p_code)) for update;
  if not found or c.revoked then raise exception 'code_invalid'; end if;
  if c.expires_at < now() then raise exception 'code_expired'; end if;
  if c.uses_left < 1 then raise exception 'code_used'; end if;
  update public.activation_codes set uses_left = uses_left - 1 where code = c.code;
  insert into public.code_redemptions (code, user_id) values (c.code, pr.id) on conflict do nothing;
  update public.profiles set role = 'free', code_used = c.code, activated_at = now() where id = pr.id;
  return public.my_profile();
end $$;

create or replace function public.request_trainer(p_message text) returns json
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  select * into pr from public.profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if pr.blocked then raise exception 'blocked'; end if;
  if pr.role in ('trainer', 'dev') then raise exception 'already_trainer'; end if;
  if exists (select 1 from public.trainer_requests where user_id = pr.id and status = 'pending') then
    raise exception 'request_pending';
  end if;
  insert into public.trainer_requests (user_id, message) values (pr.id, left(trim(coalesce(p_message, '')), 1000));
  return public.my_profile();
end $$;

-- Borra la cuenta y, en cascada, todos sus datos del servidor
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'no_session'; end if;
  delete from auth.users where id = auth.uid();
end $$;

/* ---------- funciones de desarrollador ---------- */

create or replace function public.admin_users()
returns table (id uuid, email text, name text, role text, blocked boolean, created_at timestamptz,
               activated_at timestamptz, code_used text, last_activity timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.email, p.name, p.role, p.blocked, p.created_at, p.activated_at, p.code_used,
           (select max(k.updated_at) from public.kv k where k.user_id = p.id)
    from public.profiles p order by p.created_at desc;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  if p_role not in ('dev', 'trainer', 'client', 'free', 'pending') then raise exception 'bad_role'; end if;
  if p_user = auth.uid() and p_role <> 'dev' then raise exception 'self'; end if;
  update public.profiles
     set role = p_role,
         activated_at = case when p_role = 'pending' then null else coalesce(activated_at, now()) end
   where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_set_blocked(p_user uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'self'; end if;
  update public.profiles set blocked = p_blocked, blocked_at = case when p_blocked then now() end where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

-- Códigos tipo «FIT-7KQ2-MX9P» (sin letras que se confundan: ni O, ni 0, ni I, ni 1)
create or replace function public.admin_create_codes(p_count int, p_uses int, p_note text default '')
returns setof public.activation_codes
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  n int; k int; c text;
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  if p_count < 1 or p_count > 50 or p_uses < 1 or p_uses > 500 then raise exception 'bad_amount'; end if;
  for n in 1..p_count loop
    loop
      c := 'FIT-';
      for k in 1..8 loop
        c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        if k = 4 then c := c || '-'; end if;
      end loop;
      exit when not exists (select 1 from public.activation_codes a where a.code = c);
    end loop;
    insert into public.activation_codes (code, max_uses, uses_left, note, created_by)
    values (c, p_uses, p_uses, left(trim(coalesce(p_note, '')), 120), auth.uid());
  end loop;
  return query select * from public.activation_codes a where a.created_by = auth.uid()
                order by a.created_at desc limit p_count;
end $$;

create or replace function public.admin_codes()
returns table (code text, max_uses int, uses_left int, expires_at timestamptz, revoked boolean,
               note text, created_at timestamptz, used_by text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  return query
    select a.code, a.max_uses, a.uses_left, a.expires_at, a.revoked, a.note, a.created_at,
           (select string_agg(coalesce(nullif(p.name, ''), p.email), ', ' order by r.used_at)
              from public.code_redemptions r join public.profiles p on p.id = r.user_id where r.code = a.code)
    from public.activation_codes a order by a.created_at desc limit 300;
end $$;

create or replace function public.admin_revoke_code(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  update public.activation_codes set revoked = true where code = p_code;
end $$;

create or replace function public.admin_requests()
returns table (id bigint, user_id uuid, email text, name text, role text, message text, status text,
               reply text, created_at timestamptz, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  return query
    select r.id, r.user_id, p.email, p.name, p.role, r.message, r.status, r.reply, r.created_at, r.resolved_at
    from public.trainer_requests r join public.profiles p on p.id = r.user_id
    order by (r.status = 'pending') desc, r.created_at desc limit 300;
end $$;

create or replace function public.admin_resolve_request(p_id bigint, p_approve boolean, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.trainer_requests;
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  select * into r from public.trainer_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'pending' then raise exception 'already_resolved'; end if;
  update public.trainer_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reply = left(trim(coalesce(p_reply, '')), 1000), resolved_at = now(), resolved_by = auth.uid()
   where id = p_id;
  if p_approve then
    update public.profiles set role = 'trainer', activated_at = coalesce(activated_at, now()) where id = r.user_id;
  end if;
end $$;

/* ---------- permisos de las funciones ---------- */

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_profile()', 'public.set_my_name(text)', 'public.redeem_code(text)', 'public.request_trainer(text)',
    'public.delete_my_account()', 'public.admin_users()', 'public.admin_set_role(uuid, text)',
    'public.admin_set_blocked(uuid, boolean)', 'public.admin_create_codes(int, int, text)', 'public.admin_codes()',
    'public.admin_revoke_code(text)', 'public.admin_requests()', 'public.admin_resolve_request(bigint, boolean, text)',
    'public.is_dev()', 'public.is_active()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
