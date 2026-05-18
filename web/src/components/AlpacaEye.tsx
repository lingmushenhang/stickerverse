// ═══════════════════════════════════════════════════════════
//  AlpacaEye — SVG Emblem with 3 rotating rings + float
//  transform-box: fill-box on each <g> for correct origin.
// ═══════════════════════════════════════════════════════════
import type { FC } from 'react';

interface AlpacaEyeProps {
  size?: number;
  className?: string;
}

const AlpacaEye: FC<AlpacaEyeProps> = ({ size = 200, className = '' }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 300 300"
    xmlns="http://www.w3.org/2000/svg"
    overflow="visible"
    aria-label="Alpaca Eye — Imperial Emblem"
  >
    {/* ── Outer ring: slow CW ── */}
    <g className="alpaca-ring-outer">
      <circle cx="150" cy="150" r="140" fill="none" stroke="#ffd700"
              strokeWidth="1.1" strokeDasharray="7 9" opacity=".45"/>
      <circle cx="150" cy="150" r="136" fill="none" stroke="#ffd700"
              strokeWidth=".4" opacity=".18"/>
      {/* Cardinal tick marks */}
      <line x1="150" y1="8"   x2="150" y2="20"  stroke="#ffd700" strokeWidth=".8" opacity=".35"/>
      <line x1="150" y1="280" x2="150" y2="292" stroke="#ffd700" strokeWidth=".8" opacity=".35"/>
      <line x1="8"   y1="150" x2="20"  y2="150" stroke="#ffd700" strokeWidth=".8" opacity=".35"/>
      <line x1="280" y1="150" x2="292" y2="150" stroke="#ffd700" strokeWidth=".8" opacity=".35"/>
    </g>

    {/* ── Mid ring: CCW ── */}
    <g className="alpaca-ring-mid">
      <circle cx="150" cy="150" r="118" fill="none" stroke="#00e5cc"
              strokeWidth=".75" strokeDasharray="4 14" opacity=".38"/>
      <circle cx="150" cy="150" r="114" fill="none" stroke="#00e5cc"
              strokeWidth=".3" opacity=".18"/>
    </g>

    {/* ── Inner ring: fast CW ── */}
    <g className="alpaca-ring-inner">
      <circle cx="150" cy="150" r="96" fill="none" stroke="#ffd700"
              strokeWidth=".9" strokeDasharray="16 6" opacity=".3"/>
    </g>

    {/* ── Eye background ── */}
    <path
      d="M 58,150 C 58,100 150,86 242,150 C 242,200 150,214 58,150 Z"
      fill="rgba(0,0,8,.88)"
    />

    {/* ── Eye glow (blurred) ── */}
    <path
      d="M 58,150 C 58,100 150,86 242,150 C 242,200 150,214 58,150 Z"
      fill="none"
      stroke="#ffd700"
      strokeWidth="6"
      opacity=".1"
      filter="url(#blur-gold-ae)"
    />

    {/* ── Eye outline ── */}
    <path
      d="M 58,150 C 58,100 150,86 242,150 C 242,200 150,214 58,150 Z"
      fill="none"
      stroke="#ffd700"
      strokeWidth="1.4"
      opacity=".9"
    />

    {/* ── Iris rings ── */}
    <circle cx="150" cy="150" r="30" fill="none" stroke="#ffd700"  strokeWidth=".6" opacity=".4"/>
    <circle cx="150" cy="150" r="22" fill="none" stroke="#00e5cc" strokeWidth=".5" opacity=".35"/>

    {/* ── Bar pupil ── */}
    <rect x="142" y="119" width="16" height="62" rx="7.5" fill="#ffd700" opacity=".92"/>
    {/* Specular */}
    <rect x="146" y="124" width="7"  height="52" rx="3.5" fill="#fff"    opacity=".22"/>

    <defs>
      <filter id="blur-gold-ae" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5"/>
      </filter>
    </defs>
  </svg>
);

export default AlpacaEye;
