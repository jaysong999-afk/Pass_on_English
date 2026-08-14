import { guardApiRole, isGuardResponse } from "@/lib/auth/api-guard";
import type { AuthContext } from "@/lib/auth/types";
import { NextResponse } from "next/server";

/** Returns admin auth context, or a 401/403 NextResponse to return from the handler. */
export async function guardAdminApi(): Promise<AuthContext | NextResponse> {
  return guardApiRole("admin");
}

export function isAdminGuardResponse(
  value: AuthContext | NextResponse
): value is NextResponse {
  return isGuardResponse(value);
}
