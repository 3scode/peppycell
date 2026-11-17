export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PeppyCell";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
