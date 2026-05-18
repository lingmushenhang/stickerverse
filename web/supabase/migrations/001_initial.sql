-- ═══════════════════════════════════════════════════════════
--  STICKERVERSE MUSEUM — Supabase DDL
--  Migration 001: Initial schema
--
--  Run via: supabase db push
--        or: supabase migration up
-- ═══════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Enum: user rank ──────────────────────────────────────────
create type user_rank as enum ('civilian', 'duke', 'emperor');

-- ════════════════════════════════════════════════════════════
--  TABLE: users
--  Stores Imperial rank, strike count, and promotion history.
-- ════════════════════════════════════════════════════════════

create table if not exists public.users (
  -- Primary key mirrors Supabase Auth user UUID
  id                  uuid        primary key references auth.users(id) on delete cascade,

  email               text        not null,

  -- Imperial hierarchy
  rank                user_rank   not null default 'civilian',

  -- Cumulative wrong answers across all vault sessions
  strike_count        int         not null default 0
                                  check (strike_count >= 0),

  -- Timestamps for rank transitions
  vault_unlocked_at   timestamptz,
  demoted_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.users is 'Imperial user registry — rank and vault progression.';
comment on column public.users.rank is 'civilian | duke | emperor';
comment on column public.users.strike_count is 'Total wrong causality-puzzle answers. 3 = demotion.';

-- ── Auto-update updated_at ───────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────

create index if not exists idx_users_rank         on public.users(rank);
create index if not exists idx_users_demoted_at   on public.users(demoted_at) where demoted_at is not null;
create index if not exists idx_users_unlocked_at  on public.users(vault_unlocked_at) where vault_unlocked_at is not null;

-- ── Row Level Security ───────────────────────────────────────

alter table public.users enable row level security;

-- Users can read their own record
create policy "users: select own"
  on public.users for select
  using (auth.uid() = id);

-- Users can update only allowed columns (not rank — server-side only)
create policy "users: update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Service role has full access (used by API route via getSupabaseAdmin())
-- No explicit policy needed — service role bypasses RLS.

-- ════════════════════════════════════════════════════════════
--  TABLE: demotion_logs
--  Append-only audit trail of every 3-strike failure event.
-- ════════════════════════════════════════════════════════════

create table if not exists public.demotion_logs (
  id            uuid        primary key default extensions.uuid_generate_v4(),

  -- Nullable: anonymous sessions have no user_id
  user_id       uuid        references public.users(id) on delete set null,

  -- Client-generated UUID per browser session
  session_id    text        not null,

  -- Strike count at time of demotion (always = MAX_STRIKES = 3)
  strikes       int         not null check (strikes > 0 and strikes <= 10),

  -- Causality values at time of final wrong answer
  final_A       int         not null,
  final_x       bigint      not null,

  -- SHA-256(ip + salt) — no raw IP stored
  ip_hash       text,

  demoted_at    timestamptz not null default now()
);

comment on table  public.demotion_logs is 'Append-only audit log of every 3-strike vault demotion.';
comment on column public.demotion_logs.session_id is 'Client UUID generated per browser session via crypto.randomUUID().';
comment on column public.demotion_logs.ip_hash is 'SHA-256(ip + salt). No raw IP is stored.';
comment on column public.demotion_logs.final_A is 'A = floor(sin(t·π)·154) at the moment of the final wrong answer.';
comment on column public.demotion_logs.final_x is 'User-submitted x value on the final wrong attempt.';

-- ── Indexes ──────────────────────────────────────────────────

create index if not exists idx_demotion_logs_user_id    on public.demotion_logs(user_id) where user_id is not null;
create index if not exists idx_demotion_logs_session_id on public.demotion_logs(session_id);
create index if not exists idx_demotion_logs_demoted_at on public.demotion_logs(demoted_at desc);
create index if not exists idx_demotion_logs_ip_hash    on public.demotion_logs(ip_hash) where ip_hash is not null;

-- ── RLS ──────────────────────────────────────────────────────

alter table public.demotion_logs enable row level security;

-- Users can read their own demotion logs
create policy "demotion_logs: select own"
  on public.demotion_logs for select
  using (auth.uid() = user_id);

-- Insert is restricted to service role (API route)
-- No insert policy → only service role can insert via getSupabaseAdmin()

-- ════════════════════════════════════════════════════════════
--  VIEW: imperial_leaderboard
--  Public view of Duke/Emperor counts for vanity display.
-- ════════════════════════════════════════════════════════════

create or replace view public.imperial_leaderboard as
  select
    rank,
    count(*) as user_count,
    min(vault_unlocked_at) as first_unlock
  from public.users
  where rank in ('duke', 'emperor')
  group by rank
  order by rank;

comment on view public.imperial_leaderboard is 'Public aggregate — Duke/Emperor counts only. No PII.';

-- ════════════════════════════════════════════════════════════
--  FUNCTION: handle_new_auth_user
--  Auto-creates a public.users row when a new Auth user signs up.
-- ════════════════════════════════════════════════════════════

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, rank)
  values (
    new.id,
    new.email,
    'civilian'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ════════════════════════════════════════════════════════════
--  FUNCTION: promote_to_duke (callable via Supabase RPC)
--  Server-side rank promotion — cannot be called client-side
--  due to RLS (service role only).
-- ════════════════════════════════════════════════════════════

create or replace function public.promote_to_duke(target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.users
  set
    rank              = 'duke',
    vault_unlocked_at = now(),
    updated_at        = now()
  where id = target_user_id
    and rank = 'civilian';

  if not found then
    raise exception 'User % not found or already Duke/Emperor.', target_user_id;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════
--  SEED DATA (dev only — comment out for production)
-- ════════════════════════════════════════════════════════════

-- insert into public.users (id, email, rank)
-- values
--   ('00000000-0000-0000-0000-000000000001', 'emperor@stickerverse.empire', 'emperor'),
--   ('00000000-0000-0000-0000-000000000002', 'duke@stickerverse.empire',    'duke')
-- on conflict do nothing;
