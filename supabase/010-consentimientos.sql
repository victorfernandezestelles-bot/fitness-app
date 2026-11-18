-- Fitness · 010 · Consentimientos (18/11/2026)
-- Guarda cuándo da cada usuario su consentimiento explícito para tratar sus datos de salud (art. 9.2.a RGPD),
-- y en qué versión del texto. Cada consentimiento es una fila que no se cambia: sirve de prueba.
-- Se puede ejecutar dos veces sin perder nada. No redefine funciones de archivos anteriores.

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

revoke execute on function public.give_consent(text, int) from public, anon;
revoke execute on function public.my_consents() from public, anon;
grant execute on function public.give_consent(text, int) to authenticated;
grant execute on function public.my_consents() to authenticated;
