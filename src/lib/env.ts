const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

export interface EnvCheckResult {
  ok: boolean;
  missing: string[];
}

export function checkEnv(): EnvCheckResult {
  const missing = REQUIRED.filter(key => !import.meta.env[key]);
  return { ok: missing.length === 0, missing };
}
