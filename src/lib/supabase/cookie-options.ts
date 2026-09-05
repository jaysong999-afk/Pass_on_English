import type { CookieOptions } from "@supabase/ssr";

export interface SupabaseCookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
};

/** Keep Supabase's Max-Age=0 deletions while making every session write persistent. */
export function persistentAuthCookieOptions(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    ...AUTH_COOKIE_OPTIONS,
    maxAge: options.maxAge === 0 ? 0 : AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
