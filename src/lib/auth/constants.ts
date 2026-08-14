import type { UserRole } from "@/lib/auth/types";
import { isValidLocale } from "@/lib/i18n/config";

export const AUTH_PUBLIC_PAGE_PREFIXES = [
  "/teacher/login",
  "/teacher/signup",
  "/admin/login",
  "/auth/callback",
] as const;

export const AUTH_PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/auth/",
  "/api/cron/",
  "/api/faq",
  "/api/teachers/public",
  "/api/teacher/applications",
] as const;

export function loginPathForRole(role: UserRole, locale = "ko"): string {
  switch (role) {
    case "student":
      return `/${locale}/login`;
    case "teacher":
      return "/teacher/login";
    case "admin":
      return "/admin/login";
  }
}

export function isPublicPagePath(pathname: string): boolean {
  if (AUTH_PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  if (/^\/[^/]+\/(login|signup)$/.test(pathname)) {
    return true;
  }

  if (/^\/[^/]+\/student(\/|$)/.test(pathname)) {
    return false;
  }

  if (/^\/[^/]+$/.test(pathname)) {
    const segment = pathname.slice(1);
    if (isValidLocale(segment)) {
      return true;
    }
  }

  if (/^\/[^/]+\/(about|pricing|teachers)(\/|$)/.test(pathname)) {
    return true;
  }

  return false;
}

export function isPublicApiPath(pathname: string, method: string): boolean {
  if (AUTH_PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  if (
    (pathname === "/api/pricing-plans" || /^\/api\/pricing-plans\/[^/]+$/.test(pathname)) &&
    method === "GET"
  ) {
    return true;
  }

  if (pathname === "/api/student/account" && method === "POST") {
    return true;
  }

  if (pathname === "/api/enrollment/teacher-slots" && method === "GET") {
    return true;
  }

  if (pathname === "/api/push/send") {
    return true;
  }

  return false;
}

export function requiredRoleForPage(pathname: string): UserRole | null {
  if (pathname.startsWith("/teacher") && !pathname.startsWith("/teacher/login") && !pathname.startsWith("/teacher/signup")) {
    return "teacher";
  }

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    return "admin";
  }

  if (/^\/[^/]+\/student(\/|$)/.test(pathname)) {
    return "student";
  }

  return null;
}

export function requiredRoleForApi(pathname: string, method: string): UserRole | null {
  const roles = requiredRolesForApi(pathname, method);
  if (!roles || roles.length !== 1) return null;
  return roles[0];
}

/** Returns allowed roles, or `null` when the path is public. */
export function requiredRolesForApi(pathname: string, method: string): UserRole[] | null {
  if (isPublicApiPath(pathname, method)) {
    return null;
  }

  if (pathname.startsWith("/api/admin/")) {
    return ["admin"];
  }

  if (pathname.startsWith("/api/pricing-plans")) {
    return ["admin"];
  }

  // Mixed callers: teacher edits, admin reads, student reserves slots.
  if (pathname === "/api/teacher/availability") {
    return null;
  }

  if (pathname === "/api/teachers/profile" && method === "POST") {
    return ["teacher"];
  }

  if (pathname.startsWith("/api/teacher/")) {
    if (pathname === "/api/teacher/lessons" && method === "GET") {
      return ["student", "teacher", "admin"];
    }
    if (pathname === "/api/teacher/applications" && method === "GET") {
      return ["teacher", "admin"];
    }
    return ["teacher"];
  }

  if (pathname.startsWith("/api/student/")) {
    return ["student"];
  }

  if (pathname.startsWith("/api/enrollments")) {
    return ["student", "admin"];
  }

  if (pathname.startsWith("/api/learning/")) {
    return ["student", "teacher", "admin"];
  }

  if (pathname.startsWith("/api/chat/")) {
    return ["student", "teacher", "admin"];
  }

  if (pathname.startsWith("/api/notifications")) {
    return ["student", "teacher", "admin"];
  }

  if (pathname.startsWith("/api/lessons/reschedule")) {
    return ["student", "teacher", "admin"];
  }

  if (pathname === "/api/push/subscribe") {
    return ["student", "teacher", "admin"];
  }

  if (pathname.startsWith("/api/messages/admin-direct")) {
    return ["student", "teacher"];
  }

  return null;
}
