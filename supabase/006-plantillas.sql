-- 006 · Fase 5: plantillas del entrenador (recetas y planes del día) compartidas con sus clientes.
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 a 005.
--
-- · El entrenador guarda plantillas de dos tipos: «recipe» (una de sus recetas) y «plan» (un día de comidas).
--   Dentro va todo lo necesario para usarlas: los alimentos propios que llevan, con sus valores.
-- · Las comparte con los clientes que elija; cada cliente solo ve las compartidas con él
--   mientras el vínculo siga en curso. El cliente puede guardar la receta o apuntar el plan en su diario.

create table if not exists public.templates (
  id bigint generated always as identity primary key,
  trainer_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('recipe', 'plan')),
  name text not null check (length(name) between 1 and 120),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_trainer on public.templates (trainer_id);
alter table public.templates enable row level security;
revoke all on public.templates from anon, authenticated;

create table if not exists public.template_shares (
  template_id bigint not null references public.templates on delete cascade,
  link_id bigint not null references public.links on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, link_id)
);
create index if not exists template_shares_link on public.template_shares (link_id);
alter table public.template_shares enable row level security;
revoke all on public.template_shares from anon, authenticated;

/* ---------- entrenador ---------- */

create or replace function public.trainer_templates()
returns table (id bigint, kind text, name text, payload jsonb, created_at timestamptz, updated_at timestamptz, shared_with bigint[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'no_session'; end if;
  return query
    select t.id, t.kind, t.name, t.payload, t.created_at, t.updated_at,
           coalesce((select array_agg(s.link_id order by s.link_id) from public.template_shares s
                       join public.links l on l.id = s.link_id
                      where s.template_id = t.id and l.status in ('active', 'blocked')), '{}')
      from public.templates t where t.trainer_id = auth.uid() order by t.updated_at desc limit 300;
end $$;

-- Crea (p_id null) o cambia una plantilla; devuelve su id
create or replace function public.trainer_template_save(p_id bigint, p_kind text, p_name text, p_payload jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare out bigint; n text := left(trim(coalesce(p_name, '')), 120);
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  if p_kind not in ('recipe', 'plan') then raise exception 'bad_kind'; end if;
  if n = '' then raise exception 'empty'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 200000 then raise exception 'too_big'; end if;
  if p_id is null then
    if (select count(*) from public.templates where trainer_id = auth.uid()) >= 300 then raise exception 'too_many'; end if;
    insert into public.templates (trainer_id, kind, name, payload) values (auth.uid(), p_kind, n, p_payload) returning id into out;
  else
    update public.templates set name = n, payload = p_payload, updated_at = now()
     where id = p_id and trainer_id = auth.uid() and kind = p_kind returning id into out;
    if out is null then raise exception 'not_found'; end if;
  end if;
  return out;
end $$;

create or replace function public.trainer_template_delete(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.templates where id = p_id and trainer_id = auth.uid();
end $$;

-- Deja la plantilla compartida exactamente con estos vínculos (solo los míos que siguen en curso)
create or replace function public.trainer_template_share(p_id bigint, p_links bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.templates where id = p_id and trainer_id = auth.uid()) then raise exception 'not_found'; end if;
  delete from public.template_shares s where s.template_id = p_id and not (s.link_id = any (coalesce(p_links, '{}')));
  insert into public.template_shares (template_id, link_id)
    select p_id, l.id from public.links l
     where l.id = any (coalesce(p_links, '{}')) and l.trainer_id = auth.uid() and l.status in ('active', 'blocked')
  on conflict do nothing;
end $$;

/* ---------- cliente ---------- */

-- Plantillas compartidas conmigo por mi entrenador actual (con su contenido)
create or replace function public.client_templates()
returns table (id bigint, kind text, name text, payload jsonb, updated_at timestamptz, shared_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select t.id, t.kind, t.name, t.payload, t.updated_at, s.created_at
      from public.links l
      join public.template_shares s on s.link_id = l.id
      join public.templates t on t.id = s.template_id
     where l.client_id = auth.uid() and l.status in ('active', 'blocked')
       and (l.unlink_at is null or l.unlink_at > now())
     order by greatest(t.updated_at, s.created_at) desc limit 100;
end $$;

-- La bandeja del cliente (de la fase 4) ahora también dice qué plantillas tiene, sin su contenido
create or replace function public.client_inbox() returns json
language plpgsql stable security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links x
   where x.client_id = auth.uid() and x.status in ('active', 'blocked')
     and (x.unlink_at is null or x.unlink_at > now()) limit 1;
  if not found then return json_build_object('notes', '[]'::json, 'proposal', null, 'templates', '[]'::json); end if;
  return json_build_object(
    'notes', coalesce((select json_agg(json_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'updated_at', n.updated_at)
                                 order by n.created_at desc)
                         from (select * from public.notes n where n.link_id = l.id and n.visible order by n.created_at desc limit 100) n), '[]'::json),
    'proposal', (select json_build_object('id', p.id, 'goals', p.goals, 'goals_train', p.goals_train, 'message', p.message, 'created_at', p.created_at)
                   from public.proposals p where p.link_id = l.id and p.status = 'pending' limit 1),
    'templates', coalesce((select json_agg(json_build_object('id', t.id, 'kind', t.kind, 'name', t.name,
                                                             'at', greatest(t.updated_at, s.created_at)) order by greatest(t.updated_at, s.created_at) desc)
                             from public.template_shares s join public.templates t on t.id = s.template_id
                            where s.link_id = l.id), '[]'::json));
end $$;

/* ---------- permisos ---------- */

do $$
declare f text;
begin
  foreach f in array array[
    'public.trainer_templates()', 'public.trainer_template_save(bigint, text, text, jsonb)',
    'public.trainer_template_delete(bigint)', 'public.trainer_template_share(bigint, bigint[])',
    'public.client_templates()', 'public.client_inbox()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
