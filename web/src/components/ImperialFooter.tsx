// ═══════════════════════════════════════════════════════════
//  ImperialFooter — 4-line independently flickering status bar
//  Flicker engine preserved 1:1. Added: opaque background +
//  hairline (collision fix) and a true horizontal marquee
//  (truncation fix). Reduced-motion falls back to wrapped text.
// ═══════════════════════════════════════════════════════════
'use client';
import { useEffect, useRef } from 'react';

const FLICKER_SEQ = [0.04, 55, 0.88, 45, 0.06, 30, 0.72, 60, 0.04, 35, 1.00, 80] as const;

interface FooterLine { id: string; text: string; color: string; base: number; }

const LINES: FooterLine[] = [
  { id: 'fl1', color: '#ffd700',              base: 3100,
    text: 'IMPERIAL VAULT STATUS: NOMINAL · ALL RELICS ACCOUNTED FOR · ZERO DEFECTIONS' },
  { id: 'fl2', color: '#00e5cc',              base: 4650,
    text: 'SINGULARITY PROTOCOL: ARMED · DUKE ACCESS: RESTRICTED · EKG: SYNCHRONIZED' },
  { id: 'fl3', color: 'rgba(255,215,0,0.55)', base: 2380,
    text: 'MISERY INDEX: 154.0 · CONVERSION RATE: 99.7% · HAPTIC SYNC: ACTIVE · AUDIO: ARMED' },
  { id: 'fl4', color: 'rgba(0,229,204,0.38)', base: 5250,
    text: 'STICKERVERSE MUSEUM 1.0 · EMPEROR APPROVED · ∞ AD PERPETUAM REI MEMORIAM' },
];

function startFlicker(el: HTMLElement, base: number): () => void {
  let cancelled = false;
  let step = 0;
  function tick() {
    if (cancelled) return;
    if (step >= FLICKER_SEQ.length) {
      el.style.opacity = '';
      step = 0;
      const jitter = (Math.random() - 0.5) * base * 0.45;
      setTimeout(tick, base + jitter);
      return;
    }
    el.style.opacity = String(FLICKER_SEQ[step]);
    const delay = FLICKER_SEQ[step + 1] as number;
    step += 2;
    setTimeout(tick, delay);
  }
  setTimeout(tick, Math.random() * base);
  return () => { cancelled = true; };
}

export default function ImperialFooter() {
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    LINES.forEach(line => {
      const el = refs.current.get(line.id);
      if (el) cleanups.push(startFlicker(el, line.base));
    });
    return () => cleanups.forEach(fn => fn());
  }, []);

  return (
    <footer
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        padding: '14px 24px 16px',
        background: 'rgba(0,0,8,0.985)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderTop: '1px solid rgba(255,215,0,0.16)',
        display: 'flex', flexDirection: 'column', gap: '4px',
        pointerEvents: 'none',
      }}
    >
      {LINES.map(line => {
        const dur = Math.max(16, Math.round(line.base / 130));
        return (
          <div
            key={line.id}
            ref={el => { if (el) refs.current.set(line.id, el); }}
            className="imperial-footer-line"
            style={{
              fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase',
              overflow: 'hidden', whiteSpace: 'nowrap',
              color: line.color, fontFamily: '"Courier New", monospace',
            }}
          >
            <span className="imperial-footer-track" style={{ ['--dur' as string]: dur + 's' }}>
              <span className="imperial-footer-seg">{line.text}</span>
              <span className="imperial-footer-seg imperial-footer-dup" aria-hidden="true">{line.text}</span>
            </span>
          </div>
        );
      })}
    </footer>
  );
}
