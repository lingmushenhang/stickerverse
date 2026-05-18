// ═══════════════════════════════════════════════════════════
//  useAudio — Web Audio API synthesis
//  Brown noise tar scratch + divine kira-n reveal sound.
//  Singleton AudioContext per hook instance.
// ═══════════════════════════════════════════════════════════
'use client';
import { useCallback, useRef } from 'react';

// ── Brown noise buffer synthesis ─────────────────────────

function buildBrownNoise(actx: AudioContext): AudioBuffer {
  const len    = actx.sampleRate * 3; // 3-second loop
  const buffer = actx.createBuffer(1, len, actx.sampleRate);
  const data   = buffer.getChannelData(0);
  let lastOut  = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Integrated white noise → brown noise
    lastOut   = (lastOut + 0.02 * white) / 1.02;
    data[i]   = lastOut * 3.5;
    // Hard clip to [-1, 1]
    if (data[i] >  1) data[i] =  1;
    if (data[i] < -1) data[i] = -1;
  }
  return buffer;
}

// ── Scratch graph: BrownNoise → BandpassFilter → LFO → Gain ──

interface ScratchGraph {
  source:     AudioBufferSourceNode;
  gain:       GainNode;
  lfo:        OscillatorNode;
}

function buildScratchGraph(actx: AudioContext): ScratchGraph {
  const buf    = buildBrownNoise(actx);
  const source = actx.createBufferSource();
  source.buffer = buf;
  source.loop   = true;

  const filter = actx.createBiquadFilter();
  filter.type             = 'bandpass';
  filter.frequency.value  = 450;
  filter.Q.value          = 2.8;

  // LFO: 3.5 Hz × 180 Hz modulates filter frequency
  const lfo     = actx.createOscillator();
  const lfoGain = actx.createGain();
  lfo.frequency.value = 3.5;
  lfoGain.gain.value  = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const gain  = actx.createGain();
  gain.gain.value = 0; // silent until startScratch()

  source.connect(filter);
  filter.connect(gain);
  gain.connect(actx.destination);
  source.start();

  return { source, gain, lfo };
}

// ── 4x Overtone Reveal Bell (神の祝福音 — Mercari Duke Ascension) ──
//
// Four pure harmonics locked at exact 4× overtone ratios:
//   H1 = 440 Hz  (fundamental A4)
//   H2 = 880 Hz  (octave)
//   H3 = 1320 Hz (perfect 12th)
//   H4 = 1760 Hz (double octave)
// Hard stereo spread: L ←→ R alternating per harmonic.
// Long 2.8-second tail with exponential decay.

function synthesizeRevealBell(actx: AudioContext): void {
  const now        = actx.currentTime;
  const FUND       = 440;
  const HARMONICS  = [1, 2, 3, 4];                  // × fundamental
  const PANS       = [-0.85, 0.85, -0.55, 0.55];    // stereo spread
  const GAINS      = [0.22,  0.18,  0.12,  0.10];   // decreasing amplitude
  const TAIL       = 2.8;

  HARMONICS.forEach((mult, i) => {
    const freq   = FUND * mult;
    const osc    = actx.createOscillator();
    const gain   = actx.createGain();
    const pan    = actx.createStereoPanner();

    osc.type            = 'sine';
    osc.frequency.value = freq;

    // Bell-like attack + long exponential tail
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(GAINS[i], now + 0.008 + i * 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + TAIL);

    pan.pan.value = PANS[i];

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(actx.destination);

    osc.start(now + i * 0.025);   // slight stagger — bell-strike feel
    osc.stop(now + TAIL + 0.05);
  });

  // Shimmer layer: three high-frequency partial tones (5th–7th partials)
  [2200, 2640, 3080].forEach((freq, i) => {
    const osc  = actx.createOscillator();
    const gain = actx.createGain();
    const pan  = actx.createStereoPanner();
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, now + i * 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    pan.pan.value = (i % 2 === 0 ? 1 : -1) * 0.7;
    osc.connect(gain); gain.connect(pan); pan.connect(actx.destination);
    osc.start(now + i * 0.03);
    osc.stop(now + 1.0);
  });

  // Soft sub-tone foundation (110 Hz → quick decay)
  const sub  = actx.createOscillator();
  const subG = actx.createGain();
  sub.type            = 'sine';
  sub.frequency.value = 110;
  subG.gain.setValueAtTime(0.18, now);
  subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  sub.connect(subG); subG.connect(actx.destination);
  sub.start(now); sub.stop(now + 0.4);
}

// ── Divine reveal: bell harmonics + sub bass + sparkles ──

function playReveal(actx: AudioContext): void {
  const now   = actx.currentTime;
  const bell  = [880, 1760, 2640, 3520];

  // Bell harmonics
  bell.forEach((freq, i) => {
    const osc  = actx.createOscillator();
    const gain = actx.createGain();
    const pan  = actx.createStereoPanner();
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15 / (i + 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    pan.pan.value = i % 2 === 0 ? 0.4 : -0.4;
    osc.connect(gain); gain.connect(pan); pan.connect(actx.destination);
    osc.start(now + i * 0.05);
    osc.stop(now + 1.5);
  });

  // Sub bass sweep 80 → 40 Hz
  const sub  = actx.createOscillator();
  const subG = actx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(80, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.4);
  subG.gain.setValueAtTime(0.25, now);
  subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  sub.connect(subG); subG.connect(actx.destination);
  sub.start(now); sub.stop(now + 0.4);

  // Sparkles
  for (let i = 0; i < 5; i++) {
    const sp  = actx.createOscillator();
    const spG = actx.createGain();
    const pan = actx.createStereoPanner();
    const f   = 3000 + Math.random() * 5000;
    sp.type            = 'sine';
    sp.frequency.value = f;
    spG.gain.setValueAtTime(0.06, now + i * 0.07);
    spG.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.25);
    pan.pan.value = (Math.random() * 2 - 1) * 0.8;
    sp.connect(spG); spG.connect(pan); pan.connect(actx.destination);
    sp.start(now + i * 0.07);
    sp.stop(now + i * 0.07 + 0.3);
  }
}

// ── Hook ─────────────────────────────────────────────────

export function useAudio() {
  const actxRef   = useRef<AudioContext | null>(null);
  const graphRef  = useRef<ScratchGraph | null>(null);

  function getActx(): AudioContext {
    if (!actxRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actxRef.current = new Ctx();
    }
    if (actxRef.current.state === 'suspended') {
      actxRef.current.resume();
    }
    return actxRef.current;
  }

  /** Begin scratch noise. Lazy-initializes audio graph. */
  const startScratch = useCallback(() => {
    const actx = getActx();
    if (!graphRef.current) {
      graphRef.current = buildScratchGraph(actx);
    }
    const gain = graphRef.current.gain;
    gain.gain.cancelScheduledValues(actx.currentTime);
    gain.gain.setTargetAtTime(0.35, actx.currentTime, 0.05);
  }, []);

  /** Fade out scratch noise. */
  const stopScratch = useCallback(() => {
    if (!graphRef.current || !actxRef.current) return;
    const { gain } = graphRef.current;
    gain.gain.cancelScheduledValues(actxRef.current.currentTime);
    gain.gain.setTargetAtTime(0, actxRef.current.currentTime, 0.05);
  }, []);

  /** Play full divine reveal sound. */
  const playRevealSound = useCallback(() => {
    playReveal(getActx());
  }, []);

  /** Play 4× overtone Reveal Bell — Duke ascension via Mercari serial. */
  const playRevealBell = useCallback(() => {
    synthesizeRevealBell(getActx());
  }, []);

  /** Tear down audio context (call on modal unmount). */
  const dispose = useCallback(() => {
    graphRef.current?.source.stop();
    graphRef.current?.lfo.stop();
    graphRef.current = null;
    actxRef.current?.close();
    actxRef.current = null;
  }, []);

  return { startScratch, stopScratch, playRevealSound, playRevealBell, dispose };
}
