-- 008 · Fase 7: base de alimentos compartida entre los usuarios de la app.
-- Se puede ejecutar más de una vez sin romper nada. Necesita haber ejecutado antes 001 y 002.
--
-- · Cuando alguien escanea un código que Open Food Facts no tiene y copia los valores de la etiqueta,
--   puede compartirlo: la próxima persona que escanee ese código lo encontrará ya hecho.
-- · Solo se guardan productos que Open Food Facts no conoce, con datos escritos por los usuarios
--   (nada copiado de Open Food Facts, cuya base tiene su propia licencia, la ODbL).
-- · Se guarda quién lo aportó para poder moderar, pero nunca se enseña a los demás.
-- · Cualquiera puede avisar de un error; el desarrollador puede ocultar o borrar productos.

create table if not exists public.shared_foods (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  name text not null check (length(name) between 1 and 120),
  brand text not null default '' check (length(brand) <= 80),
  per100 jsonb not null,
  serving_g numeric check (serving_g is null or (serving_g > 0 and serving_g < 5000)),
  unit_name text check (unit_name is null or length(unit_name) <= 30),
  unit_g numeric check (unit_g is null or (unit_g > 0 and unit_g < 5000)),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden boolean not null default false
);
alter table public.shared_foods enable row level security;
revoke all on public.shared_foods from anon, authenticated;

create table if not exists public.shared_food_reports (
  id bigint generated always as identity primary key,
  barcode text not null references public.shared_foods on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (barcode, user_id)
);
alter table public.shared_food_reports enable row level security;
revoke all on public.shared_food_reports from anon, authenticated;

-- Valores por 100 g: solo números razonables; tiene que haber energía
create or replace function public._clean_per100(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare e record; out jsonb := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad_food'; end if;
  for e in select * from jsonb_each(p) loop
    if e.key !~ '^[a-zA-Z0-9]{1,12}$' then continue; end if;
    if jsonb_typeof(e.value) = 'number' then
      if (e.value::text)::numeric < 0 or (e.value::text)::numeric > 100000 then raise exception 'bad_food'; end if;
      out := out || jsonb_build_object(e.key, e.value);
    end if;
  end loop;
  if coalesce(jsonb_typeof(out -> 'kcal'), '') <> 'number' or (out ->> 'kcal')::numeric > 1000 then raise exception 'bad_food'; end if;
  return out;
end $$;

/* ---------- usuarios ---------- */

create or replace function public.shared_food_get(p_code text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare f public.shared_foods;
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  select * into f from public.shared_foods where barcode = p_code and not hidden;
  if not found then return null; end if;
  return json_build_object('barcode', f.barcode, 'name', f.name, 'brand', f.brand, 'per100', f.per100,
                           'serving_g', f.serving_g, 'unit_name', f.unit_name, 'unit_g', f.unit_g,
                           'updated_at', f.updated_at, 'mine', f.created_by = auth.uid());
end $$;

-- Devuelve 'created', 'updated' (era suyo) o 'exists' (ya lo había aportado otra persona: no se toca)
create or replace function public.shared_food_put(p_code text, p_name text, p_brand text, p_per100 jsonb,
                                                  p_serving_g numeric, p_unit_name text, p_unit_g numeric) returns text
language plpgsql security definer set search_path = '' as $$
declare cur public.shared_foods; existed boolean; clean jsonb := public._clean_per100(p_per100);
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  select * into cur from public.shared_foods where barcode = p_code for update;
  existed := found;
  if existed and cur.created_by is distinct from auth.uid() then return 'exists'; end if;
  insert into public.shared_foods (barcode, name, brand, per100, serving_g, unit_name, unit_g, created_by)
  values (p_code, left(trim(coalesce(p_name, '')), 120), left(trim(coalesce(p_brand, '')), 80), clean,
          p_serving_g, nullif(left(trim(coalesce(p_unit_name, '')), 30), ''), p_unit_g, auth.uid())
  on conflict (barcode) do update
     set name = excluded.name, brand = excluded.brand, per100 = excluded.per100, serving_g = excluded.serving_g,
         unit_name = excluded.unit_name, unit_g = excluded.unit_g, updated_at = now();
  return case when existed then 'updated' else 'created' end;
end $$;

create or replace function public.shared_food_report(p_code text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.shared_foods where barcode = p_code) then raise exception 'not_found'; end if;
  insert into public.shared_food_reports (barcode, user_id, reason) values (p_code, auth.uid(), left(trim(coalesce(p_reason, '')), 500))
  on conflict (barcode, user_id) do update set reason = excluded.reason, created_at = now();
end $$;

/* ---------- desarrollador ---------- */

create or replace function public.admin_shared_foods()
returns table (barcode text, name text, brand text, kcal numeric, per100 jsonb, author text, created_at timestamptz,
               updated_at timestamptz, hidden boolean, reports bigint, reasons text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  return query
    select f.barcode, f.name, f.brand, (f.per100 ->> 'kcal')::numeric, f.per100,
           coalesce(nullif(p.name, ''), p.email), f.created_at, f.updated_at, f.hidden,
           (select count(*) from public.shared_food_reports r where r.barcode = f.barcode),
           (select string_agg(nullif(r.reason, ''), ' · ' order by r.created_at desc) from public.shared_food_reports r where r.barcode = f.barcode)
      from public.shared_foods f left join public.profiles p on p.id = f.created_by
     order by (select count(*) from public.shared_food_reports r where r.barcode = f.barcode) desc, f.updated_at desc
     limit 500;
end $$;

create or replace function public.admin_shared_food_hide(p_code text, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  update public.shared_foods set hidden = p_hidden where barcode = p_code;
  if p_hidden is false then delete from public.shared_food_reports where barcode = p_code; end if;
end $$;

create or replace function public.admin_shared_food_delete(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'forbidden'; end if;
  delete from public.shared_foods where barcode = p_code;
end $$;

/* ---------- permisos ---------- */

do $$
declare f text;
begin
  execute 'revoke execute on function public._clean_per100(jsonb) from public, anon, authenticated';
  foreach f in array array[
    'public.shared_food_get(text)', 'public.shared_food_put(text, text, text, jsonb, numeric, text, numeric)',
    'public.shared_food_report(text, text)', 'public.admin_shared_foods()',
    'public.admin_shared_food_hide(text, boolean)', 'public.admin_shared_food_delete(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
