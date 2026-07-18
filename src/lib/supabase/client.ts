import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cache the client (not a promise — creation is synchronous) so repeated
// calls within a request/runtime share one instance.
let cached: SupabaseClient | null = null;

/**
 * Server-only admin client for the track_embeddings table. Uses the service
 * role key so it can read/write past row-level security; never expose this
 * client or its key to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
