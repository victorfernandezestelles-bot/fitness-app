-- 004 · Fase 3: el entrenador ve los datos de sus clientes (solo lectura).
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001, 002 y 003.
--
-- Solo lo que el cliente aceptó al vincularse: diario de comidas (con pasos y sueño), entrenamientos,
-- actividades, peso, medidas y objetivos. Nunca su biblioteca de alimentos, sus recetas ni sus fotos
-- (las fotos ni siquiera están en el servidor). De los ajustes solo salen los objetivos y el perfil.
-- El vínculo tiene que estar en curso (activo o pausado) y no haber pasado su fecha de desvinculación.

create or replace function public.trainer_client_rows(p_link bigint)
returns table (key text, value jsonb, v int, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare l public.links;
begin
  select * into l from public.links x
   where x.id = p_link and x.trainer_id = auth.uid() and x.status in ('active', 'blocked')
     and (x.unlink_at is null or x.unlink_at > now());
  if not found then raise exception 'not_found'; end if;
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

revoke execute on function public.trainer_client_rows(bigint) from public, anon;
grant execute on function public.trainer_client_rows(bigint) to authenticated;
