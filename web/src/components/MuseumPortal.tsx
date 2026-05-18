// ═══════════════════════════════════════════════════════════
//  MuseumPortal — Main portal orchestrator (Client Component)
//
//  Renders: EkgCanvas | AlpacaEye | RelicGrid | SacredTexts
//           SingularityVaultModal | TacticalWipeModal
//           DemotionScreen | ImperialFooter
// ═══════════════════════════════════════════════════════════
'use client';
import { useState, useCallback, useRef, useEffect } from 'react';

import EkgCanvas            from './EkgCanvas';
import AlpacaEye            from './AlpacaEye';
import RelicCard            from './RelicCard';
import ImperialFooter       from './ImperialFooter';
import SingularityVaultModal from './SingularityVaultModal';
import TacticalWipeModal    from './TacticalWipeModal';

import MercariGateway        from './MercariGateway';

import { supabase } from '@/lib/supabase';
import { generateSessionId } from '@/lib/vault';
import type { RelicMeta, ModalTarget } from '@/types/stickerverse';

// ── Relic catalogue ──────────────────────────────────────

const RELICS: RelicMeta[] = [
  {
    id: 'RELIC-001', icon: '🪝', tier: 'ssr',
    tierLabel: '◆ SSR — Core Hook',
    title: 'useScratch',
    roast: 'Canvas destination-out。ラジアルグラデーションブラシが62%で自動昇天する。傷こそが仕様。',
    modal: null, live: false,
  },
  {
    id: 'RELIC-002', icon: '🖤', tier: 'sss',
    tierLabel: '◆◆ SSS — Live Demo',
    title: 'TacticalWipe',
    roast: '戦略的消去による浄化儀式。クリックすればスクラッチが今ここで起動する。試してみろ。',
    modal: 'tw', live: true,
  },
  {
    id: 'RELIC-003', icon: '⚡', tier: 'sss',
    tierLabel: '◆◆ SSS — Live Puzzle',
    title: 'SingularityVault',
    roast: '因果律パズル mod 130。A = ⌊sin(t·π)·154⌋。三振で平民。Duke だけが解錠できる。',
    modal: 'sv', live: true,
  },
  {
    id: 'RELIC-004', icon: '⚙️', tier: 'sr',
    tierLabel: '◆ SR — Engine',
    title: 'PathOS',
    roast: '不憫を動力源とする帝国の基幹OS。絶望駆動型。脳死トレードを燃料に動作する。',
    modal: null, live: false,
  },
  {
    id: 'RELIC-005', icon: '✨', tier: 'ssr',
    tierLabel: '◆ SSR — Visual Weapon',
    title: 'GoldFlare Protocol',
    roast: '虚無に走る一閃の黄金光。CSS Gold_Flare · Void_Crack · Abyssal_Blue の三大兵器。',
    modal: null, live: false,
  },
  {
    id: 'RELIC-006', icon: '👁️', tier: 'myth',
    tierLabel: '◆◆◆ MYTH — Emblem',
    title: 'AlpacaEye',
    roast: '帝国の瞳孔。三リング回転、バー瞳孔、因果律を見通す呪われたアルパカの眼球。神話級。',
    modal: null, live: false,
  },
];

// ── Demotion screen ──────────────────────────────────────

function DemotionScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: '#000008',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontSize: 'clamp(80px,15vw,140px)', fontWeight: 900,
        color: 'rgba(255,68,68,0.15)', letterSpacing: '-4px', lineHeight: 1,
        fontFamily: '"Courier New", monospace',
      }}>404</div>
      <div style={{
        fontSize: '18px', letterSpacing: '8px', color: '#ff4444',
        textTransform: 'uppercase', marginBottom: '12px', marginTop: '8px',
        fontFamily: '"Courier New", monospace',
      }}>閉館 — Museum Closed</div>
      <div style={{
        fontSize: '11px', letterSpacing: '3px', color: 'rgba(255,68,68,0.45)',
        marginBottom: '48px', fontFamily: '"Courier New", monospace',
      }}>三振。平民に降格。帝国への門は永久に閉じた。</div>
      <button
        onClick={onRetry}
        style={{
          fontSize: '9px', letterSpacing: '4px', color: '#000',
          background: '#ff4444', border: 'none', padding: '13px 36px',
          cursor: 'pointer', textTransform: 'uppercase',
          fontFamily: '"Courier New", monospace',
          transition: 'background 0.2s',
        }}
      >
        再挑戦を請う → Retry
      </button>
    </div>
  );
}

// ── MuseumPortal ─────────────────────────────────────────

export default function MuseumPortal() {
  const [activeModal, setActiveModal]   = useState<ModalTarget>(null);
  const [demoted,     setDemoted]       = useState(false);
  const [userId,      setUserId]        = useState<string | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);
  const sessionIdRef = useRef(generateSessionId());

  // ── Auth session binding ──────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const openModal  = useCallback((target: ModalTarget) => setActiveModal(target), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const handleRelicClick = useCallback((relic: RelicMeta) => {
    if (relic.modal) openModal(relic.modal);
  }, [openModal]);

  const handleDemoted = useCallback(() => {
    setDemoted(true);
    setActiveModal(null);
  }, []);

  const handleRetry = useCallback(() => {
    setDemoted(false);
    // Fresh session ID on retry
    sessionIdRef.current = generateSessionId();
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow =
      (activeModal !== null || demoted) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [activeModal, demoted]);

  return (
    <>
      {/* ── Fixed background layers ── */}
      <EkgCanvas opacity={0.16} scanline={true} />

      {/* Dot matrix canvas */}
      <DotMatrixCanvas />

      {/* Vignette */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center,transparent 35%,rgba(0,0,8,.55) 68%,rgba(0,0,8,.93) 100%)',
      }} />

      {/* ── Scrollable content ── */}
      <main style={{
        position: 'relative', zIndex: 10,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '56px 24px 180px',
      }}>
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '60px' }}>
          <p style={{
            fontSize: '9px', letterSpacing: '6px', color: '#00e5cc',
            opacity: .65, marginBottom: '14px', textTransform: 'uppercase',
            fontFamily: '"Courier New", monospace',
          }}>
            Imperial Vault Archive · Classified Access · 2026
          </p>
          <h1 style={{
            fontSize: 'clamp(26px,5.5vw,56px)', fontWeight: 900, letterSpacing: '8px',
            color: '#ffd700', textTransform: 'uppercase',
            textShadow: '0 0 24px rgba(255,215,0,.55),0 0 72px rgba(255,215,0,.18)',
            fontFamily: '"Courier New", monospace',
          }}>
            STICKERVERSE MUSEUM
          </h1>
          <p style={{
            fontSize: '10px', letterSpacing: '4px', color: 'rgba(255,215,0,.38)',
            marginTop: '12px', textTransform: 'uppercase',
            fontFamily: '"Courier New", monospace',
          }}>
            Holy Relic Exhibition 1.0 — Emperor's Collection — IQ154 Certified
          </p>
        </header>

        {/* Alpaca Eye Emblem */}
        <div style={{
          marginBottom: '64px',
          filter: 'drop-shadow(0 0 22px rgba(255,215,0,.45)) drop-shadow(0 0 60px rgba(255,215,0,.15))',
          animation: 'emblemFloat 6s ease-in-out infinite',
        }}>
          <AlpacaEye size={200} />
        </div>

        {/* Relic Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '2px',
          width: '100%', maxWidth: '1040px',
          marginBottom: '72px',
        }}>
          {RELICS.map(relic => (
            <RelicCard
              key={relic.id}
              relic={relic}
              onClick={handleRelicClick}
            />
          ))}
        </div>

        {/* Sacred Texts */}
        <SacredTextsSection />

        {/* Mercari Gateway */}
        <div style={{ width: '100%', maxWidth: '1040px', marginTop: '72px' }}>
          <div style={{
            textAlign: 'center', marginBottom: '36px',
            fontFamily: '"Courier New", monospace',
          }}>
            <p style={{
              fontSize: '7px', letterSpacing: '6px', color: '#00e5cc', opacity: .5,
              textTransform: 'uppercase', marginBottom: '10px',
            }}>
              Mercari Capital Recovery · Gate Open · 2026
            </p>
            <h2 style={{
              fontSize: 'clamp(14px,2.5vw,22px)', fontWeight: 900,
              color: '#ffd700', letterSpacing: '6px', textTransform: 'uppercase',
              textShadow: '0 0 16px rgba(255,215,0,.45)',
            }}>
              Imperial Serial Gate
            </h2>
          </div>
          <MercariGateway userId={authLoading ? null : userId} />
        </div>
      </main>

      {/* ── Modals ── */}
      <SingularityVaultModal
        open={activeModal === 'sv'}
        onClose={closeModal}
        onDemoted={handleDemoted}
        sessionId={sessionIdRef.current}
      />

      <TacticalWipeModal
        open={activeModal === 'tw'}
        onClose={closeModal}
      />

      {/* ── Demotion screen ── */}
      {demoted && <DemotionScreen onRetry={handleRetry} />}

      {/* ── Footer ── */}
      {!demoted && <ImperialFooter />}

      {/* Global keyframes */}
      <style>{`
        @keyframes emblemFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-11px); }
        }
        .alpaca-ring-outer {
          transform-box: fill-box; transform-origin: center;
          animation: ringCwSlow 20s linear infinite;
        }
        .alpaca-ring-mid {
          transform-box: fill-box; transform-origin: center;
          animation: ringCcwMid 13s linear infinite;
        }
        .alpaca-ring-inner {
          transform-box: fill-box; transform-origin: center;
          animation: ringCwFast 7s linear infinite;
        }
        @keyframes ringCwSlow  { to { transform: rotate(360deg); } }
        @keyframes ringCcwMid  { to { transform: rotate(-360deg); } }
        @keyframes ringCwFast  { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .alpaca-ring-outer,
          .alpaca-ring-mid,
          .alpaca-ring-inner { animation: none; }
        }
      `}</style>
    </>
  );
}

// ── Sacred Texts section ─────────────────────────────────

function SacredTextsSection() {
  return (
    <section
      style={{
        width: '100%', maxWidth: '900px',
        border: '1px solid rgba(255,215,0,.14)',
        background: 'rgba(255,215,0,.02)',
        padding: '52px 48px',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* FIRST SCRIPTURE badge */}
      <span style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        fontSize: '7px', letterSpacing: '4px', color: '#000010',
        background: '#ffd700', padding: '4px 14px',
        fontFamily: '"Courier New", monospace', textTransform: 'uppercase',
      }}>FIRST SCRIPTURE</span>

      <p style={{
        fontSize: '8px', letterSpacing: '5px', color: '#00e5cc', opacity: .55,
        textTransform: 'uppercase', marginBottom: '16px',
        fontFamily: '"Courier New", monospace',
      }}>
        First Publication · 2026.05.16 · 15:36 JST
      </p>

      <h2 style={{
        fontSize: 'clamp(18px,3vw,28px)', color: '#ffd700', letterSpacing: '.08em',
        lineHeight: 1.45, marginBottom: '20px', fontStyle: 'italic',
        fontFamily: '"Courier New", monospace',
      }}>
        「絶望を錬金する技術——<br/>
        Stickerverse の不憫哲学と黄金の作り方。」
      </h2>

      <p style={{
        fontSize: '12px', lineHeight: 2.0, color: '#c8c0a8', opacity: .72,
        marginBottom: '28px', fontFamily: '"Courier New", monospace',
      }}>
        誰も教えてくれなかった、
        <strong style={{ color: '#ffe566', fontWeight: 700 }}>
          負けを黄金に変える具体的な方法論
        </strong>。<br/>
        IQ154の脳が脳死トレードを繰り返した末に辿り着いた、帝国の設計思想が、初めて活字になった。<br/><br/>
        釜山ミラクルを生き延びた者だけが知る
        <strong style={{ color: '#ffe566', fontWeight: 700 }}>「かわゆし」の本質</strong>——<br/>
        それを今日、あなたの手に渡す。
      </p>

      <a
        href="https://note.com/susan04/n/n7777"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '12px',
          fontSize: '9px', letterSpacing: '4px', textTransform: 'uppercase',
          color: '#000010', background: '#ffd700',
          padding: '13px 36px', textDecoration: 'none',
          fontFamily: '"Courier New", monospace',
          transition: 'background 0.3s, letter-spacing 0.3s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = '#ffe566';
          (e.currentTarget as HTMLAnchorElement).style.letterSpacing = '6px';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = '#ffd700';
          (e.currentTarget as HTMLAnchorElement).style.letterSpacing = '4px';
        }}
      >
        聖典を入手する → note.com
      </a>

      <span style={{
        fontSize: '8px', letterSpacing: '3px', color: '#00e5cc', opacity: .5,
        marginTop: '20px', display: 'block',
        fontFamily: '"Courier New", monospace', textTransform: 'uppercase',
      }}>
        FORMAT: NOTE · EDITION: FIRST · PRICE: ¥1,480 · TAX INCLUDED
      </span>
    </section>
  );
}

// ── Dot Matrix Canvas ────────────────────────────────────

function DotMatrixCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS = ['#ffd700', '#ffd700', '#ffd700', '#00e5cc', '#ffffff'];
    let W = 0, H = 0;
    let cancelled = false;

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (cancelled) return;
      ctx!.clearRect(0, 0, W, H);
      const n = Math.floor((W * H) / 5800);
      for (let i = 0; i < n; i++) {
        ctx!.fillStyle  = COLORS[(Math.random() * COLORS.length) | 0];
        ctx!.globalAlpha = Math.random() * 0.65 + 0.35;
        ctx!.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 1, 1);
      }
      ctx!.globalAlpha = 1;
      setTimeout(draw, 70 + Math.random() * 60);
    }
    draw();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        zIndex: 1, pointerEvents: 'none', opacity: 0.055,
      }}
      aria-hidden="true"
    />
  );
}
