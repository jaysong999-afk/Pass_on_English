import { NextResponse } from "next/server";
import type { AuthContext, UserRole } from "@/lib/auth/types";
import { isAuthError } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/session";

export async function guardApiRole(role: UserRole): Promise<AuthContext | NextResponse> {
  try {
    return await requireRole(role);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}

export function isGuardResponse(value: AuthContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function authErrorResponse(error: unknown): NextResponse {
  if (isAuthError(error)) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "auth_failed" }, { status: 500 });
}
