// ═══════════════════════════════════════════════════════════
//  STICKERVERSE — Supabase Client
//  Two exports: browser singleton + server-side admin client.
// ═══════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/stickerverse';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Browser / Edge client (anon key, RLS enforced) ───────
//
// Instantiated once per process thanks to module-level singleton.
// Safe to import in both Client Components and Edge Route Handlers.

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

/** Convenience default export for the browser singleton. */
export const supabase = getSupabaseClient();

// ── Server-only admin client (service-role key, bypasses RLS) ──
//
// Import this ONLY in Route Handlers or Server Actions.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client bundle.

export function getSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      '[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Admin client must only be used server-side.'
    );
  }
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}

// ── Helper: upsert rank after successful vault unlock ────

export async function promoteToDuke(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await (admin as any).from('users')
    .update({
      rank: 'duke',
      vault_unlocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`[Supabase] promoteToDuke failed: ${error.message}`);
}

// ── Helper: record demotion ──────────────────────────────

export async function recordDemotion(params: {
  userId: string | null;
  sessionId: string;
  strikes: number;
  finalA: number;
  finalX: number;
  ipHash: string | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('demotion_logs').insert({
    user_id:    params.userId,
    session_id: params.sessionId,
    strikes:    params.strikes,
    final_A:    params.finalA,
    final_x:    params.finalX,
    ip_hash:    params.ipHash,
    demoted_at: new Date().toISOString(),
  });

  if (error) {
    // Non-fatal: log but don't crash the request
    console.error('[Supabase] recordDemotion failed:', error.message);
  }
}

// ── Helper: demote user rank ─────────────────────────────

export async function demoteUser(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await (admin as any).from('users')
    .update({
      rank:        'civilian',
      demoted_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`[Supabase] demoteUser failed: ${error.message}`);
}
