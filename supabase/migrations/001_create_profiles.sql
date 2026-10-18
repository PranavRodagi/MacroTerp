-- Migration 001: accounts. Run each migration in this folder once, in order, in the
-- Supabase dashboard (SQL Editor -> New query -> paste -> Run).
--
-- Supabase Auth (the built-in auth.users table) stores emails and bcrypt-hashed
-- passwords. This file adds one row per user in public.profiles holding their
-- username and meal preferences, and locks each row so only its owner can
-- read or change it.

-- ---------------------------------------------------------------------------
-- Profiles: username + preferences. The CHECK constraints are the final word on
-- what's valid; the frontend and test CLI validate the same rules for friendlier
-- messages, but anything that slips past them is rejected here.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  dietary_restrictions text[] not null default '{}'
    check (dietary_restrictions <@ array[
      'vegetarian', 'vegan', 'lactose_intolerant',
      'gluten_free', 'halal_friendly', 'nut_allergy'
    ]::text[]),
  calorie_goal integer
    check (calorie_goal between 1000 and 6000),
  protein_goal_g integer
    check (protein_goal_g between 0 and 400),
  updated_at timestamptz not null default now()
);

-- Usernames are unique regardless of case ("Mahir" and "mahir" can't both exist).
create unique index profiles_username_unique on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Row Level Security: the browser holds a public API key, so these policies are
-- what keep users out of each other's data. Users may read and update only their
-- own row. There is no insert or delete policy: rows are created by the trigger
-- below and deleted along with the account.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Create the profile in the same transaction as the account. Sign-up passes the
-- username as user metadata; if it's missing, invalid, or taken, the insert
-- fails and so does the sign-up, so no account exists without a profile.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current on every change.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lets the sign-up form check a username before creating the account, so a
-- taken username gets a clear message. Reveals only true/false, never any data.
-- ---------------------------------------------------------------------------
create function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(candidate)
  );
$$;

revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
