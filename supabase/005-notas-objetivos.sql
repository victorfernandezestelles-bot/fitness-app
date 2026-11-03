-- 005 · Fase 4: notas del entrenador y propuestas de objetivos.
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 a 004.
--
-- · Notas: el entrenador las escribe en la ficha de cada cliente. Son privadas salvo que marque
--   «Visible para el cliente»; el cliente solo ve esas, y solo mientras el vínculo siga en curso.
-- · Propuestas: el entrenador propone objetivos (calorías, macros y pasos, y si quiere otros para los
--   días de entreno). El cliente la acepta o la rechaza; si la acepta, la app cambia sus objetivos.
--   Solo hay una propuesta pendiente por cliente: una nueva sustituye a la anterior.

create table if not exists public.notes (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.links on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_link on public.notes (link_id);
alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;

create table if not exists public.proposals (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.links on delete cascade,
  goals jsonb not null,
  goals_train jsonb,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  reply text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists proposals_one_pending on public.proposals (link_id) where status = 'pending';
alter table public.proposals enable row level security;
revoke all on public.proposals from anon, authenticated;

/* ---------- comprobaciones ---------- */

-- El vínculo de un cliente mío que sigue en curso (activo o pausado, sin pasar su fecha)
create or replace function public._my_client_link(p_link bigint) returns public.links
language plpgsql stable security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links x
   where x.id = p_link and x.trainer_id = auth.uid() and x.status in ('active', 'blocked')
     and (x.unlink_at is null or x.unlink_at > now());
  if not found then raise exception 'not_found'; end if;
  return l;
end $$;

-- Solo números razonables; lo vacío se guarda como null
create or replace function public._clean_goals(g jsonb, keys text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v numeric; out jsonb := '{}';
begin
  if g is null or jsonb_typeof(g) <> 'object' then return null; end if;
  foreach k in array keys loop
    v := null;
    if jsonb_typeof(g -> k) = 'number' then v := (g ->> k)::numeric; end if;
    if v is not null and (v < 0 or v > 100000) then raise exception 'bad_goals'; end if;
    out := out || jsonb_build_object(k, v);
  end loop;
  return out;
end $$;

/* ---------- entrenador ---------- */

create or replace function public.trainer_notes(p_link bigint)
returns table (id bigint, body text, visible boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._my_client_link(p_link);
  return query select n.id, n.body, n.visible, n.created_at, n.updated_at
                 from public.notes n where n.link_id = p_link order by n.created_at desc limit 300;
end $$;

-- Crea (p_id null) o cambia una nota; devuelve su id
create or replace function public.trainer_note_save(p_link bigint, p_id bigint, p_body text, p_visible boolean) returns bigint
language plpgsql security definer set search_path = '' as $$
declare out bigint; b text := left(trim(coalesce(p_body, '')), 4000);
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  perform public._my_client_link(p_link);
  if b = '' then raise exception 'empty'; end if;
  if p_id is null then
    insert into public.notes (link_id, body, visible) values (p_link, b, coalesce(p_visible, false)) returning id into out;
  else
    update public.notes set body = b, visible = coalesce(p_visible, false), updated_at = now()
     where id = p_id and link_id = p_link returning id into out;
    if out is null then raise exception 'not_found'; end if;
  end if;
  return out;
end $$;

create or replace function public.trainer_note_delete(p_link bigint, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_trainer() then raise exception 'forbidden'; end if;
  perform public._my_client_link(p_link);
  delete from public.notes where id = p_id and link_id = p_link;
end $$;

create or replace function public.trainer_proposals(p_link bigint)
returns table (id bigint, goals jsonb, goals_train jsonb, message text, status text, reply text,
               created_at timestamptz, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._my_client_link(p_link);
  return query select p.id, p.goals, p.goals_train, p.message, p.status, p.reply, p.created_at, p.resolved_at
                 from public.proposals p where p.link_id = p_link order by p.created_at desc limit 20;
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
  update public.proposals set status = 'cancelled', resolved_at = now() where link_id = p_link and status = 'pending';
  insert into public.proposals (link_id, goals, goals_train, message)
  values (p_link, g, gt, left(trim(coalesce(p_message, '')), 1000)) returning id into out;
  return out;
end $$;

create or replace function public.trainer_proposal_cancel(p_link bigint, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._my_client_link(p_link);
  update public.proposals set status = 'cancelled', resolved_at = now()
   where id = p_id and link_id = p_link and status = 'pending';
end $$;

/* ---------- cliente ---------- */

-- Lo que le ha dejado su entrenador: notas visibles y la propuesta pendiente
create or replace function public.client_inbox() returns json
language plpgsql stable security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links x
   where x.client_id = auth.uid() and x.status in ('active', 'blocked')
     and (x.unlink_at is null or x.unlink_at > now()) limit 1;
  if not found then return json_build_object('notes', '[]'::json, 'proposal', null); end if;
  return json_build_object(
    'notes', coalesce((select json_agg(json_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'updated_at', n.updated_at)
                                 order by n.created_at desc)
                         from (select * from public.notes n where n.link_id = l.id and n.visible order by n.created_at desc limit 100) n), '[]'::json),
    'proposal', (select json_build_object('id', p.id, 'goals', p.goals, 'goals_train', p.goals_train, 'message', p.message, 'created_at', p.created_at)
                   from public.proposals p where p.link_id = l.id and p.status = 'pending' limit 1));
end $$;

create or replace function public.client_proposal_respond(p_id bigint, p_accept boolean, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.proposals p
     set status = case when p_accept then 'accepted' else 'rejected' end,
         reply = left(trim(coalesce(p_reply, '')), 1000), resolved_at = now()
    from public.links l
   where p.id = p_id and p.status = 'pending' and l.id = p.link_id and l.client_id = auth.uid()
     and l.status = 'active' and (l.unlink_at is null or l.unlink_at > now());
  if not found then raise exception 'not_found'; end if;
end $$;

/* ---------- permisos ---------- */

do $$
declare f text;
begin
  foreach f in array array['public._my_client_link(bigint)', 'public._clean_goals(jsonb, text[])'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.trainer_notes(bigint)', 'public.trainer_note_save(bigint, bigint, text, boolean)',
    'public.trainer_note_delete(bigint, bigint)', 'public.trainer_proposals(bigint)',
    'public.trainer_propose(bigint, jsonb, jsonb, text)', 'public.trainer_proposal_cancel(bigint, bigint)',
    'public.client_inbox()', 'public.client_proposal_respond(bigint, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
