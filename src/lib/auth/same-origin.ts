import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function expectedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // A malformed optional URL must not weaken the request check.
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  if (host && protocol) origins.add(`${protocol}://${host}`);
  return origins;
}
/**
 * Cookie-authenticated administrator mutations must originate from this app.
 * Bearer clients do not rely on browser cookies and remain available to tests
 * and explicitly authenticated operational tools.
 */
export function isTrustedAdminMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return expectedOrigins(request).has(new URL(origin).origin);
  } catch {
    return false;
  }
}
