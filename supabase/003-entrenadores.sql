-- 003 · Fase 2: vínculo entre entrenador y cliente.
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 y 002.
--
-- · Cada entrenador (y cada desarrollador) tiene un código fijo «ENT-XXXX-XXXX» para todos sus clientes.
-- · El cliente lo introduce, acepta qué se comparte y queda «solicitado».
-- · El entrenador acepta, rechaza o bloquea la solicitud. Al aceptar, la cuenta pasa a «cliente»
--   (un usuario libre pierde su activación y no la recupera al desvincularse).
-- · El entrenador puede bloquear, desbloquear o desvincular a cada cliente; el cliente puede desvincularse.
-- · Si el desarrollador quita el rol de entrenador (o el entrenador borra su cuenta), sus clientes siguen
--   15 días y después quedan «sin entrenador» (igual que pendientes). El entrenador puede pedir ampliar el plazo.

/* ---------- código fijo del entrenador ---------- */

alter table public.profiles add column if not exists trainer_code text;
create unique index if not exists profiles_trainer_code on public.profiles (trainer_code);

create or replace function public._new_trainer_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  k int; c text;
begin
  loop
    c := 'ENT-';
    for k in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if k = 4 then c := c || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.profiles p where p.trainer_code = c);
  end loop;
  return c;
end $$;

create or replace function public._give_trainer_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role in ('trainer', 'dev') and new.trainer_code is null then
    new.trainer_code := public._new_trainer_code();
  end if;
  return new;
end $$;
drop trigger if exists give_trainer_code on public.profiles;
create trigger give_trainer_code before insert or update of role on public.profiles
  for each row execute function public._give_trainer_code();

update public.profiles set trainer_code = public._new_trainer_code()
 where role in ('trainer', 'dev') and trainer_code is null;

/* ---------- vínculos ---------- */

create table if not exists public.links (
  id bigint generated always as identity primary key,
  trainer_id uuid references auth.users on delete set null,
  client_id uuid not null references auth.users on delete cascade,
  trainer_name text not null default '',
  status text not null default 'requested'
    check (status in ('requested', 'active', 'blocked', 'ended', 'rejected', 'cancelled')),
  banned boolean not null default false,
  consent jsonb not null default '{}',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  blocked_at timestamptz,
  ended_at timestamptz,
  ended_by text,
  unlink_at timestamptz,
  check (trainer_id is null or trainer_id <> client_id)
);
-- Como mucho un vínculo en curso (activo o bloqueado) y una solicitud por cliente
create unique index if not exists links_one_current on public.links (client_id) where status in ('active', 'blocked');
create unique index if not exists links_one_request on public.links (client_id) where status = 'requested';
create index if not exists links_trainer on public.links (trainer_id);
create index if not exists links_unlink_at on public.links (unlink_at) where unlink_at is not null;
alter table public.links enable row level security;
revoke all on public.links from anon, authenticated;

/* ---------- solicitudes: ahora también para «ampliar plazo» ---------- */

alter table public.trainer_requests add column if not exists kind text not null default 'trainer';
alter table public.trainer_requests add column if not exists until timestamptz;
alter table public.trainer_requests drop constraint if exists trainer_requests_kind_check;
alter table public.trainer_requests add constraint trainer_requests_kind_check check (kind in ('trainer', 'extension'));
drop index if exists public.trainer_requests_one_pending;
create unique index if not exists trainer_requests_one_pending_kind
  on public.trainer_requests (user_id, kind) where status = 'pending';

/* ---------- reglas de acceso ---------- */

create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role in ('trainer', 'dev') and not p.blocked);
$$;

-- Activa = no bloqueada y (dev, entrenador, libre, o cliente con un vínculo activo que no ha caducado)
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and not p.blocked
       and (p.role in ('dev', 'trainer', 'free')
            or (p.role = 'client' and exists (
                  select 1 from public.links l
                   where l.client_id = p.id and l.status = 'active'
                     and (l.unlink_at is null or l.unlink_at > now())))));
$$;

-- Un cliente sin vínculo en curso vuelve a «pendiente»
create or replace function public._client_check(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set role = 'pending', activated_at = null
   where p.id = p_client and p.role = 'client'
     and not exists (select 1 from public.links l where l.client_id = p.id and l.status in ('active', 'blocked'));
end $$;

-- Cierra los vínculos cuyo plazo de 15 días ya ha pasado
create or replace function public._expire_links() returns void
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  with ex as (
    update public.links set status = 'ended', ended_at = now(), ended_by = 'expired'
     where status in ('active', 'blocked') and unlink_at is not null and unlink_at <= now()
    returning client_id)
  select array_agg(client_id) into ids from ex;
  if ids is not null then
    update public.profiles p set role = 'pending', activated_at = null
     where p.id = any (ids) and p.role = 'client'
       and not exists (select 1 from public.links l where l.client_id = p.id and l.status in ('active', 'blocked'));
  end if;
end $$;

-- Programa la desvinculación de los clientes de alguien que deja de ser entrenador
create or replace function public._trainer_off(p_trainer uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.links set unlink_at = now() + interval '15 days'
   where trainer_id = p_trainer and status in ('active', 'blocked') and unlink_at is null;
  update public.links set status = 'rejected', ended_at = now(), ended_by = 'trainer_off'
   where trainer_id = p_trainer and status = 'requested';
end $$;

-- Y la anula si vuelve a serlo
create or replace function public._trainer_on(p_trainer uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.links set unlink_at = null
   where trainer_id = p_trainer and status in ('active', 'blocked') and unlink_at is not null;
end $$;

/* ---------- perfil propio ---------- */

create or replace function public.my_profile() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); out json;
begin
  perform public._expire_links();
  select json_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'role', p.role, 'blocked', p.blocked,
    'code_used', p.code_used, 'activated_at', p.activated_at, 'created_at', p.created_at,
    'trainer_code', case when p.role in ('trainer', 'dev') then p.trainer_code end,
    'request', (select json_build_object('status', r.status, 'reply', r.reply, 'created_at', r.created_at)
                  from public.trainer_requests r where r.user_id = p.id and r.kind = 'trainer'
                 order by r.created_at desc limit 1),
    -- Vínculo en curso con su entrenador
    'link', (select json_build_object('id', l.id, 'status', l.status, 'since', l.accepted_at,
                                      'unlink_at', l.unlink_at,
                                      'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), t.email, 'Entrenador'))
               from public.links l left join public.profiles t on t.id = l.trainer_id
              where l.client_id = p.id and l.status in ('active', 'blocked') limit 1),
    -- Solicitud enviada y pendiente
    'link_request', (select json_build_object('id', l.id, 'created_at', l.created_at,
                                              'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), t.email, 'Entrenador'))
                       from public.links l left join public.profiles t on t.id = l.trainer_id
                      where l.client_id = p.id and l.status = 'requested' limit 1),
    -- Lo último que pasó con un vínculo (últimos 30 días), para explicar por qué ya no lo hay
    'link_last', (select json_build_object('status', l.status, 'ended_by', l.ended_by, 'ended_at', l.ended_at,
                                           'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), t.email, 'Entrenador'))
                    from public.links l left join public.profiles t on t.id = l.trainer_id
                   where l.client_id = p.id and l.status in ('ended', 'rejected') and l.ended_at > now() - interval '30 days'
                   order by l.ended_at desc limit 1),
    -- Como entrenador: número de clientes, solicitudes y, si ya no lo es, el plazo y la ampliación
    'coaching', case when p.role in ('trainer', 'dev')
                       or exists (select 1 from public.links l where l.trainer_id = p.id and l.status in ('active', 'blocked'))
      then json_build_object(
        'clients', (select count(*) from public.links l where l.trainer_id = p.id and l.status in ('active', 'blocked')),
        'requests', (select count(*) from public.links l where l.trainer_id = p.id and l.status = 'requested'),
        'unlink_at', (select min(l.unlink_at) from public.links l where l.trainer_id = p.id and l.status in ('active', 'blocked')),
        'extension', (select json_build_object('status', r.status, 'until', r.until, 'reply', r.reply, 'created_at', r.created_at)
                        from public.trainer_requests r where r.user_id = p.id and r.kind = 'extension'
                       order by r.created_at desc limit 1))
    end
  ) into out
  from public.profiles p where p.id = me;
  return out;
end $$;

create or replace function public.request_trainer(p_message text) returns json
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  select * into pr from public.profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if pr.blocked then raise exception 'blocked'; end if;
  if pr.role in ('trainer', 'dev') then raise exception 'already_trainer'; end if;
  if exists (select 1 from public.trainer_requests where user_id = pr.id and kind = 'trainer' and status = 'pending') then
    raise exception 'request_pending';
  end if;
  insert into public.trainer_requests (user_id, message, kind) values (pr.id, left(trim(coalesce(p_message, '')), 1000), 'trainer');
  return public.my_profile();
end $$;

-- Al borrar la cuenta de un entrenador, sus clientes también tienen 15 días
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_session'; end if;
  update public.links l set trainer_name = coalesce(nullif(p.name, ''), p.email, '')
    from public.profiles p where p.id = me and l.trainer_id = me;
  perform public._trainer_off(me);
  delete from auth.users where id = me;
end $$;

/* ---------- cliente ---------- */

-- Nombre del entrenador a partir de su código (para enseñarlo antes de enviar la solicitud)
create or replace function public.lookup_trainer(p_code text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare t public.profiles;
begin
  select * into t from public.profiles
   where trainer_code = upper(trim(p_code)) and role in ('trainer', 'dev') and not blocked;
  if not found then raise exception 'code_invalid'; end if;
  if t.id = auth.uid() then raise exception 'self'; end if;
  return json_build_object('name', coalesce(nullif(t.name, ''), t.email, 'Entrenador'));
end $$;

create or replace function public.link_request(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  t public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if me.blocked then raise exception 'blocked'; end if;
  select * into t from public.profiles
   where trainer_code = upper(trim(p_code)) and role in ('trainer', 'dev') and not blocked;
  if not found then raise exception 'code_invalid'; end if;
  if t.id = me.id then raise exception 'self'; end if;
  if exists (select 1 from public.links where client_id = me.id and trainer_id = t.id and status in ('active', 'blocked')) then
    raise exception 'already_linked';
  end if;
  if exists (select 1 from public.links where client_id = me.id and trainer_id = t.id and status = 'requested') then
    raise exception 'request_pending';
  end if;
  if exists (select 1 from public.links where client_id = me.id and trainer_id = t.id and banned) then
    raise exception 'link_refused';
  end if;
  -- Solo una solicitud a la vez: la anterior, a otro entrenador, se anula
  update public.links set status = 'cancelled', ended_at = now(), ended_by = 'client'
   where client_id = me.id and status = 'requested';
  insert into public.links (trainer_id, client_id, trainer_name, consent)
  values (t.id, me.id, coalesce(nullif(t.name, ''), t.email, ''),
          json_build_object('v', 1, 'at', now())::jsonb);
  return public.my_profile();
end $$;

create or replace function public.link_cancel() returns json
language plpgsql security definer set search_path = '' as $$
begin
  update public.links set status = 'cancelled', ended_at = now(), ended_by = 'client'
   where client_id = auth.uid() and status = 'requested';
  return public.my_profile();
end $$;

create or replace function public.client_unlink() returns json
language plpgsql security definer set search_path = '' as $$
begin
  update public.links set status = 'ended', ended_at = now(), ended_by = 'client'
   where client_id = auth.uid() and status in ('active', 'blocked');
  if not found then raise exception 'no_link'; end if;
  perform public._client_check(auth.uid());
  return public.my_profile();
end $$;

/* ---------- entrenador ---------- */

create or replace function public.trainer_clients()
returns table (link_id bigint, client_id uuid, name text, email text, status text, banned boolean,
               created_at timestamptz, accepted_at timestamptz, blocked_at timestamptz,
               unlink_at timestamptz, last_activity timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'no_session'; end if;
  perform public._expire_links();
  return query
    select l.id, l.client_id, p.name, p.email, l.status, l.banned, l.created_at, l.accepted_at, l.blocked_at,
           l.unlink_at, (select max(k.updated_at) from public.kv k where k.user_id = l.client_id)
      from public.links l join public.profiles p on p.id = l.client_id
     where l.trainer_id = auth.uid() and (l.status in ('requested', 'active', 'blocked') or l.banned)
     order by (l.status = 'requested') desc, lower(coalesce(nullif(p.name, ''), p.email));
end $$;

-- p_action: accept · reject · block (rechaza y no deja volver a pedirlo)
create or replace function public.trainer_respond(p_link bigint, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  select * into l from public.links where id = p_link and trainer_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if l.status <> 'requested' then raise exception 'already_resolved'; end if;
  if p_action = 'accept' then
    -- Si ya tenía otro entrenador, ese vínculo termina
    update public.links set status = 'ended', ended_at = now(), ended_by = 'switch'
     where client_id = l.client_id and status in ('active', 'blocked');
    update public.links set status = 'active', accepted_at = now() where id = l.id;
    update public.profiles set role = 'client', activated_at = now()
     where id = l.client_id and role in ('pending', 'free', 'client');
  elsif p_action in ('reject', 'block') then
    update public.links set status = 'rejected', ended_at = now(), ended_by = 'trainer', banned = (p_action = 'block')
     where id = l.id;
  else
    raise exception 'bad_action';
  end if;
end $$;

-- Bloquear o desbloquear a un cliente (o quitar el bloqueo a una solicitud bloqueada)
create or replace function public.trainer_set_blocked(p_link bigint, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  select * into l from public.links where id = p_link and trainer_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if l.status in ('active', 'blocked') then
    update public.links set status = case when p_blocked then 'blocked' else 'active' end,
                            blocked_at = case when p_blocked then now() end
     where id = l.id;
  elsif l.banned and not p_blocked then
    update public.links set banned = false where id = l.id;
  else
    raise exception 'bad_state';
  end if;
end $$;

-- Desvincular a un cliente (también puede hacerlo quien ya no es entrenador)
create or replace function public.trainer_unlink(p_link bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links where id = p_link and trainer_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if l.status not in ('active', 'blocked') then raise exception 'bad_state'; end if;
  update public.links set status = 'ended', ended_at = now(), ended_by = 'trainer' where id = l.id;
  perform public._client_check(l.client_id);
end $$;

-- Quien ha dejado de ser entrenador pide más tiempo para sus clientes
create or replace function public.request_extension(p_message text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_session'; end if;
  if not exists (select 1 from public.links where trainer_id = me and status in ('active', 'blocked') and unlink_at is not null) then
    raise exception 'no_clients';
  end if;
  if exists (select 1 from public.trainer_requests where user_id = me and kind = 'extension' and status = 'pending') then
    raise exception 'request_pending';
  end if;
  insert into public.trainer_requests (user_id, message, kind) values (me, left(trim(coalesce(p_message, '')), 1000), 'extension');
  return public.my_profile();
end $$;

/* ---------- desarrollador ---------- */

drop function if exists public.admin_users();
create function public.admin_users()
returns table (id uuid, email text, name text, role text, blocked boolean, created_at timestamptz,
               activated_at timestamptz, code_used text, last_activity timestamptz,
               trainer_name text, link_status text, clients bigint, unlink_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  perform public._expire_links();
  return query
    select p.id, p.email, p.name, p.role, p.blocked, p.created_at, p.activated_at, p.code_used,
           (select max(k.updated_at) from public.kv k where k.user_id = p.id),
           cl.tname, cl.status,
           (select count(*) from public.links t where t.trainer_id = p.id and t.status in ('active', 'blocked')),
           (select min(t.unlink_at) from public.links t where t.trainer_id = p.id and t.status in ('active', 'blocked'))
      from public.profiles p
      left join lateral (
        select coalesce(nullif(tp.name, ''), nullif(l.trainer_name, ''), tp.email) as tname, l.status
          from public.links l left join public.profiles tp on tp.id = l.trainer_id
         where l.client_id = p.id and l.status in ('active', 'blocked') limit 1) cl on true
     order by p.created_at desc;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  if p_role not in ('dev', 'trainer', 'client', 'free', 'pending') then raise exception 'bad_role'; end if;
  if p_user = auth.uid() and p_role <> 'dev' then raise exception 'self'; end if;
  select role into old from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  update public.profiles
     set role = p_role,
         activated_at = case when p_role = 'pending' then null else coalesce(activated_at, now()) end
   where id = p_user;
  if old in ('trainer', 'dev') and p_role not in ('trainer', 'dev') then
    perform public._trainer_off(p_user);
  elsif p_role in ('trainer', 'dev') and old not in ('trainer', 'dev') then
    perform public._trainer_on(p_user);
  end if;
end $$;

drop function if exists public.admin_requests();
create function public.admin_requests()
returns table (id bigint, user_id uuid, email text, name text, role text, message text, status text,
               reply text, created_at timestamptz, resolved_at timestamptz,
               kind text, until timestamptz, clients bigint, unlink_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  return query
    select r.id, r.user_id, p.email, p.name, p.role, r.message, r.status, r.reply, r.created_at, r.resolved_at,
           r.kind, r.until,
           (select count(*) from public.links t where t.trainer_id = r.user_id and t.status in ('active', 'blocked')),
           (select min(t.unlink_at) from public.links t where t.trainer_id = r.user_id and t.status in ('active', 'blocked'))
      from public.trainer_requests r join public.profiles p on p.id = r.user_id
     order by (r.status = 'pending') desc, r.created_at desc limit 300;
end $$;

-- p_until solo para «ampliar plazo»: nueva fecha de desvinculación
drop function if exists public.admin_resolve_request(bigint, boolean, text);
create or replace function public.admin_resolve_request(p_id bigint, p_approve boolean, p_reply text,
                                                        p_until timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.trainer_requests;
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  select * into r from public.trainer_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'pending' then raise exception 'already_resolved'; end if;
  if r.kind = 'extension' and p_approve and (p_until is null or p_until <= now()) then raise exception 'bad_date'; end if;
  update public.trainer_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reply = left(trim(coalesce(p_reply, '')), 1000), resolved_at = now(), resolved_by = auth.uid(),
         until = case when r.kind = 'extension' and p_approve then p_until end
   where id = p_id;
  if p_approve and r.kind = 'trainer' then
    update public.profiles set role = 'trainer', activated_at = coalesce(activated_at, now())
     where id = r.user_id and role <> 'dev';
    perform public._trainer_on(r.user_id);
  elsif p_approve and r.kind = 'extension' then
    update public.links set unlink_at = p_until
     where trainer_id = r.user_id and status in ('active', 'blocked') and unlink_at is not null;
  end if;
end $$;

/* ---------- permisos de las funciones ---------- */

do $$
declare f text;
begin
  -- Internas: nadie las llama desde la app
  foreach f in array array[
    'public._new_trainer_code()', 'public._give_trainer_code()', 'public._client_check(uuid)',
    'public._expire_links()', 'public._trainer_off(uuid)', 'public._trainer_on(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.my_profile()', 'public.request_trainer(text)', 'public.delete_my_account()',
    'public.is_trainer()', 'public.is_active()',
    'public.lookup_trainer(text)', 'public.link_request(text)', 'public.link_cancel()', 'public.client_unlink()',
    'public.trainer_clients()', 'public.trainer_respond(bigint, text)', 'public.trainer_set_blocked(bigint, boolean)',
    'public.trainer_unlink(bigint)', 'public.request_extension(text)',
    'public.admin_users()', 'public.admin_set_role(uuid, text)', 'public.admin_requests()',
    'public.admin_resolve_request(bigint, boolean, text, timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
