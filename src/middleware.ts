import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, isValidLocale, locales, type Locale } from "@/lib/i18n/config";

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

export function middleware(request: NextRequest) {
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

  if (
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  const response = intlMiddleware(request);

  const localeFromPath = pathname.split("/")[1];
  if (isValidLocale(localeFromPath)) {
    response.cookies.set("NEXT_LOCALE", localeFromPath, { path: "/" });
  }

  return response;
}

export const config = {
  matcher: ["/", "/((?!_next|.*\\..*).*)"],
};
