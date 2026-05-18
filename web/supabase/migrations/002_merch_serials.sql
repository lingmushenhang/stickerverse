-- ═══════════════════════════════════════════════════════════
--  STICKERVERSE MUSEUM — Supabase DDL
--  Migration 002: Imperial Serial Codes
--
--  Purpose: Mercari capital-recovery gateway.
--  One-time redemption codes that promote civilians to Duke
--  or flag EMPEROR_STAFF tier for special access.
--
--  Run via: supabase db push
--        or: supabase migration up
-- ═══════════════════════════════════════════════════════════

-- ── Enum: serial tier ────────────────────────────────────
--  Distinct from user_rank — a code tier maps to a rank
--  promotion, but keeps its own identity in the audit trail.

create type serial_tier as enum ('DUKE', 'EMPEROR_STAFF');

-- ════════════════════════════════════════════════════════════
--  TABLE: imperial_serial_codes
--
--  Each row = one physical Mercari merch unit code.
--  code_hash: the raw serial (treated as a secret token,
--             production should store bcrypt hash instead).
--  redeemed_by: FK to users.id once claimed.
--  redeemed_at: NULL until claimed.
-- ════════════════════════════════════════════════════════════

create table if not exists public.imperial_serial_codes (
  id            uuid          primary key default extensions.uuid_generate_v4(),

  -- The plaintext code that the buyer enters.
  -- Index for O(1) lookup on activation.
  -- In production: store bcrypt hash, verify client-side.
  code_hash     text          not null unique,

  -- Which rank this code grants on redemption.
  tier          serial_tier   not null,

  -- NULL until someone successfully redeems it.
  redeemed_by   uuid          references public.users(id) on delete set null,
  redeemed_at   timestamptz,

  created_at    timestamptz   not null default now()
);

comment on table  public.imperial_serial_codes is
  'One-time redemption codes bundled with Mercari merch drops.';
comment on column public.imperial_serial_codes.code_hash is
  'Plaintext code (phase-1). Production: store bcrypt hash.';
comment on column public.imperial_serial_codes.tier is
  'DUKE = civilian→duke promotion. EMPEROR_STAFF = reserved access.';
comment on column public.imperial_serial_codes.redeemed_by is
  'FK to users.id. NULL = not yet redeemed.';

-- ── Indexes ──────────────────────────────────────────────

create index if not exists idx_serial_code_hash
  on public.imperial_serial_codes(code_hash);

create index if not exists idx_serial_redeemed_by
  on public.imperial_serial_codes(redeemed_by)
  where redeemed_by is not null;

-- ── Row Level Security ───────────────────────────────────
--  Users MUST NOT be able to browse the code pool.
--  All reads/writes go through service-role API only.

alter table public.imperial_serial_codes enable row level security;

-- No public SELECT policy → only service role (API route) can touch this table.

-- ════════════════════════════════════════════════════════════
--  FUNCTION: redeem_serial_code
--
--  Atomic redemption in a single RPC call:
--    1. Lock the row (FOR UPDATE SKIP LOCKED prevents races).
--    2. Reject if already redeemed.
--    3. Mark redeemed.
--    4. Promote user rank based on tier.
--  Returns: jsonb { success, tier, message }
-- ════════════════════════════════════════════════════════════

create or replace function public.redeem_serial_code(
  p_code        text,
  p_user_id     uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row   public.imperial_serial_codes%rowtype;
  v_tier  serial_tier;
begin
  -- ── Fetch and lock the code row ──
  select * into v_row
  from public.imperial_serial_codes
  where code_hash = p_code
  for update skip locked;

  -- Code not found (or locked by concurrent request)
  if not found then
    return jsonb_build_object(
      'success', false,
      'tier',    null,
      'message', 'INVALID_CODE'
    );
  end if;

  -- Already redeemed
  if v_row.redeemed_by is not null then
    return jsonb_build_object(
      'success', false,
      'tier',    v_row.tier::text,
      'message', 'ALREADY_REDEEMED'
    );
  end if;

  -- ── Mark redeemed ──
  update public.imperial_serial_codes
  set
    redeemed_by = p_user_id,
    redeemed_at = now()
  where id = v_row.id;

  -- ── Promote user ──
  v_tier := v_row.tier;

  if v_tier = 'DUKE' then
    update public.users
    set
      rank              = 'duke',
      vault_unlocked_at = now(),
      updated_at        = now()
    where id = p_user_id
      and rank = 'civilian';

  elsif v_tier = 'EMPEROR_STAFF' then
    -- EMPEROR_STAFF grants emperor rank
    update public.users
    set
      rank              = 'emperor',
      vault_unlocked_at = now(),
      updated_at        = now()
    where id = p_user_id
      and rank in ('civilian', 'duke');
  end if;

  return jsonb_build_object(
    'success', true,
    'tier',    v_tier::text,
    'message', 'REDEEMED'
  );
end;
$$;

comment on function public.redeem_serial_code(text, uuid) is
  'Atomic serial code redemption. Locks row, marks used, promotes user rank.';

-- ════════════════════════════════════════════════════════════
--  SEED: Initial Mercari drop — First Wave
--  メルカリ資本回収出張所 開門記念 第一陣
-- ════════════════════════════════════════════════════════════

insert into public.imperial_serial_codes (code_hash, tier) values
  ('KITTY_FLARE_7777',  'DUKE'),
  ('CHIIKAWA_VOID_666', 'DUKE'),
  ('PURIN_MOD_130',     'EMPEROR_STAFF')
on conflict (code_hash) do nothing;
