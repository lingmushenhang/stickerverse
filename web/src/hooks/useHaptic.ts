// ═══════════════════════════════════════════════════════════
//  useHaptic — Organic vibration patterns
//  Shuffles sub-patterns every 120ms for non-mechanical feel.
// ═══════════════════════════════════════════════════════════
import { useCallback, useRef } from 'react';
import type { HapticPatternKey } from '@/types/stickerverse';

const PATTERNS: Record<HapticPatternKey, number[]> = {
  scratch_organic: [8, 14, 6, 18, 10, 12, 8, 16],
  reveal_divine:   [0, 50, 80, 30, 20, 10, 10, 10, 5, 5, 5],
  wrong_answer:    [40, 20, 40, 20, 80],
  demotion_final:  [100, 50, 100, 50, 200, 100, 300],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function useHaptic() {
  const scratchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fire a one-shot haptic pattern. */
  const fire = useCallback((key: HapticPatternKey) => {
    if (!isSupported()) return;
    navigator.vibrate(PATTERNS[key]);
  }, []);

  /** Start continuous organic scratch vibration (shuffled every 120ms). */
  const startScratch = useCallback(() => {
    if (!isSupported() || scratchTimerRef.current) return;
    const tick = () => {
      navigator.vibrate(shuffle(PATTERNS.scratch_organic));
    };
    tick();
    scratchTimerRef.current = setInterval(tick, 120);
  }, []);

  /** Stop continuous scratch vibration. */
  const stopScratch = useCallback(() => {
    if (scratchTimerRef.current) {
      clearInterval(scratchTimerRef.current);
      scratchTimerRef.current = null;
    }
    if (isSupported()) navigator.vibrate(0);
  }, []);

  return { fire, startScratch, stopScratch };
}
