// ═══════════════════════════════════════════════════════════
//  EkgCanvas — Full-screen background canvas component
//  Uses useEkg hook; resizes on window resize via ResizeObserver.
// ═══════════════════════════════════════════════════════════
'use client';
import { useEffect, useRef } from 'react';
import { useEkg, DEFAULT_CHANNELS } from '@/hooks/useEkg';
import type { EkgChannel } from '@/types/stickerverse';

interface EkgCanvasProps {
  channels?: EkgChannel[];
  opacity?: number;
  scanline?: boolean;
  className?: string;
}

export default function EkgCanvas({
  channels  = DEFAULT_CHANNELS,
  opacity   = 0.16,
  scanline  = true,
  className = '',
}: EkgCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEkg(canvasRef, { channels, scanline });

  // ── Resize handler ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function sync() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position:      'fixed',
        inset:         0,
        width:         '100%',
        height:        '100%',
        opacity,
        pointerEvents: 'none',
        zIndex:        0,
      }}
      aria-hidden="true"
    />
  );
}
