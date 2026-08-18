import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, isValidLocale, locales, type Locale } from "@/lib/i18n/config";
import {
  isPublicApiPath,
  isPublicPagePath,
  loginPathForRole,
  requiredRoleForPage,
  requiredRolesForApi,
} from "@/lib/auth/constants";
import { fetchAuthProfile, fetchAuthProfilePrivileged } from "@/lib/auth/session";
import { getMiddlewareAuthUser } from "@/lib/supabase/middleware";
import type { UserRole } from "@/lib/auth/types";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

function resolveLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && isValidLocale(cookie)) return cookie;

  const acceptLang = request.headers.get("accept-language") ?? "";
  if (acceptLang.includes("zh")) return "zh-CN";
  return defaultLocale;
}

function localeFromPath(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return isValidLocale(segment) ? segment : defaultLocale;
}

function isIntlRoute(pathname: string): boolean {
  return (
    !pathname.startsWith("/teacher") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/auth")
  );
}

async function enforceRoles(
  request: NextRequest,
  response: NextResponse,
  requiredRoles: UserRole[]
): Promise<NextResponse | null> {
  const { supabase, user } = await getMiddlewareAuthUser(request, response);

  if (!user) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const locale = localeFromPath(request.nextUrl.pathname);
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPathForRole(requiredRoles[0], locale);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const profile = await fetchAuthProfile(supabase, user.id);
  if (!profile) {
    const privilegedProfile = await fetchAuthProfilePrivileged(user.id);
    if (!privilegedProfile || !requiredRoles.includes(privilegedProfile.role)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = loginPathForRole(requiredRoles[0], localeFromPath(request.nextUrl.pathname));
      if (requiredRoles[0] === "admin") {
        loginUrl.searchParams.set("next", request.nextUrl.pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    return null;
  }

  if (!requiredRoles.includes(profile.role)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const locale = localeFromPath(request.nextUrl.pathname);
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPathForRole(requiredRoles[0], locale);
    if (requiredRoles[0] === "admin") {
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return null;
}

async function enforceRole(
  request: NextRequest,
  response: NextResponse,
  requiredRole: UserRole
): Promise<NextResponse | null> {
  return enforceRoles(request, response, [requiredRole]);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const locale = resolveLocale(request);
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  if (pathname === "/student" || pathname.startsWith("/student/")) {
    const locale = resolveLocale(request);
    const response = NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
    response.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return response;
  }

  const response = isIntlRoute(pathname)
    ? intlMiddleware(request)
    : NextResponse.next({ request });

  await getMiddlewareAuthUser(request, response);

  if (pathname.startsWith("/api/") && isPublicApiPath(pathname, request.method)) {
    return response;
  }

  const pageRole = requiredRoleForPage(pathname);
  if (pageRole && !isPublicPagePath(pathname)) {
    const denied = await enforceRole(request, response, pageRole);
    if (denied) return denied;
  }

  if (pathname.startsWith("/api/")) {
    const apiRoles = requiredRolesForApi(pathname, request.method);
    if (apiRoles) {
      const denied = await enforceRoles(request, response, apiRoles);
      if (denied) return denied;
    }
  }

  if (isIntlRoute(pathname)) {
    const localeFromPathname = pathname.split("/")[1];
    if (isValidLocale(localeFromPathname)) {
      response.cookies.set("NEXT_LOCALE", localeFromPathname, { path: "/" });
    }
  }

  return response;
}

export const config = {
  matcher: ["/", "/((?!_next|.*\\..*).*)"],
};
