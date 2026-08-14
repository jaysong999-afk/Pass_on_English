import { createClient } from "@supabase/supabase-js";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
}

function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
}

export function createAdminClient() {
  return createClient(
    supabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key"
  );
}

/** Service role when configured; otherwise anon (demo RLS). */
export function createPrivilegedClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey && serviceKey !== "placeholder-service-key") {
    return createAdminClient();
  }
  return createClient(supabaseUrl(), supabaseAnonKey());
}
