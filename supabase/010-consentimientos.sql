-- Fitness · 010 · Consentimientos (18/11/2026)
-- Guarda cuándo da cada usuario su consentimiento explícito para tratar sus datos de salud (art. 9.2.a RGPD),
-- y en qué versión del texto. Cada consentimiento es una fila que no se cambia: sirve de prueba.
-- El servidor también lo exige: sin consentimiento no se puede guardar ni cambiar nada en kv ni compartir fotos.
-- Se puede ejecutar dos veces sin perder nada.
-- Redefine las reglas de escritura de kv (de 002) y public.client_photo_share (de 009):
-- si se vuelve a ejecutar el 009, hay que ejecutar después este.

create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('health', 'terms')),
  version int not null check (version between 1 and 1000),
  given_at timestamptz not null default now()
);
-- Una sola fila por usuario, tipo y versión (pulsar dos veces no duplica)
create unique index if not exists consents_once on public.consents (user_id, kind, version);

alter table public.consents enable row level security;
-- Nadie lee ni escribe la tabla directamente: solo con las dos funciones de abajo
revoke all on public.consents from anon, authenticated;

-- Dar un consentimiento. Vale para cualquier cuenta con sesión, también pendiente o bloqueada:
-- consentir es un derecho de la persona, no una acción de la app.
create or replace function public.give_consent(p_kind text, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind not in ('health', 'terms') or p_version is null or p_version < 1 or p_version > 1000 then
    raise exception 'bad_consent' using errcode = 'P0001';
  end if;
  insert into public.consents (user_id, kind, version) values (me, p_kind, p_version)
    on conflict (user_id, kind, version) do nothing;
end $$;

-- Los consentimientos de quien llama, del más antiguo al más reciente
create or replace function public.my_consents() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object('kind', c.kind, 'version', c.version, 'given_at', c.given_at) order by c.given_at, c.id), '[]'::json)
    from public.consents c where c.user_id = auth.uid();
$$;

-- ¿Ha dado quien llama su consentimiento para los datos de salud? (cualquier versión: la app pide la vigente)
create or replace function public.has_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents c where c.user_id = auth.uid() and c.kind = 'health');
$$;

/* ---------- el servidor exige el consentimiento para guardar datos ---------- */

drop policy if exists "crear sus datos" on public.kv;
drop policy if exists "cambiar sus datos" on public.kv;
drop policy if exists "borrar sus datos" on public.kv;
create policy "crear sus datos" on public.kv for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_active() and public.has_consent());
create policy "cambiar sus datos" on public.kv for update to authenticated
  using ((select auth.uid()) = user_id and public.is_active() and public.has_consent())
  with check ((select auth.uid()) = user_id and public.is_active() and public.has_consent());
create policy "borrar sus datos" on public.kv for delete to authenticated
  using ((select auth.uid()) = user_id and public.is_active() and public.has_consent());

-- Igual que en 009, más el consentimiento
create or replace function public.client_photo_share(p_set text, p_date date, p_pose text, p_thumb text, p_image text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.links;
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  if not public.has_consent() then raise exception 'no_consent' using errcode = 'P0001'; end if;
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

revoke execute on function public.give_consent(text, int) from public, anon;
revoke execute on function public.my_consents() from public, anon;
grant execute on function public.give_consent(text, int) to authenticated;
grant execute on function public.my_consents() to authenticated;
revoke execute on function public.has_consent() from public, anon;
grant execute on function public.has_consent() to authenticated;
revoke execute on function public.client_photo_share(text, date, text, text, text) from public, anon;
grant execute on function public.client_photo_share(text, date, text, text, text) to authenticated;
