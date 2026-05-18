// ═══════════════════════════════════════════════════════════
//  STICKERVERSE — Causality Math Engine
//  Shared between Edge API route and client-side preview.
//  CRITICAL: The canonical verification runs server-side only.
//  Do NOT expose `verifySolution` to the client bundle directly.
// ═══════════════════════════════════════════════════════════

/**
 * Compute A = ⌊sin(t·π)·154⌋ from a Unix timestamp in ms.
 * t cycles approximately every ~5 minutes at natural speed.
 *
 * @param timestampMs - Date.now() value
 */
export function computeA(timestampMs: number): number {
  const t = timestampMs / 100_000;
  return Math.floor(Math.sin(t * Math.PI) * 154);
}

/**
 * Compute the required x mod 130 residue that satisfies
 * A + (x mod 130) ≡ 0 (mod 130)
 *
 * Always returns a value in [0, 129].
 */
export function computeNeed(A: number): number {
  return (((-A) % 130) + 130) % 130;
}

/**
 * Verify whether an integer x satisfies the causality equation
 * for a given A value.
 *
 * Handles negative x correctly via double-modulo.
 */
export function verifySolution(x: number, A: number): boolean {
  if (!Number.isInteger(x)) return false;
  const need = computeNeed(A);
  return ((x % 130) + 130) % 130 === need;
}

/**
 * Returns how many milliseconds until A next changes value.
 * Useful for caching / countdown display.
 * A changes when sin(t·π) crosses a new integer boundary.
 * Approximation: mean dwell time ≈ 100_000 / (π·154) ≈ 207ms — very frequent.
 * In practice, treat A as refreshing every ~3 seconds in the UI.
 */
export function msUntilAChange(timestampMs: number): number {
  const t      = timestampMs / 100_000;
  const A      = computeA(timestampMs);
  const target = (A + 0.5) / 154; // midpoint of next integer band
  const tNext  = Math.asin(Math.min(1, Math.max(-1, target))) / Math.PI;
  const msNext = tNext * 100_000;
  return Math.max(0, msNext - timestampMs % 100_000);
}

/**
 * Generate a stable session ID for demotion logs.
 * crypto.randomUUID() — available in Edge Runtime and modern browsers.
 */
export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Constants ────────────────────────────────────────────────

export const VAULT_CONSTANTS = {
  MAX_STRIKES:    3,
  MODULUS:        130,
  AMPLITUDE:      154,
  T_DIVISOR:      100_000,
  A_REFRESH_MS:   3_000,
} as const;
