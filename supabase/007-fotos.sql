-- 007 · Fase 6: fotos de progreso compartidas con el entrenador.
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 a 006.
--
-- · Las fotos siguen guardándose solo en el teléfono. El cliente decide, sesión a sesión,
--   cuáles comparte: solo esas se suben, y las puede dejar de compartir cuando quiera.
-- · Solo las ve su entrenador actual, mientras el vínculo siga en curso.
-- · Cuando el vínculo termina (se desvinculan o vence el plazo), las fotos compartidas se borran del servidor.

create table if not exists public.shared_photos (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.links on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  set_id text not null check (length(set_id) between 1 and 60),
  date date not null,
  pose text not null check (pose in ('frente', 'lado', 'espalda')),
  thumb text not null check (thumb like 'data:image/%' and length(thumb) < 150000),
  image text not null check (image like 'data:image/%' and length(image) < 1500000),
  created_at timestamptz not null default now(),
  unique (link_id, set_id, pose)
);
create index if not exists shared_photos_link on public.shared_photos (link_id, date);
alter table public.shared_photos enable row level security;
revoke all on public.shared_photos from anon, authenticated;

-- Al terminar un vínculo se borran sus fotos
create or replace function public._links_photos_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('active', 'blocked') then
    delete from public.shared_photos where link_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists links_photos_cleanup on public.links;
create trigger links_photos_cleanup after update of status on public.links
  for each row when (old.status is distinct from new.status) execute function public._links_photos_cleanup();

/* ---------- cliente ---------- */

-- Comparte una foto (una pose de una sesión) con su entrenador actual
create or replace function public.client_photo_share(p_set text, p_date date, p_pose text, p_thumb text, p_image text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links x
   where x.client_id = auth.uid() and x.status = 'active' and (x.unlink_at is null or x.unlink_at > now()) limit 1;
  if not found then raise exception 'no_link'; end if;
  insert into public.shared_photos (link_id, client_id, set_id, date, pose, thumb, image)
  values (l.id, auth.uid(), p_set, p_date, p_pose, p_thumb, p_image)
  on conflict (link_id, set_id, pose) do update set date = excluded.date, thumb = excluded.thumb, image = excluded.image;
end $$;

create or replace function public.client_photo_unshare(p_set text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shared_photos where client_id = auth.uid() and set_id = p_set;
end $$;

-- Sesiones que tengo compartidas ahora mismo
create or replace function public.client_photo_shared() returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct s.set_id from public.shared_photos s join public.links l on l.id = s.link_id
   where s.client_id = auth.uid() and l.status in ('active', 'blocked');
$$;

/* ---------- entrenador ---------- */

create or replace function public.trainer_photos(p_link bigint)
returns table (id bigint, set_id text, date date, pose text, thumb text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._my_client_link(p_link);
  return query select s.id, s.set_id, s.date, s.pose, s.thumb, s.created_at
                 from public.shared_photos s where s.link_id = p_link order by s.date desc, s.set_id, s.pose limit 300;
end $$;

create or replace function public.trainer_photo(p_link bigint, p_id bigint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare out text;
begin
  perform public._my_client_link(p_link);
  select s.image into out from public.shared_photos s where s.id = p_id and s.link_id = p_link;
  if out is null then raise exception 'not_found'; end if;
  return out;
end $$;

/* ---------- permisos ---------- */

do $$
declare f text;
begin
  execute 'revoke execute on function public._links_photos_cleanup() from public, anon, authenticated';
  foreach f in array array[
    'public.client_photo_share(text, date, text, text, text)', 'public.client_photo_unshare(text)',
    'public.client_photo_shared()', 'public.trainer_photos(bigint)', 'public.trainer_photo(bigint, bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
