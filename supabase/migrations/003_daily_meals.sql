-- Migration 003: save each user's generated meals for the day (frontend/app/src/lib/mealCache.ts).
-- Run once, after 002.
--
-- Generating meals takes a few seconds (and longer while the API wakes up), so the app
-- keeps the result here and reuses it for the rest of the day. One row per user, day
-- and meal period. `request_key` is the exact request the meals were generated for
-- (period, restrictions, goals, intake); when it changes, the app generates new meals
-- and overwrites the row.

create table public.daily_meals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  period text not null check (period in ('Breakfast', 'Lunch', 'Dinner')),
  request_key text not null check (length(request_key) <= 4000),
  meals jsonb not null check (jsonb_typeof(meals) = 'object' and pg_column_size(meals) <= 500000),
  created_at timestamptz not null default now(),
  primary key (user_id, day, period)
);

alter table public.daily_meals enable row level security;

create policy "Users can read their own meals"
  on public.daily_meals for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save their own meals"
  on public.daily_meals for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can replace their own meals"
  on public.daily_meals for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own meals"
  on public.daily_meals for delete
  to authenticated
  using ((select auth.uid()) = user_id);
