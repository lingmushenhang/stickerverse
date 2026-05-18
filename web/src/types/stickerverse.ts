// ═══════════════════════════════════════════════════════════
//  STICKERVERSE — Shared TypeScript Type Definitions
//  Imperial Vault 1.0 · CTO: Claude · Emperor: IQ154
// ═══════════════════════════════════════════════════════════

// ── User / Auth ──────────────────────────────────────────

export type UserRank = 'civilian' | 'duke' | 'emperor';

export interface ImperialUser {
  id: string;
  email: string;
  rank: UserRank;
  strike_count: number;       // cumulative across all vault attempts
  vault_unlocked_at: string | null; // ISO8601, null if never unlocked
  demoted_at: string | null;        // ISO8601, null if never demoted
  created_at: string;
  updated_at: string;
}

// ── Vault / SingularityVault ─────────────────────────────

export type VaultPhase = 'gate' | 'solving' | 'unlocked' | 'demoted';
export type FeedbackState = 'idle' | 'checking' | 'correct' | 'wrong';

export interface VaultVerifyRequest {
  x: number;   // user's submitted answer
  t: number;   // client-side Date.now() — server re-computes A from this
}

export interface VaultVerifyResponse {
  correct: boolean;
  A: number;           // ⌊sin(t·π)·154⌋ as computed server-side
  need: number;        // ((-A % 130) + 130) % 130 — disclosed only on correct
  strikes_remaining: number;
}

export interface DemotionLog {
  id: string;
  user_id: string | null;     // null for anonymous
  session_id: string;         // client-generated UUID
  strikes: number;
  final_A: number;
  final_x: number;
  ip_hash: string | null;
  demoted_at: string;
}

// ── Relics ───────────────────────────────────────────────

export type RelicTier = 'r' | 'sr' | 'ssr' | 'sss' | 'myth';
export type ModalTarget = 'sv' | 'tw' | null;

export interface RelicMeta {
  id: string;          // e.g. "RELIC-001"
  icon: string;        // emoji
  tier: RelicTier;
  tierLabel: string;   // display string e.g. "◆ SSR — Core Hook"
  title: string;
  roast: string;
  modal: ModalTarget;
  live: boolean;
}

// ── Haptic / Audio / Visual UX Triggers ─────────────────

export type HapticPatternKey =
  | 'scratch_organic'
  | 'reveal_divine'
  | 'wrong_answer'
  | 'demotion_final';

export type AudioFreqKey =
  | 'Q2.8_Bandpass_Resonance'
  | 'Q1.5_Lowpass_Warm'
  | 'Q4.0_High_Shimmer';

export type VisualGlitchKey =
  | 'Abyssal_Blue_Pulse'
  | 'Gold_Flare'
  | 'Void_Crack';

export interface HapticParams {
  pattern: number[];
}

export interface AudioParams {
  filterType: BiquadFilterType;
  frequency: number;
  q: number;
  gainValue: number;
}

export interface VisualParams {
  cssClass: string;
  color: string;
  durationMs: number;
}

// ── EKG ─────────────────────────────────────────────────

export interface EkgChannel {
  yRatio: number;   // 0-1, vertical position
  speed: number;    // scroll speed multiplier
  color: string;    // CSS color
  alpha: number;    // 0-1 opacity
}

// ── Scratch / TacticalWipe ───────────────────────────────

export interface ScratchState {
  progress: number;      // 0-1
  completed: boolean;
  isScratching: boolean;
}

// ── Sacred Texts / Note.com ──────────────────────────────

export interface SacredText {
  slug: string;
  noteUrl: string;
  title: string;
  body: string;
  publishedAt: string;   // ISO8601
  price: number;         // JPY
  edition: 'FIRST' | 'SECOND';
}

// ── Supabase DB types (hand-rolled; replace with supabase gen types) ──

export interface Database {
  public: {
    Tables: {
      users: {
        Row: ImperialUser;
        Insert: Omit<ImperialUser, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ImperialUser, 'id' | 'created_at'>>;
      };
      demotion_logs: {
        Row: DemotionLog;
        Insert: Omit<DemotionLog, 'id'>;
        Update: never;
      };
    };
  };
}
