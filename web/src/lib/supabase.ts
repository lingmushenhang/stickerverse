import { createClient } from '@supabase/supabase-js';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || typeof window === 'undefined';
const defaultUrl = isBuildPhase ? "https://dummy.supabase.co" : "";
const defaultKey = isBuildPhase ? "dummy" : "";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key are required in runtime!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSupabaseAdmin = () => {
  if (typeof window !== 'undefined') {
    throw new Error("🚨危険：SUPABASE_SERVICE_ROLE_KEY はブラウザ側では絶対に実行できません！");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in server environment!");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

// 復活：route.ts が要求する降格ログ関数（94a2960 で消えビルドを殺した片割れ）
export interface DemotionRecord {
  userId: string | null;
  sessionId: string;
  strikes: number;
  finalA: number;
  finalX: number;
  ipHash: string | null;
}

export async function recordDemotion(record: DemotionRecord): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('demotions').insert({
    user_id:    record.userId,
    session_id: record.sessionId,
    strikes:    record.strikes,
    final_a:    record.finalA,
    final_x:    record.finalX,
    ip_hash:    record.ipHash,
    created_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`recordDemotion failed: ${error.message}`);
  }
}

export async function demoteUser(userId: string): Promise<void> {
  if (!userId) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ role: 'civilian', demoted_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    throw new Error(`demoteUser failed: ${error.message}`);
  }
}
