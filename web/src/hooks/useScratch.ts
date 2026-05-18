// ═══════════════════════════════════════════════════════════
//  useScratch — Canvas destination-out scratch card hook
//  Manages brush, progress sampling, and auto-sweep at 62%.
// ═══════════════════════════════════════════════════════════
'use client';
import { useCallback, useRef, useState } from 'react';
import type { ScratchState } from '@/types/stickerverse';

interface UseScratchOptions {
  /** Brush radius in px. Default 28. */
  brushRadius?: number;
  /** 0-1 fraction at which auto-sweep triggers. Default 0.62. */
  sweepThreshold?: number;
  /** Progress sampling throttle in ms. Default 60. */
  sampleInterval?: number;
  onSweepComplete?: () => void;
}

export function useScratch(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseScratchOptions = {}
) {
  const {
    brushRadius     = 28,
    sweepThreshold  = 0.62,
    sampleInterval  = 60,
    onSweepComplete,
  } = options;

  const [state, setState] = useState<ScratchState>({
    progress:     0,
    completed:    false,
    isScratching: false,
  });

  const isPointerDown    = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef     = useRef(false); // sync flag (state is async)

  // ── Draw one brush stroke ────────────────────────────

  const scratch = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas || completedRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, brushRadius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    scheduleProgressSample();
  }, [brushRadius, canvasRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Throttled progress sampling (4px stride) ─────────

  const scheduleProgressSample = useCallback(() => {
    if (progressTimerRef.current) return;
    progressTimerRef.current = setTimeout(() => {
      progressTimerRef.current = null;
      measureProgress();
    }, sampleInterval);
  }, [sampleInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  const measureProgress = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || completedRef.current) return;

    const ctx  = canvas.getContext('2d');
    if (!ctx) return;

    const { width: W, height: H } = canvas;
    const data  = ctx.getImageData(0, 0, W, H).data;
    let cleared = 0, total = 0;

    // Sample every 4th pixel (stride 16 in data array)
    for (let i = 3; i < data.length; i += 16) {
      total++;
      if (data[i] < 128) cleared++;
    }

    const progress = total > 0 ? cleared / total : 0;

    setState(prev => ({ ...prev, progress }));

    if (progress >= sweepThreshold) {
      autoSweep();
    }
  }, [sweepThreshold, canvasRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-sweep remaining pixels ──────────────────────

  const autoSweep = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || completedRef.current) return;

    completedRef.current = true;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    setState(prev => ({ ...prev, progress: 1, completed: true }));
    onSweepComplete?.();
  }, [canvasRef, onSweepComplete]);

  // ── Pointer event handlers ────────────────────────────

  const getPos = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    isPointerDown.current = true;
    setState(prev => ({ ...prev, isScratching: true }));
    const { x, y } = getPos(e);
    scratch(x, y);
  }, [scratch]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    scratch(x, y);
  }, [scratch]);

  const onPointerUp = useCallback(() => {
    isPointerDown.current = false;
    setState(prev => ({ ...prev, isScratching: false }));
  }, []);

  // ── Render tar overlay (call after canvas size is set) ──

  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    completedRef.current = false;
    setState({ progress: 0, completed: false, isScratching: false });

    // Tar black fill
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Noise texture
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${20 + (Math.random() * 15) | 0},${(Math.random() * 10) | 0},${30 + (Math.random() * 15) | 0},0.4)`;
      ctx.fill();
    }

    // Watermark
    ctx.font = 'bold 24px "Courier New"';
    ctx.fillStyle = 'rgba(255,215,0,0.05)';
    ctx.textAlign = 'center';
    ctx.fillText('← SCRATCH →', canvas.width / 2, canvas.height / 2 + 8);
    ctx.textAlign = 'left';
  }, [canvasRef]);

  return {
    state,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    renderOverlay,
    autoSweep,
  };
}
