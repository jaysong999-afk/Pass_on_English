import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
}

function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
}

export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

export async function getMiddlewareAuthUser(request: NextRequest, response: NextResponse) {
  const supabase = createMiddlewareSupabaseClient(request, response);
  const bearer = request.headers.get("authorization");

  if (bearer?.startsWith("Bearer ")) {
    const accessToken = bearer.slice(7);
    const {
      data: { user },
    } = await supabase.auth.getUser(accessToken);
    const bearerSupabase = createClient(supabaseUrl(), supabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { supabase: bearerSupabase, user: user ?? null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user: user ?? null };
}
