import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";

/** Authenticated Supabase client (cookie session or Bearer token). */
export async function createRequestDbClient(): Promise<SupabaseClient> {
  return createClient();
}

/** Service role when configured; otherwise anon (cron / fallback). */
export function createServiceDbClient(): SupabaseClient {
  return createPrivilegedClient();
}

/** Server bootstrap reads (bypass RLS via service role when configured). */
export function createBootstrapDbClient(): SupabaseClient {
  return createServiceDbClient();
}
