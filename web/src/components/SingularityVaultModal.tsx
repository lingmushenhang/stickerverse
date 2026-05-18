// ═══════════════════════════════════════════════════════════
//  SingularityVaultModal — Causality Puzzle FSM
//
//  States:  solving → unlocked
//                   → demoted  (3 strikes)
//  Guards:  feedback !== 'idle'  → blocks Enter-連打
//           strikes >= 3         → Void_Crack → onDemoted()
//
//  Verification: POST /api/vault/verify (Edge Route)
//  A refreshes client-side every 3 seconds for display;
//  canonical check is always server-side.
// ═══════════════════════════════════════════════════════════
'use client';
import {
  useState, useEffect, useRef, useCallback, useReducer,
} from 'react';
import { useEkg, MINI_CHANNEL } from '@/hooks/useEkg';
import { useHaptic } from '@/hooks/useHaptic';
import { computeA, VAULT_CONSTANTS } from '@/lib/vault';
import type { VaultPhase, FeedbackState } from '@/types/stickerverse';

const { MAX_STRIKES, A_REFRESH_MS } = VAULT_CONSTANTS;

// ── FSM reducer ──────────────────────────────────────────

interface VaultState {
  phase:    VaultPhase;
  strikes:  number;
  feedback: FeedbackState;
  message:  string;
}

type VaultAction =
  | { type: 'SUBMIT' }
  | { type: 'CORRECT' }
  | { type: 'WRONG'; remaining: number }
  | { type: 'DEMOTE' }
  | { type: 'RESET' };

function vaultReducer(state: VaultState, action: VaultAction): VaultState {
  switch (action.type) {
    case 'SUBMIT':
      if (state.feedback !== 'idle') return state; // Enter-連打ガード
      return { ...state, feedback: 'checking', message: '検証中…' };

    case 'CORRECT':
      return { ...state, phase: 'unlocked', feedback: 'correct',
               message: '◆ 解錠成功 — Duke Access Granted ◆' };

    case 'WRONG':
      return {
        ...state,
        feedback: 'wrong',
        strikes:  state.strikes + 1,
        message:  `誤答。残り ${action.remaining} 回`,
      };

    case 'DEMOTE':
      return { ...state, phase: 'demoted', feedback: 'wrong',
               message: '三振。降格執行中…' };

    case 'RESET':
      return { phase: 'solving', strikes: 0, feedback: 'idle', message: '' };

    default:
      return state;
  }
}

const INITIAL_STATE: VaultState = {
  phase: 'solving', strikes: 0, feedback: 'idle', message: '',
};

// ── Props ─────────────────────────────────────────────────

interface SingularityVaultModalProps {
  open:       boolean;
  onClose:    () => void;
  onDemoted:  () => void;
  sessionId:  string;
}

// ── Component ────────────────────────────────────────────

export default function SingularityVaultModal({
  open, onClose, onDemoted, sessionId,
}: SingularityVaultModalProps) {
  const [vault, dispatch]  = useReducer(vaultReducer, INITIAL_STATE);
  const [inputX, setInputX] = useState('');
  const [currentA, setCurrentA] = useState<number>(computeA(Date.now()));
  const [voidCracking, setVoidCracking] = useState(false);

  const ekgCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const boxRef       = useRef<HTMLDivElement>(null);

  const { fire } = useHaptic();
  useEkg(ekgCanvasRef, { channels: MINI_CHANNEL, scanline: false, amplitudeRatio: 0.38 });

  // ── A refresh timer ──────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setCurrentA(computeA(Date.now()));
    const id = setInterval(() => setCurrentA(computeA(Date.now())), A_REFRESH_MS);
    return () => clearInterval(id);
  }, [open]);

  // ── Reset on open ────────────────────────────────────

  useEffect(() => {
    if (open) {
      dispatch({ type: 'RESET' });
      setInputX('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // ── EKG canvas size ──────────────────────────────────

  useEffect(() => {
    const canvas = ekgCanvasRef.current;
    if (!canvas || !open) return;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [open]);

  // ── Submit handler ───────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (vault.feedback !== 'idle') return; // Enter-連打ガード
    if (vault.phase !== 'solving') return;

    const raw = parseInt(inputX, 10);
    if (isNaN(raw)) {
      dispatch({ type: 'WRONG', remaining: MAX_STRIKES - vault.strikes - 1 });
      setTimeout(() => dispatch({ type: 'RESET' }), 1200);
      return;
    }

    dispatch({ type: 'SUBMIT' });

    try {
      const res = await fetch('/api/vault/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x: raw, t: Date.now(), sessionId }),
      });

      if (!res.ok) throw new Error('API error');

      const data = await res.json() as {
        correct: boolean;
        strikes_remaining: number;
      };

      if (data.correct) {
        dispatch({ type: 'CORRECT' });
        fire('reveal_divine');
      } else {
        const remaining = data.strikes_remaining;
        if (remaining <= 0) {
          dispatch({ type: 'DEMOTE' });
          fire('demotion_final');
          // Void_Crack animation then close
          setVoidCracking(true);
          setTimeout(() => {
            setVoidCracking(false);
            onDemoted();
            onClose();
          }, 700);
        } else {
          dispatch({ type: 'WRONG', remaining });
          fire('wrong_answer');
          setTimeout(() => {
            dispatch({ type: 'RESET' });
            setInputX('');
          }, 1200);
        }
      }
    } catch {
      dispatch({ type: 'WRONG', remaining: MAX_STRIKES - vault.strikes - 1 });
      setTimeout(() => dispatch({ type: 'RESET' }), 1200);
    }
  }, [vault.feedback, vault.phase, vault.strikes, inputX, sessionId, fire, onDemoted, onClose]);

  // ── Keyboard ─────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  }, [handleSubmit, onClose]);

  if (!open) return null;

  const feedbackColor = vault.feedback === 'correct' ? '#00ff99'
    : vault.feedback === 'wrong' ? '#ff4444'
    : 'rgba(0,229,204,0.5)';

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
      aria-label="SingularityVault — Causality Puzzle"
    >
      <div
        ref={boxRef}
        style={{
          position: 'relative',
          width: 'min(620px, 94vw)',
          border: '1px solid rgba(0,229,204,0.35)',
          background: '#000010',
          padding: '48px 40px 40px',
          boxShadow: '0 0 80px rgba(0,229,204,0.12), inset 0 0 60px rgba(0,0,8,0.8)',
          animation: voidCracking ? 'voidCrack 0.7s steps(8) forwards' : 'none',
        }}
      >
        {/* Top border glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, #00e5cc, transparent)',
        }} />

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '18px', color: 'rgba(0,229,204,0.45)',
            fontFamily: '"Courier New", monospace',
          }}
          aria-label="Close"
        >✕</button>

        {/* Header */}
        <p style={{ fontSize: '8px', letterSpacing: '5px', color: '#00e5cc',
                    opacity: .6, textTransform: 'uppercase', marginBottom: '8px',
                    fontFamily: '"Courier New", monospace' }}>
          Duke Access Required · Classified
        </p>
        <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#00e5cc',
                     letterSpacing: '3px', textTransform: 'uppercase',
                     marginBottom: '4px', fontFamily: '"Courier New", monospace' }}>
          SingularityVault
        </h2>
        <p style={{ fontSize: '10px', color: 'rgba(0,229,204,0.45)', letterSpacing: '3px',
                    marginBottom: '28px', fontFamily: '"Courier New", monospace' }}>
          因果律パズル · Causality Protocol · mod 130
        </p>

        {/* Mini EKG */}
        <canvas
          ref={ekgCanvasRef}
          style={{ width: '100%', height: '64px', display: 'block',
                   marginBottom: '24px',
                   borderBottom: '1px solid rgba(0,229,204,0.12)' }}
        />

        {/* Formula */}
        <p style={{ fontSize: '11px', color: 'rgba(0,229,204,0.55)', letterSpacing: '2px',
                    marginBottom: '10px', fontFamily: '"Courier New", monospace' }}>
          f(t) = ⌊sin(t·π)·154⌋ + (x mod 130) ≡ 0 (mod 130)
        </p>

        {/* A display */}
        <div style={{ fontSize: '32px', fontWeight: 900, color: '#00e5cc',
                      letterSpacing: '4px', marginBottom: '24px',
                      fontFamily: '"Courier New", monospace',
                      textShadow: '0 0 24px rgba(0,229,204,0.5)',
                      minHeight: '44px' }}>
          A = {currentA}
        </div>

        {/* Unlocked view */}
        {vault.phase === 'unlocked' && (
          <div style={{ textAlign: 'center', padding: '24px 0',
                        fontSize: '14px', letterSpacing: '4px', color: '#00ff99',
                        fontFamily: '"Courier New", monospace',
                        textShadow: '0 0 20px rgba(0,255,153,0.5)' }}>
            ◆ DUKE ACCESS GRANTED ◆<br/><br/>帝国は汝を認める。
          </div>
        )}

        {/* Solving view */}
        {vault.phase === 'solving' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input
                ref={inputRef}
                type="number"
                value={inputX}
                onChange={e => setInputX(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="x = ?"
                inputMode="numeric"
                autoComplete="off"
                style={{
                  flex: 1,
                  background: 'rgba(0,229,204,0.06)',
                  border: '1px solid rgba(0,229,204,0.3)',
                  color: '#00e5cc',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '20px', letterSpacing: '3px',
                  padding: '12px 16px', outline: 'none', textAlign: 'center',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={vault.feedback === 'checking'}
                style={{
                  background: vault.feedback === 'checking'
                    ? 'rgba(0,229,204,0.4)' : '#00e5cc',
                  color: '#000',
                  border: 'none', cursor: 'pointer',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '10px', letterSpacing: '3px',
                  padding: '12px 24px', textTransform: 'uppercase',
                  transition: 'background 0.2s',
                }}
              >
                {vault.feedback === 'checking' ? '…' : '解錠'}
              </button>
            </div>

            {/* Feedback */}
            <div style={{
              fontSize: '11px', letterSpacing: '3px', textAlign: 'center',
              minHeight: '22px', color: feedbackColor,
              fontFamily: '"Courier New", monospace', textTransform: 'uppercase',
            }}>
              {vault.message}
            </div>

            {/* Strike dots */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
              {Array.from({ length: MAX_STRIKES }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    border: '1px solid rgba(255,68,68,0.4)',
                    background: i < vault.strikes ? '#ff4444' : 'transparent',
                    boxShadow: i < vault.strikes ? '0 0 10px rgba(255,68,68,0.7)' : 'none',
                    transition: 'background 0.3s, box-shadow 0.3s',
                  }}
                />
              ))}
            </div>
          </>
        )}

        <style>{`
          @keyframes voidCrack {
            0%  { transform: translate(0,0)    skewX(0deg); }
            10% { transform: translate(-6px,2px) skewX(-4deg); }
            20% { transform: translate(6px,-2px) skewX(4deg); }
            30% { transform: translate(-4px,4px) skewX(-2deg); }
            40% { transform: translate(4px,-4px) skewX(3deg); }
            50% { transform: translate(-8px,1px) skewX(-5deg); }
            60% { transform: translate(8px,-1px) skewX(5deg); }
            70% { transform: translate(-3px,3px) skewX(-3deg); }
            80% { transform: translate(3px,-3px) skewX(2deg); }
            90% { transform: translate(-2px,2px) skewX(-1deg); }
           100% { transform: translate(0,0)    skewX(0deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
