-- One row per user holding the whole game state (replaces v1's claude.use("db") doc).
create table if not exists public.game_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.game_state enable row level security;

create policy "own row: select" on public.game_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.game_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.game_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row: delete" on public.game_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Live sync between devices.
alter publication supabase_realtime add table public.game_state;
