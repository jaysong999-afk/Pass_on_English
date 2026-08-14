import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
}

function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
}

/** Bearer access token from Authorization header (API/E2E scripts). */
export async function getBearerAccessToken(): Promise<string | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

/** Supports cookie session (browser) and Bearer token (API/E2E scripts). */
export async function createClient() {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: authHeader } },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  );
}
