// ═══════════════════════════════════════════════════════════
//  MercariGateway — メルカリ資本回収出張所 コード入力ゲートウェイ
//
//  Aesthetic: Gold on Black · Imperial Flicker · DUKE Ascension
//  Audio:     playRevealBell (4× overtone stereo bell) on success
//  API:       POST /api/auth/activate → { success, tier, rank }
// ═══════════════════════════════════════════════════════════
'use client';
import { useState, useCallback, useRef, useId } from 'react';
import { useAudio } from '@/hooks/useAudio';

// ── Types ────────────────────────────────────────────────

type ActivateResult =
  | { success: true;  tier: string; rank: string }
  | { success: false; message: string };

type GatewayPhase = 'idle' | 'checking' | 'success' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE:     'コードが存在しない。偽物か、または既に消費された。',
  ALREADY_REDEEMED: 'このコードは既に誰かの手に渡った。帝国は一期一会だ。',
  RATE_LIMITED:     '試行回数超過。60秒後に再挑戦せよ。',
  MISSING_FIELDS:   '入力値に欠陥がある。',
  INVALID_USER_ID:  'ユーザーIDが無効。ログインし直せ。',
  SERVER_ERROR:     '帝国サーバーが沈黙した。しばし待て。',
};

const TIER_TITLES: Record<string, string> = {
  DUKE:          '◆◆ DUKE 転生完了',
  EMPEROR_STAFF: '◆◆◆ EMPEROR STAFF 認定',
};

// ── Flicker keyframes (injected once) ────────────────────

const FLICKER_CSS = `
@keyframes gw-flicker {
  0%   { opacity: 1; }
  7%   { opacity: 0.85; }
  10%  { opacity: 1; }
  20%  { opacity: 0.9; }
  23%  { opacity: 1; }
  55%  { opacity: 1; }
  57%  { opacity: 0.7; }
  60%  { opacity: 1; }
  80%  { opacity: 0.95; }
  84%  { opacity: 1; }
  100% { opacity: 1; }
}
@keyframes gw-success-pulse {
  0%   { box-shadow: 0 0 0px rgba(255,215,0,0); }
  30%  { box-shadow: 0 0 48px rgba(255,215,0,.72), 0 0 96px rgba(255,215,0,.28); }
  60%  { box-shadow: 0 0 24px rgba(255,215,0,.45); }
  100% { box-shadow: 0 0 12px rgba(255,215,0,.22); }
}
@keyframes gw-scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}
@keyframes gw-rank-stamp {
  0%   { opacity: 0; transform: scale(1.35) rotate(-2deg); letter-spacing: 14px; }
  60%  { opacity: 1; transform: scale(1.0) rotate(0deg);  letter-spacing: 10px; }
  100% { opacity: 1; transform: scale(1.0) rotate(0deg);  letter-spacing: 10px; }
}
`;

let cssInjected = false;
function ensureCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.textContent = FLICKER_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

// ── Component ────────────────────────────────────────────

interface MercariGatewayProps {
  userId?: string | null;
}

export default function MercariGateway({ userId }: MercariGatewayProps) {
  const inputId   = useId();
  const { playRevealBell } = useAudio();

  const [code,    setCode]    = useState('');
  const [phase,   setPhase]   = useState<GatewayPhase>('idle');
  const [errMsg,  setErrMsg]  = useState('');
  const [result,  setResult]  = useState<ActivateResult | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);

  // ── Inject CSS on first render ──
  if (typeof window !== 'undefined') ensureCSS();

  // ── Submit handler ──
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || phase === 'checking') return;

    if (!userId) {
      setErrMsg('ログインが必要です。帝国への門はログイン済みの者にのみ開く。');
      setPhase('error');
      return;
    }

    setPhase('checking');
    setErrMsg('');
    setResult(null);

    try {
      const res  = await fetch('/api/auth/activate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: code.trim(), userId }),
      });
      const data = await res.json() as ActivateResult;

      if (data.success) {
        setResult(data);
        setPhase('success');
        // 神の祝福音を鳴らす
        playRevealBell();
      } else {
        const raw = (data as { success: false; message: string }).message;
        setErrMsg(ERROR_MESSAGES[raw] ?? raw);
        setPhase('error');
      }
    } catch {
      setErrMsg('接続障害。回線を確認せよ。');
      setPhase('error');
    }
  }, [code, phase, userId, playRevealBell]);

  const handleRetry = useCallback(() => {
    setCode('');
    setPhase('idle');
    setErrMsg('');
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // ── Success screen ──
  if (phase === 'success' && result?.success) {
    const tierTitle = TIER_TITLES[result.tier] ?? `◆ ${result.tier} 転生完了`;
    return (
      <section style={STYLES.wrapper}>
        <div style={{
          ...STYLES.panel,
          animation: 'gw-success-pulse 1.8s ease-out forwards',
        }}>
          <div style={STYLES.successStamp}>
            {tierTitle}
          </div>
          <p style={STYLES.successSub}>
            あなたは転生した。帝国の扉が開いた。<br />
            ページをリロードして新たな階級を確認せよ。
          </p>
          <button onClick={handleRetry} style={STYLES.retryBtn}>
            別コードを入力する →
          </button>
        </div>
      </section>
    );
  }

  // ── Main input form ──
  return (
    <section style={STYLES.wrapper}>
      <div style={STYLES.panel}>
        {/* Header */}
        <div style={STYLES.header}>
          <span style={STYLES.headerBadge}>MERCARI EXCLUSIVE</span>
          <h2 style={STYLES.title}>
            メルカリ<br />シリアルコード
          </h2>
          <p style={STYLES.subtitle}>
            商品同梱のコードを入力し、帝国階級への転生を果たせ。
          </p>
        </div>

        {/* Divider */}
        <div style={STYLES.divider} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={STYLES.form}>
          <label htmlFor={inputId} style={STYLES.label}>
            SERIAL CODE
          </label>

          <div style={{
            ...STYLES.inputWrap,
            ...(focused ? STYLES.inputWrapFocused : {}),
            animation: focused ? 'gw-flicker 3.5s ease-in-out infinite' : 'none',
          }}>
            {/* Scanline overlay */}
            {focused && (
              <div style={STYLES.scanlineContainer} aria-hidden="true">
                <div style={STYLES.scanline} />
              </div>
            )}

            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase());
                if (phase === 'error') { setPhase('idle'); setErrMsg(''); }
              }}
              onFocus={() => setFocused(true)}
              onBlur={()  => setFocused(false)}
              placeholder="KITTY_FLARE_XXXX"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              disabled={phase === 'checking'}
              style={{
                ...STYLES.input,
                ...(phase === 'error' ? STYLES.inputError : {}),
              }}
            />
          </div>

          {/* Error message */}
          {phase === 'error' && errMsg && (
            <p style={STYLES.errorText}>{errMsg}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!code.trim() || phase === 'checking'}
            style={{
              ...STYLES.submitBtn,
              ...((!code.trim() || phase === 'checking') ? STYLES.submitBtnDisabled : {}),
            }}
          >
            {phase === 'checking' ? (
              <span style={{ letterSpacing: '6px' }}>照合中…</span>
            ) : (
              '転生を申請する →'
            )}
          </button>
        </form>

        {/* Footer note */}
        <p style={STYLES.footerNote}>
          DUKE: civilian → duke 昇格 · EMPEROR_STAFF: emperor 特権付与<br />
          コードは一回限り有効。譲渡不可。
        </p>
      </div>
    </section>
  );
}

// ── Style dictionary ─────────────────────────────────────

const FONT = '"Courier New", "Courier", monospace';

const STYLES: Record<string, React.CSSProperties> = {
  wrapper: {
    width: '100%',
    maxWidth: '520px',
    margin: '0 auto',
  },

  panel: {
    background:   'rgba(0,0,0,0.88)',
    border:       '1px solid rgba(255,215,0,.35)',
    padding:      '44px 40px 36px',
    position:     'relative',
    overflow:     'hidden',
  },

  header: {
    textAlign:    'center',
    marginBottom: '28px',
  },

  headerBadge: {
    display:        'inline-block',
    fontSize:       '7px',
    letterSpacing:  '5px',
    color:          '#000010',
    background:     '#ffd700',
    padding:        '4px 14px',
    fontFamily:     FONT,
    textTransform:  'uppercase',
    marginBottom:   '20px',
  },

  title: {
    fontSize:       'clamp(22px,4vw,32px)',
    fontWeight:     900,
    color:          '#ffd700',
    letterSpacing:  '6px',
    textTransform:  'uppercase',
    fontFamily:     FONT,
    textShadow:     '0 0 18px rgba(255,215,0,.55), 0 0 48px rgba(255,215,0,.2)',
    lineHeight:     1.3,
    margin:         0,
  },

  subtitle: {
    fontSize:       '10px',
    letterSpacing:  '2px',
    color:          'rgba(255,215,0,.48)',
    fontFamily:     FONT,
    marginTop:      '12px',
    lineHeight:     1.8,
  },

  divider: {
    height:         '1px',
    background:     'linear-gradient(90deg, transparent, rgba(255,215,0,.4), transparent)',
    margin:         '0 0 28px',
  },

  form: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '10px',
  },

  label: {
    fontSize:       '8px',
    letterSpacing:  '5px',
    color:          'rgba(255,215,0,.55)',
    fontFamily:     FONT,
    textTransform:  'uppercase',
  },

  inputWrap: {
    position:       'relative',
    border:         '1px solid rgba(255,215,0,.22)',
    transition:     'border-color 0.2s',
    overflow:       'hidden',
  },

  inputWrapFocused: {
    border:         '1px solid rgba(255,215,0,.75)',
    boxShadow:      '0 0 14px rgba(255,215,0,.25), inset 0 0 8px rgba(255,215,0,.06)',
  },

  scanlineContainer: {
    position:       'absolute',
    inset:          0,
    pointerEvents:  'none',
    overflow:       'hidden',
    zIndex:         1,
  },

  scanline: {
    position:       'absolute',
    left:           0,
    right:          0,
    height:         '2px',
    background:     'linear-gradient(180deg, transparent, rgba(255,215,0,.18), transparent)',
    animation:      'gw-scanline 1.8s linear infinite',
  },

  input: {
    width:          '100%',
    background:     'transparent',
    border:         'none',
    outline:        'none',
    color:          '#ffd700',
    fontFamily:     FONT,
    fontSize:       '15px',
    letterSpacing:  '3px',
    padding:        '14px 16px',
    textTransform:  'uppercase',
    boxSizing:      'border-box',
    caretColor:     '#ffd700',
    position:       'relative',
    zIndex:         2,
  },

  inputError: {
    color:          '#ff6666',
    caretColor:     '#ff6666',
  },

  errorText: {
    fontSize:       '9px',
    letterSpacing:  '1.5px',
    color:          '#ff6666',
    fontFamily:     FONT,
    lineHeight:     1.7,
    margin:         0,
  },

  submitBtn: {
    marginTop:      '6px',
    background:     '#ffd700',
    color:          '#000010',
    border:         'none',
    padding:        '14px 28px',
    fontFamily:     FONT,
    fontSize:       '9px',
    letterSpacing:  '4px',
    textTransform:  'uppercase',
    cursor:         'pointer',
    fontWeight:     700,
    transition:     'background 0.2s, letter-spacing 0.2s',
  },

  submitBtnDisabled: {
    background:     'rgba(255,215,0,.22)',
    color:          'rgba(0,0,16,.45)',
    cursor:         'not-allowed',
  },

  footerNote: {
    fontSize:       '7px',
    letterSpacing:  '1.5px',
    color:          'rgba(255,215,0,.28)',
    fontFamily:     FONT,
    marginTop:      '22px',
    lineHeight:     1.9,
    textAlign:      'center',
  },

  // Success screen

  successStamp: {
    fontSize:       'clamp(14px,3vw,22px)',
    fontWeight:     900,
    color:          '#ffd700',
    letterSpacing:  '10px',
    textTransform:  'uppercase',
    fontFamily:     FONT,
    textShadow:     '0 0 24px rgba(255,215,0,.8), 0 0 60px rgba(255,215,0,.35)',
    textAlign:      'center',
    marginBottom:   '24px',
    animation:      'gw-rank-stamp 0.6s cubic-bezier(.16,1,.3,1) forwards',
  },

  successSub: {
    fontSize:       '10px',
    letterSpacing:  '2px',
    color:          'rgba(255,215,0,.58)',
    fontFamily:     FONT,
    lineHeight:     2,
    textAlign:      'center',
    marginBottom:   '28px',
  },

  retryBtn: {
    display:        'block',
    margin:         '0 auto',
    background:     'transparent',
    border:         '1px solid rgba(255,215,0,.35)',
    color:          'rgba(255,215,0,.55)',
    fontFamily:     FONT,
    fontSize:       '8px',
    letterSpacing:  '3px',
    padding:        '10px 24px',
    cursor:         'pointer',
    textTransform:  'uppercase',
    transition:     'border-color 0.2s, color 0.2s',
  },
};
