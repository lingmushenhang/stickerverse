// ═══════════════════════════════════════════════════════════
//  useEkg — PQRST EKG Canvas animation hook
//  Drives any <canvas> element with configurable channels.
// ═══════════════════════════════════════════════════════════
'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { EkgChannel } from '@/types/stickerverse';

// ── PQRST beat buffer synthesis ──────────────────────────

function buildBeat(len: number): Float32Array {
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    buf[i] += 0.13  * Math.exp(-((t - 0.10) / 0.033) ** 2); // P
    buf[i] -= 0.09  * Math.exp(-((t - 0.19) / 0.017) ** 2); // Q
    buf[i] += 1.00  * Math.exp(-((t - 0.23) / 0.015) ** 2); // R
    buf[i] -= 0.32  * Math.exp(-((t - 0.28) / 0.016) ** 2); // S
    buf[i] += 0.24  * Math.exp(-((t - 0.42) / 0.058) ** 2); // T
  }
  return buf;
}

const BEAT_LEN = 200;
const REPEATS  = 40;
const BEAT     = buildBeat(BEAT_LEN);
const TOTAL    = BEAT_LEN * REPEATS;

// Expand into full loop buffer
const EKG_DATA = new Float32Array(TOTAL);
for (let r = 0; r < REPEATS; r++) {
  for (let i = 0; i < BEAT_LEN; i++) {
    EKG_DATA[r * BEAT_LEN + i] = BEAT[i];
  }
}

// ── Default 3-channel config (matches museum_portal.html) ──

export const DEFAULT_CHANNELS: EkgChannel[] = [
  { yRatio: 0.20, speed: 1.40, color: '#00e5cc', alpha: 0.72 },
  { yRatio: 0.50, speed: 2.05, color: '#ffd700', alpha: 0.90 },
  { yRatio: 0.80, speed: 0.82, color: '#00e5cc', alpha: 0.55 },
];

/** Single-channel mini EKG for modal headers. */
export const MINI_CHANNEL: EkgChannel[] = [
  { yRatio: 0.50, speed: 1.80, color: '#00e5cc', alpha: 0.85 },
];

// ── Hook ─────────────────────────────────────────────────

interface UseEkgOptions {
  channels?: EkgChannel[];
  /** Whether to draw the gold horizontal scanline (full-screen only). */
  scanline?: boolean;
  amplitudeRatio?: number; // default 0.062 × canvas height
}

export function useEkg(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseEkgOptions = {}
) {
  const {
    channels       = DEFAULT_CHANNELS,
    scanline       = false,
    amplitudeRatio = 0.062,
  } = options;

  const rafRef     = useRef<number | null>(null);
  const offsetsRef = useRef<number[]>(
    channels.map((_, i) => Math.floor(TOTAL * (i / channels.length)))
  );
  const scanYRef   = useRef(0);
  const lastTsRef  = useRef(0);
  const runningRef = useRef(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTsRef.current  = 0;

    function frame(ts: number) {
      if (!runningRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(frame); return; }

      const ctx = canvas.getContext('2d');
      if (!ctx)  { rafRef.current = requestAnimationFrame(frame); return; }

      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(ts - lastTsRef.current, 50);
      lastTsRef.current = ts;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      channels.forEach((ch, ci) => {
        const cy  = H * ch.yRatio;
        const amp = H * amplitudeRatio;

        ctx.beginPath();
        ctx.strokeStyle = ch.color;
        ctx.lineWidth   = 1.1;
        ctx.globalAlpha = ch.alpha;

        for (let x = 0; x <= W; x++) {
          const idx = Math.floor(offsetsRef.current[ci] + x * 0.75) % TOTAL;
          const y   = cy - EKG_DATA[idx] * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        offsetsRef.current[ci] =
          (offsetsRef.current[ci] + ch.speed * dt * 0.058) % TOTAL;
      });

      // Gold scanline
      if (scanline) {
        ctx.globalAlpha = 0.22;
        const sg = ctx.createLinearGradient(0, scanYRef.current - 2, 0, scanYRef.current + 2);
        sg.addColorStop(0,   'transparent');
        sg.addColorStop(0.5, '#ffd700');
        sg.addColorStop(1,   'transparent');
        ctx.fillStyle = sg;
        ctx.fillRect(0, scanYRef.current - 2, W, 4);
        scanYRef.current = (scanYRef.current + dt * 0.10) % H;
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [channels, scanline, amplitudeRatio, canvasRef]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { start, stop };
}
