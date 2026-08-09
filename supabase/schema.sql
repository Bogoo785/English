create table if not exists public.player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_progress enable row level security;

drop policy if exists "Players can read their own progress" on public.player_progress;
create policy "Players can read their own progress"
on public.player_progress for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players can create their own progress" on public.player_progress;
create policy "Players can create their own progress"
on public.player_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own progress" on public.player_progress;
create policy "Players can update their own progress"
on public.player_progress for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.player_progress to authenticated;
