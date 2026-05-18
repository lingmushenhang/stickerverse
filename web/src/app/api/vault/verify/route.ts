// ═══════════════════════════════════════════════════════════
//  Edge API Route: POST /api/vault/verify
//
//  Receives: { x: number, t: number, sessionId: string }
//  Returns:  { correct: boolean, strikes_remaining: number }
//
//  Security model:
//  - A is computed SERVER-SIDE from client timestamp t.
//  - A small time-window (±10 seconds) is allowed for clock skew.
//  - Clients never receive A until after correct answer.
//  - Demotion is logged to Supabase via service-role key.
//  - Rate limiting: max 5 requests per 10s per IP (simple in-memory,
//    replace with Upstash Redis / Cloudflare KV in production).
//
//  Runtime: Edge (Vercel Edge / Cloudflare Pages Worker)
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { computeA, verifySolution, VAULT_CONSTANTS } from '@/lib/vault';
import { recordDemotion, demoteUser } from '@/lib/supabase';

export const runtime = 'edge';

const { MAX_STRIKES } = VAULT_CONSTANTS;

// ── In-memory strike tracker (per session, Edge-compatible) ──
// In production: replace with Upstash Redis or Cloudflare KV.
const strikeMap = new Map<string, { strikes: number; lastSeen: number }>();

// ── Simple IP-based rate limiter ──────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX      = 5;
const RATE_LIMIT_WINDOW   = 10_000; // 10 seconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true; // allowed
  }

  if (entry.count >= RATE_LIMIT_MAX) return false; // blocked

  entry.count++;
  return true;
}

// ── Hash IP for logging (SHA-256 hex, no PII stored raw) ──

async function hashIp(ip: string): Promise<string> {
  const data   = new TextEncoder().encode(ip + process.env.IP_HASH_SALT ?? 'imperial-salt');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Route handler ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── IP extraction ──
  const ip =
    req.headers.get('cf-connecting-ip') ??          // Cloudflare
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? // Vercel / nginx
    'unknown';

  // ── Rate limit ──
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. 帝国の壁は厚い。' },
      { status: 429 }
    );
  }

  // ── Parse body ──
  let x: number, t: number, sessionId: string;
  try {
    const body = await req.json() as { x: unknown; t: unknown; sessionId: unknown };
    x = Number(body.x);
    t = Number(body.t);
    sessionId = String(body.sessionId ?? '');

    if (!Number.isInteger(x) || !Number.isFinite(t) || !sessionId) {
      return NextResponse.json(
        { error: 'Invalid payload.' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // ── Timestamp validation (±10 second window for clock skew) ──
  const serverNow = Date.now();
  if (Math.abs(serverNow - t) > 10_000) {
    return NextResponse.json(
      { error: 'Timestamp out of sync. Reload and try again.' },
      { status: 422 }
    );
  }

  // ── Compute A server-side ──
  // Use server timestamp for canonical A; client t is only used for the
  // window check above.
  const A = computeA(serverNow);

  // ── Retrieve / initialize session state ──
  const session = strikeMap.get(sessionId) ?? { strikes: 0, lastSeen: serverNow };
  session.lastSeen = serverNow;

  // Already demoted?
  if (session.strikes >= MAX_STRIKES) {
    return NextResponse.json(
      { correct: false, strikes_remaining: 0, demoted: true },
      { status: 200 }
    );
  }

  // ── Verify ──
  const correct = verifySolution(x, A);

  if (correct) {
    // Reset strikes on success
    strikeMap.delete(sessionId);

    return NextResponse.json({
      correct: true,
      A,                                        // disclose A only on success
      need: (((- A) % 130) + 130) % 130,
      strikes_remaining: MAX_STRIKES,
    });
  }

  // ── Wrong answer ──
  session.strikes++;
  strikeMap.set(sessionId, session);

  const remaining = MAX_STRIKES - session.strikes;

  // ── Demotion ──
  if (session.strikes >= MAX_STRIKES) {
    const ipHash = await hashIp(ip).catch(() => null);

    // Fire-and-forget — don't block the response
    recordDemotion({
      userId:    null,             // anonymous; attach after auth integration
      sessionId,
      strikes:   session.strikes,
      finalA:    A,
      finalX:    x,
      ipHash,
    }).catch(console.error);

    return NextResponse.json({
      correct:           false,
      strikes_remaining: 0,
      demoted:           true,
    });
  }

  return NextResponse.json({
    correct:           false,
    strikes_remaining: remaining,
  });
}

// ── Cleanup stale sessions every 60 minutes ───────────────
// Edge functions are stateless across invocations in production;
// this cleanup only matters for long-lived dev server processes.

const STALE_AFTER = 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - STALE_AFTER;
  strikeMap.forEach((v, k) => {
    if (v.lastSeen < cutoff) strikeMap.delete(k);
  });
}, STALE_AFTER);
