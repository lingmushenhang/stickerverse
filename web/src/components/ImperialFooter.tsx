// ═══════════════════════════════════════════════════════════
//  ImperialFooter — 4-line independently flickering status bar
//  Recursive setTimeout with jitter. Opacity sequence matches
//  the original museum_portal.html design spec exactly.
// ═══════════════════════════════════════════════════════════
'use client';
import { useEffect, useRef } from 'react';

// opacity sequence: [opacity, durationMs, opacity, durationMs, ...]
const FLICKER_SEQ = [0.04, 55, 0.88, 45, 0.06, 30, 0.72, 60, 0.04, 35, 1.00, 80] as const;

interface FooterLine {
  id:    string;
  text:  string;
  color: string;
  base:  number; // ms between flicker bursts
}

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

  // Stagger initial start
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
        position:   'fixed',
        bottom:     0,
        left:       0,
        right:      0,
        zIndex:     50,
        padding:    '16px 32px 18px',
        background: 'linear-gradient(to top, rgba(0,0,8,0.97) 0%, transparent 100%)',
        display:    'flex',
        flexDirection: 'column',
        gap:        '4px',
        pointerEvents: 'none',
      }}
    >
      {LINES.map(line => (
        <div
          key={line.id}
          ref={el => { if (el) refs.current.set(line.id, el); }}
          style={{
            fontSize:     '9px',
            letterSpacing:'3px',
            textTransform:'uppercase',
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            color:        line.color,
            fontFamily:   '"Courier New", monospace',
          }}
        >
          {line.text}
        </div>
      ))}
    </footer>
  );
}
