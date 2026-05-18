// ═══════════════════════════════════════════════════════════
//  Edge API Route: POST /api/auth/activate
//
//  Receives: { code: string, userId: string }
//  Returns:  { success, tier, rank, message }
//
//  Security model:
//  - Code lookup + redemption is a single atomic SQL RPC call
//    (redeem_serial_code) that uses FOR UPDATE SKIP LOCKED.
//  - Service-role key (bypasses RLS) — never call client-side.
//  - Rate limiting: 3 attempts per 60s per IP.
//  - userId must match an existing public.users row.
//
//  Runtime: Edge (Vercel Edge / Cloudflare Pages Worker)
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

// ── Rate limiter: max 3 activations per 60s per IP ───────

const rl = new Map<string, { count: number; resetAt: number }>();
const RL_MAX    = 3;
const RL_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rl.get(ip);
  if (!entry || now > entry.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + RL_WINDOW });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

// ── Tier → display label ──────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  DUKE:           'duke',
  EMPEROR_STAFF:  'emperor',
};

// ── Route handler ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, message: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  // ── Parse body ──
  let code: string, userId: string;
  try {
    const body = await req.json() as { code: unknown; userId: unknown };
    code   = String(body.code   ?? '').trim().toUpperCase();
    userId = String(body.userId ?? '').trim();

    if (!code || !userId) {
      return NextResponse.json(
        { success: false, message: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, message: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  // ── Validate userId format (UUID) ──
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json(
      { success: false, message: 'INVALID_USER_ID' },
      { status: 400 }
    );
  }

  // ── Atomic redemption via Supabase RPC ──
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .rpc('redeem_serial_code', {
        p_code:    code,
        p_user_id: userId,
      });

    if (error) {
      console.error('[activate] RPC error:', error.message);
      return NextResponse.json(
        { success: false, message: 'SERVER_ERROR' },
        { status: 500 }
      );
    }

    const result = data as { success: boolean; tier: string | null; message: string };

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 200 }
      );
    }

    const rank = TIER_LABEL[result.tier ?? ''] ?? 'duke';

    return NextResponse.json({
      success: true,
      tier:    result.tier,
      rank,
      message: 'REDEEMED',
    });
  } catch (err) {
    console.error('[activate] unexpected error:', err);
    return NextResponse.json(
      { success: false, message: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
