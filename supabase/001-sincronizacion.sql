-- 001 · Tabla de sincronización (ya ejecutado en Supabase el 3/11/2026).
-- Cada fila es un dato de un usuario: un día, un entreno, un alimento, un peso…
create table if not exists public.kv (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value jsonb,
  v int not null default 1,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists kv_user_updated on public.kv (user_id, updated_at);
alter table public.kv enable row level security;
drop policy if exists "cada uno sus datos" on public.kv;
create policy "cada uno sus datos" on public.kv for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.kv to authenticated;
create or replace function public.kv_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists kv_touch on public.kv;
create trigger kv_touch before insert or update on public.kv
  for each row execute function public.kv_touch();
