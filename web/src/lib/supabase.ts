import { createClient } from '@supabase/supabase-js';

// クロード先輩のアドバイス①：ビルド時（環境変数が無い時）だけダミーを当て、本番での沈黙を防ぐ
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || typeof window === 'undefined';
const defaultUrl = isBuildPhase ? "https://dummy.supabase.co" : "";
const defaultKey = isBuildPhase ? "dummy" : "";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key are required in runtime!");
}

// 1. 全員が使う、ブラウザからでも叩いて安全な標準クライアント
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// クロード先輩のアドバイス②：核ボタン（Service Role）をクライアント側に絶対混入させない専用関数
export const getSupabaseAdmin = () => {
  if (typeof window !== 'undefined') {
    throw new Error("🚨危険：SUPABASE_SERVICE_ROLE_KEY はブラウザ側では絶対に実行できません！");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in server environment!");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
