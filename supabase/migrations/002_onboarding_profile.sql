-- Migration 002: match the onboarding flow's profile (frontend/app/src/lib/profile.ts).
-- Run once, after 001.
--
-- Adds whether the user finished onboarding and their intake so far, lets the app
-- save profiles with an upsert, and loosens the goal limits to sanity bounds (the
-- app's own rules, in lib/authConfig.ts, are stricter where they apply).

-- ---------------------------------------------------------------------------
-- Intake so far: a JSON object of the app's tracked nutrients, each a number from
-- 0 to 100000, e.g. {"calories": 720, "protein_g": 42}.
-- ---------------------------------------------------------------------------
create function public.is_valid_intake(intake jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(intake) = 'object' and not exists (
    select 1
    from jsonb_each(intake) as entry (nutrient, amount)
    where entry.nutrient not in ('calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg', 'sugar_g')
       or case
            when jsonb_typeof(entry.amount) = 'number'
              then entry.amount::numeric not between 0 and 100000
            else true
          end
  );
$$;

alter table public.profiles
  add column onboarded boolean not null default false,
  add column consumed jsonb not null default '{}'::jsonb
    check (public.is_valid_intake(consumed));

-- ---------------------------------------------------------------------------
-- Goals: allow decimals (the Personalize panel accepts them) and 0 (an emptied
-- field), with generous upper bounds.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_calorie_goal_check,
  drop constraint if exists profiles_protein_goal_g_check;

alter table public.profiles
  alter column calorie_goal type real,
  alter column protein_goal_g type real,
  add constraint profiles_calorie_goal_check check (calorie_goal between 0 and 10000),
  add constraint profiles_protein_goal_g_check check (protein_goal_g between 0 and 1000);

-- ---------------------------------------------------------------------------
-- The app saves profiles with an upsert, which needs an insert policy as well as
-- the update policy. Users can still only create their own row. (The sign-up
-- trigger from 001 normally creates it first.)
-- ---------------------------------------------------------------------------
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);
