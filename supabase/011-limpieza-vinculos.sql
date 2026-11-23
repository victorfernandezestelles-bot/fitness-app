-- Fitness · 011 · Limpieza de vínculos terminados (23/11/2026)
-- Al terminar un vínculo entrenador-cliente se borran del servidor sus notas, sus propuestas de objetivos
-- y a qué plantillas tenía acceso ese cliente. Desde ese momento ya nadie podía leerlas.
-- (Las fotos compartidas ya se borraban así desde el 007. Las plantillas en sí son del entrenador y se quedan.)
-- Un vínculo terminado no vuelve a abrirse: si se vinculan otra vez, es un vínculo nuevo.
-- Se puede ejecutar dos veces sin perder nada. No redefine funciones de archivos anteriores.

create or replace function public._links_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('active', 'blocked') then
    delete from public.notes where link_id = new.id;
    delete from public.proposals where link_id = new.id;
    delete from public.template_shares where link_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public._links_purge() from public, anon, authenticated;

drop trigger if exists links_purge on public.links;
create trigger links_purge after update of status on public.links
  for each row when (old.status is distinct from new.status) execute function public._links_purge();

-- Lo que ya había de vínculos terminados antes de este archivo
delete from public.notes n using public.links l where l.id = n.link_id and l.status not in ('active', 'blocked');
delete from public.proposals p using public.links l where l.id = p.link_id and l.status not in ('active', 'blocked');
delete from public.template_shares t using public.links l where l.id = t.link_id and l.status not in ('active', 'blocked');
