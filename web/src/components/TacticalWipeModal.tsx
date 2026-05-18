// ═══════════════════════════════════════════════════════════
//  TacticalWipeModal — Canvas destination-out scratch + Web Audio
//
//  - useScratch: brush, progress, auto-sweep at 62%
//  - useAudio:   brown noise on pointer-down, divine reveal on complete
//  - useHaptic:  organic scratch vibration + reveal pattern
// ═══════════════════════════════════════════════════════════
'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useScratch }  from '@/hooks/useScratch';
import { useAudio }   from '@/hooks/useAudio';
import { useHaptic }  from '@/hooks/useHaptic';

interface TacticalWipeModalProps {
  open:    boolean;
  onClose: () => void;
}

export default function TacticalWipeModal({ open, onClose }: TacticalWipeModalProps) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const audio  = useAudio();
  const haptic = useHaptic();

  const { state, onPointerDown, onPointerMove, onPointerUp, renderOverlay } = useScratch(
    canvasRef,
    {
      brushRadius:    28,
      sweepThreshold: 0.62,
      sampleInterval: 60,
      onSweepComplete: () => {
        audio.stopScratch();
        haptic.stopScratch();
        audio.playRevealSound();
        haptic.fire('reveal_divine');
      },
    }
  );

  // ── Size canvas to wrapper ───────────────────────────

  const syncCanvasSize = useCallback(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    canvas.width  = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
  }, []);

  // ── Re-initialize on open ────────────────────────────

  useEffect(() => {
    if (!open) {
      audio.stopScratch();
      haptic.stopScratch();
      return;
    }
    // Give DOM a frame to paint before sizing + drawing
    const id = requestAnimationFrame(() => {
      syncCanvasSize();
      renderOverlay();
    });
    return () => cancelAnimationFrame(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup audio on unmount ─────────────────────────

  useEffect(() => () => audio.dispose(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pointer delegation (audio + haptic side-effects) ─

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    onPointerDown(e);
    audio.startScratch();
    haptic.startScratch();
  }, [onPointerDown, audio, haptic]);

  const handlePointerUp = useCallback(() => {
    onPointerUp();
    audio.stopScratch();
    haptic.stopScratch();
  }, [onPointerUp, audio, haptic]);

  const pct = Math.round(state.progress * 100);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,8,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="TacticalWipe — Scratch Card"
    >
      <div
        style={{
          position: 'relative',
          width: 'min(500px, 94vw)',
          border: '1px solid rgba(255,215,0,0.3)',
          background: '#000010',
          padding: '48px 36px 36px',
          boxShadow: '0 0 60px rgba(255,215,0,0.08)',
        }}
      >
        {/* Top border glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, #ffd700, transparent)',
        }} />

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '18px', color: 'rgba(255,215,0,0.45)',
            fontFamily: '"Courier New", monospace',
          }}
          aria-label="Close"
        >✕</button>

        {/* Header */}
        <p style={{ fontSize: '8px', letterSpacing: '5px', color: '#ffd700', opacity: .6,
                    textTransform: 'uppercase', marginBottom: '8px',
                    fontFamily: '"Courier New", monospace' }}>
          Canvas Scratch · destination-out · Web Audio
        </p>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#ffd700',
                     letterSpacing: '3px', textTransform: 'uppercase',
                     marginBottom: '4px', fontFamily: '"Courier New", monospace' }}>
          TacticalWipe
        </h2>
        <p style={{ fontSize: '10px', color: 'rgba(255,215,0,0.4)', letterSpacing: '2px',
                    marginBottom: '24px', fontFamily: '"Courier New", monospace' }}>
          指かマウスで削れ。62%で自動解放される。
        </p>

        {/* Scratch area */}
        <div
          ref={wrapRef}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 10',
            border: '1px solid rgba(255,215,0,0.2)',
            overflow: 'hidden',
            borderRadius: '2px',
            marginBottom: '16px',
          }}
        >
          {/* Reveal layer (beneath canvas) */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0010, #001020)',
            userSelect: 'none',
          }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '56px', display: 'block', marginBottom: '8px' }}>
                🎴
              </span>
              <span style={{
                fontSize: '11px', letterSpacing: '4px', color: '#ffd700',
                textTransform: 'uppercase', fontFamily: '"Courier New", monospace',
                textShadow: '0 0 20px rgba(255,215,0,0.6)',
              }}>
                SSR UNLOCKED
              </span>
            </div>
          </div>

          {/* Scratch overlay canvas */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              touchAction: 'none',
              cursor: state.completed ? 'default' : 'crosshair',
              display: state.completed ? 'none' : 'block',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            flex: 1, height: '3px',
            background: 'rgba(255,215,0,0.1)', borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: '#ffd700',
              boxShadow: '0 0 8px rgba(255,215,0,0.6)',
              transition: 'width 0.1s linear',
            }} />
          </div>
          <span style={{
            fontSize: '11px', letterSpacing: '2px', color: '#ffd700',
            fontFamily: '"Courier New", monospace', minWidth: '40px', textAlign: 'right',
          }}>
            {pct}%
          </span>
        </div>

        {/* Hint / Complete */}
        {!state.completed ? (
          <p style={{
            fontSize: '10px', letterSpacing: '3px',
            color: 'rgba(255,215,0,0.35)', textAlign: 'center',
            fontFamily: '"Courier New", monospace',
          }}>
            ← 削れ →
          </p>
        ) : (
          <p style={{
            fontSize: '12px', letterSpacing: '4px', color: '#00ff99',
            textAlign: 'center', fontFamily: '"Courier New", monospace',
            animation: 'completePulse 2s ease-in-out infinite',
          }}>
            ◆ 戦略的消去 完了 ◆
          </p>
        )}

        <style>{`
          @keyframes completePulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.6; }
          }
        `}</style>
      </div>
    </div>
  );
}
