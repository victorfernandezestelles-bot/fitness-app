-- 009 · Revisión de seguridad (13/11/2026).
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 a 008.
-- Redefine funciones de 002, 003, 004, 005, 006, 007 y 008: si vuelves a ejecutar alguno de esos, ejecuta después este.
--
-- · Las fotos compartidas solo pueden ser imágenes de verdad (nada de texto que se cuele como código en la app).
-- · El nombre de la unidad de un alimento compartido no puede llevar < > " &.
-- · Un entrenador bloqueado deja de ver a sus clientes y no puede desvincularlos ni tocar sus plantillas.
--   Una cuenta bloqueada no puede compartir fotos, responder propuestas ni cambiar su nombre
--   (sí puede desvincularse, dejar de compartir fotos y borrar su cuenta: son derechos sobre sus datos).
-- · Límites para que una sola cuenta no pueda llenar la base de datos gratuita.
-- · Si se borra un entrenador desde el panel de Supabase, sus clientes tienen 15 días, como si se diera de baja.
-- · El correo del entrenador ya no se enseña al cliente (solo su nombre, o «Entrenador»), tampoco si borra su cuenta.
-- · Los códigos FIT- y ENT- nuevos se generan con un azar criptográfico.

/* ---------- comprobación común ---------- */

create or replace function public._not_blocked() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.blocked) then
    raise exception 'blocked';
  end if;
end $$;

/* ---------- fotos compartidas ---------- */

delete from public.shared_photos
 where thumb !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' or image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' or set_id !~ '^[A-Za-z0-9_.:-]{1,60}$';
alter table public.shared_photos drop constraint if exists shared_photos_fmt;
alter table public.shared_photos add constraint shared_photos_fmt check (
  set_id ~ '^[A-Za-z0-9_.:-]{1,60}$'
  and thumb ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$'
  and image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$');

create or replace function public.client_photo_share(p_set text, p_date date, p_pose text, p_thumb text, p_image text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  select * into l from public.links x
   where x.client_id = auth.uid() and x.status = 'active' and (x.unlink_at is null or x.unlink_at > now()) limit 1;
  if not found then raise exception 'no_link'; end if;
  -- Como mucho 60 fotos compartidas por cliente (20 sesiones de 3 poses)
  if (select count(*) from public.shared_photos s where s.client_id = auth.uid()
        and not (s.link_id = l.id and s.set_id = p_set and s.pose = p_pose)) >= 60 then
    raise exception 'too_many';
  end if;
  insert into public.shared_photos (link_id, client_id, set_id, date, pose, thumb, image)
  values (l.id, auth.uid(), p_set, p_date, p_pose, p_thumb, p_image)
  on conflict (link_id, set_id, pose) do update set date = excluded.date, thumb = excluded.thumb, image = excluded.image;
end $$;

/* ---------- alimentos compartidos ---------- */

update public.shared_foods set unit_name = nullif(trim(translate(unit_name, '<>"&', '')), '')
 where unit_name ~ '[<>"&]';
alter table public.shared_foods drop constraint if exists shared_foods_unit_fmt;
alter table public.shared_foods add constraint shared_foods_unit_fmt check (unit_name is null or unit_name !~ '[<>"&]');

create or replace function public.shared_food_put(p_code text, p_name text, p_brand text, p_per100 jsonb,
                                                  p_serving_g numeric, p_unit_name text, p_unit_g numeric) returns text
language plpgsql security definer set search_path = '' as $$
declare cur public.shared_foods; existed boolean; n int; clean jsonb := public._clean_per100(p_per100);
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  select * into cur from public.shared_foods where barcode = p_code for update;
  existed := found;
  if existed and cur.created_by is distinct from auth.uid() then return 'exists'; end if;
  if (select count(*) from jsonb_object_keys(clean)) > 60 then raise exception 'bad_food'; end if;
  -- Como mucho 30 productos nuevos al día por persona
  if not existed and (select count(*) from public.shared_foods where created_by = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limit';
  end if;
  insert into public.shared_foods (barcode, name, brand, per100, serving_g, unit_name, unit_g, created_by)
  values (p_code, left(trim(coalesce(p_name, '')), 120), left(trim(coalesce(p_brand, '')), 80), clean,
          p_serving_g, nullif(left(trim(translate(coalesce(p_unit_name, ''), '<>"&', '')), 30), ''), p_unit_g, auth.uid())
  on conflict (barcode) do update
     set name = excluded.name, brand = excluded.brand, per100 = excluded.per100, serving_g = excluded.serving_g,
         unit_name = excluded.unit_name, unit_g = excluded.unit_g, updated_at = now()
   where public.shared_foods.created_by = auth.uid();
  -- Si otra persona lo ha dado de alta a la vez, el suyo no se toca
  get diagnostics n = row_count;
  if n = 0 then return 'exists'; end if;
  return case when existed then 'updated' else 'created' end;
end $$;

/* ---------- cuentas bloqueadas ---------- */

create or replace function public._my_client_link(p_link bigint) returns public.links
language plpgsql stable security definer set search_path = '' as $$
declare l public.links;
begin
  perform public._not_blocked();
  select * into l from public.links x
   where x.id = p_link and x.trainer_id = auth.uid() and x.status in ('active', 'blocked')
     and (x.unlink_at is null or x.unlink_at > now());
  if not found then raise exception 'not_found'; end if;
  return l;
end $$;

create or replace function public.trainer_client_rows(p_link bigint)
returns table (key text, value jsonb, v int, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare l public.links := public._my_client_link(p_link);
begin
  return query
    select k.key,
           case when k.key = 'settings'
                then jsonb_build_object('goals', k.value -> 'goals', 'goalsTrain', k.value -> 'goalsTrain',
                                        'profile', k.value -> 'profile', 'rate', k.value -> 'rate')
                else k.value end,
           k.v, k.updated_at
      from public.kv k
     where k.user_id = l.client_id and not k.deleted
       and (k.key = 'settings' or k.key like 'day:%' or k.key like 'wk:%' or k.key like 'weights/%'
            or k.key like 'measures/%' or k.key like 'activities/%' or k.key like 'exercises/%' or k.key like 'routines/%');
end $$;

create or replace function public.trainer_clients()
returns table (link_id bigint, client_id uuid, name text, email text, status text, banned boolean,
               created_at timestamptz, accepted_at timestamptz, blocked_at timestamptz,
               unlink_at timestamptz, last_activity timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'no_session'; end if;
  perform public._not_blocked();
  perform public._expire_links();
  return query
    select l.id, l.client_id, p.name, p.email, l.status, l.banned, l.created_at, l.accepted_at, l.blocked_at,
           l.unlink_at, (select max(k.updated_at) from public.kv k where k.user_id = l.client_id)
      from public.links l join public.profiles p on p.id = l.client_id
     where l.trainer_id = auth.uid() and (l.status in ('requested', 'active', 'blocked') or l.banned)
     order by (l.status = 'requested') desc, lower(coalesce(nullif(p.name, ''), p.email));
end $$;

create or replace function public.client_proposal_respond(p_id bigint, p_accept boolean, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._not_blocked();
  update public.proposals p
     set status = case when p_accept then 'accepted' else 'rejected' end,
         reply = left(trim(coalesce(p_reply, '')), 1000), resolved_at = now()
    from public.links l
   where p.id = p_id and p.status = 'pending' and l.id = p.link_id and l.client_id = auth.uid()
     and l.status = 'active' and (l.unlink_at is null or l.unlink_at > now());
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.set_my_name(p_name text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform public._not_blocked();
  update public.profiles set name = left(trim(coalesce(p_name, '')), 60) where id = auth.uid();
  return public.my_profile();
end $$;

create or replace function public.trainer_unlink(p_link bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  perform public._not_blocked();
  select * into l from public.links where id = p_link and trainer_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if l.status not in ('active', 'blocked') then raise exception 'bad_state'; end if;
  update public.links set status = 'ended', ended_at = now(), ended_by = 'trainer' where id = l.id;
  perform public._client_check(l.client_id);
end $$;

create or replace function public.request_extension(p_message text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  perform public._not_blocked();
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

create or replace function public.trainer_template_delete(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._not_blocked();
  delete from public.templates where id = p_id and trainer_id = auth.uid();
end $$;

/* ---------- límites ---------- */

-- Datos sincronizados: cada dato hasta 256 KB y hasta 20.000 por cuenta
create or replace function public.kv_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if length(new.key) > 200 or pg_column_size(new.value) > 262144 then
    raise exception 'too_big';
  end if;
  -- Solo cuenta un dato nuevo (no un cambio ni un borrado); la app sube con «insert … on conflict», que pasa por aquí
  if tg_op = 'INSERT' and not new.deleted
     and not exists (select 1 from public.kv k where k.user_id = new.user_id and k.key = new.key)
     and (select count(*) from public.kv k where k.user_id = new.user_id and not k.deleted) >= 20000 then
    raise exception 'too_many';
  end if;
  return new;
end $$;
drop trigger if exists kv_limits on public.kv;
create trigger kv_limits before insert or update on public.kv for each row execute function public.kv_limits();

create or replace function public.trainer_note_save(p_link bigint, p_id bigint, p_body text, p_visible boolean) returns bigint
language plpgsql security definer set search_path = '' as $$
declare out bigint; b text := left(trim(coalesce(p_body, '')), 4000);
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  perform public._my_client_link(p_link);
  if b = '' then raise exception 'empty'; end if;
  if p_id is null then
    if (select count(*) from public.notes where link_id = p_link) >= 500 then raise exception 'too_many'; end if;
    insert into public.notes (link_id, body, visible) values (p_link, b, coalesce(p_visible, false)) returning id into out;
  else
    update public.notes set body = b, visible = coalesce(p_visible, false), updated_at = now()
     where id = p_id and link_id = p_link returning id into out;
    if out is null then raise exception 'not_found'; end if;
  end if;
  return out;
end $$;

create or replace function public.trainer_propose(p_link bigint, p_goals jsonb, p_goals_train jsonb, p_message text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare g jsonb; gt jsonb; out bigint;
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  perform public._my_client_link(p_link);
  g := public._clean_goals(p_goals, array['kcal', 'p', 'c', 'f', 'steps']);
  gt := public._clean_goals(p_goals_train, array['kcal', 'p', 'c', 'f']);
  if g is null or not exists (select 1 from jsonb_each(g) e where e.value <> 'null'::jsonb) then raise exception 'bad_goals'; end if;
  -- Como mucho 50 propuestas en 30 días por cliente
  if (select count(*) from public.proposals where link_id = p_link and created_at > now() - interval '30 days') >= 50 then raise exception 'rate_limit'; end if;
  update public.proposals set status = 'cancelled', resolved_at = now() where link_id = p_link and status = 'pending';
  insert into public.proposals (link_id, goals, goals_train, message)
  values (p_link, g, gt, left(trim(coalesce(p_message, '')), 1000)) returning id into out;
  return out;
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
  -- Como mucho 10 solicitudes al día (para no llenar la base de solicitudes)
  if (select count(*) from public.links where client_id = me.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limit';
  end if;
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
  values (t.id, me.id, coalesce(nullif(t.name, ''), ''),
          json_build_object('v', 1, 'at', now())::jsonb);
  return public.my_profile();
end $$;

/* ---------- entrenador borrado desde el panel ---------- */

create or replace function public._links_trainer_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('active', 'blocked') then
    new.unlink_at := coalesce(old.unlink_at, now() + interval '15 days');
  elsif new.status = 'requested' then
    new.status := 'rejected'; new.ended_at := now(); new.ended_by := 'trainer_off';
  end if;
  return new;
end $$;
drop trigger if exists links_trainer_gone on public.links;
create trigger links_trainer_gone before update of trainer_id on public.links
  for each row when (old.trainer_id is not null and new.trainer_id is null)
  execute function public._links_trainer_gone();
update public.links set unlink_at = now() + interval '15 days'
 where trainer_id is null and status in ('active', 'blocked') and unlink_at is null;

/* ---------- el correo del entrenador no se enseña ---------- */

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
                                      'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), 'Entrenador'))
               from public.links l left join public.profiles t on t.id = l.trainer_id
              where l.client_id = p.id and l.status in ('active', 'blocked') limit 1),
    -- Solicitud enviada y pendiente
    'link_request', (select json_build_object('id', l.id, 'created_at', l.created_at,
                                              'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), 'Entrenador'))
                       from public.links l left join public.profiles t on t.id = l.trainer_id
                      where l.client_id = p.id and l.status = 'requested' limit 1),
    -- Lo último que pasó con un vínculo (últimos 30 días), para explicar por qué ya no lo hay
    'link_last', (select json_build_object('status', l.status, 'ended_by', l.ended_by, 'ended_at', l.ended_at,
                                           'trainer_name', coalesce(nullif(t.name, ''), nullif(l.trainer_name, ''), 'Entrenador'))
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

create or replace function public.lookup_trainer(p_code text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare t public.profiles;
begin
  select * into t from public.profiles
   where trainer_code = upper(trim(p_code)) and role in ('trainer', 'dev') and not blocked;
  if not found then raise exception 'code_invalid'; end if;
  if t.id = auth.uid() then raise exception 'self'; end if;
  return json_build_object('name', coalesce(nullif(t.name, ''), 'Entrenador'));
end $$;

update public.links l set trainer_name = coalesce(nullif(p.name, ''), '')
  from public.profiles p
 where p.id = l.trainer_id and l.trainer_name = p.email;
-- Vínculos de entrenadores que ya borraron su cuenta: se quita el correo que quedó guardado
update public.links set trainer_name = '' where trainer_id is null and trainer_name like '%@%';

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_session'; end if;
  update public.links l set trainer_name = coalesce(nullif(p.name, ''), '')
    from public.profiles p where p.id = me and l.trainer_id = me;
  perform public._trainer_off(me);
  delete from auth.users where id = me;
end $$;

/* ---------- códigos con azar criptográfico ---------- */

create or replace function public._new_trainer_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  k int; c text; b bytea;
begin
  loop
    c := 'ENT-';
    b := sha256(uuid_send(gen_random_uuid()));
    for k in 1..8 loop
      c := c || substr(alphabet, 1 + get_byte(b, k - 1) % 32, 1);
      if k = 4 then c := c || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.profiles p where p.trainer_code = c);
  end loop;
  return c;
end $$;

create or replace function public.admin_create_codes(p_count int, p_uses int, p_note text default '')
returns setof public.activation_codes
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  n int; k int; c text; b bytea;
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  if p_count < 1 or p_count > 50 or p_uses < 1 or p_uses > 500 then raise exception 'bad_amount'; end if;
  for n in 1..p_count loop
    loop
      c := 'FIT-';
      b := sha256(uuid_send(gen_random_uuid()));
      for k in 1..8 loop
        c := c || substr(alphabet, 1 + get_byte(b, k - 1) % 32, 1);
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

/* ---------- permisos ---------- */

-- Nadie toca las tablas directamente salvo lo imprescindible (las reglas de cada fila siguen en vigor)
revoke all on public.kv, public.profiles from anon, authenticated;
grant select, insert, update, delete on public.kv to authenticated;
grant select on public.profiles to authenticated;

do $$
declare f text;
begin
  foreach f in array array['public._not_blocked()', 'public.kv_limits()', 'public._links_trainer_gone()',
                           'public._my_client_link(bigint)', 'public._new_trainer_code()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.client_photo_share(text, date, text, text, text)',
    'public.shared_food_put(text, text, text, jsonb, numeric, text, numeric)',
    'public.trainer_client_rows(bigint)', 'public.trainer_clients()',
    'public.client_proposal_respond(bigint, boolean, text)', 'public.set_my_name(text)',
    'public.trainer_note_save(bigint, bigint, text, boolean)', 'public.trainer_propose(bigint, jsonb, jsonb, text)',
    'public.link_request(text)', 'public.my_profile()', 'public.lookup_trainer(text)',
    'public.admin_create_codes(int, int, text)', 'public.delete_my_account()', 'public.trainer_unlink(bigint)',
    'public.request_extension(text)', 'public.trainer_template_delete(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
