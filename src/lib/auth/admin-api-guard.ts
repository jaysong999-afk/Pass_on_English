import { guardApiRole, isGuardResponse } from "@/lib/auth/api-guard";
import { getAdminMfaAssurance, isAdminMfaRequired } from "@/lib/auth/admin-security";
import type { AuthContext } from "@/lib/auth/types";
import { createClient, getBearerAccessToken } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ADMIN_MFA_COOKIE_NAME, isValidAdminMfaCookie } from "@/lib/auth/admin-mfa-cookie";
import { NextResponse } from "next/server";

interface GuardAdminApiOptions {
  /** Allows the MFA enrollment/status endpoints to operate after password login. */
  allowAal1?: boolean;
  /** Forces AAL2 even while the site-wide rollout is still optional. */
  requireAal2?: boolean;
}

/** Returns admin auth context, or a 401/403 NextResponse to return from the handler. */
export async function guardAdminApi(
  options: GuardAdminApiOptions = {}
): Promise<AuthContext | NextResponse> {
  const context = await guardApiRole("admin");
  if (isGuardResponse(context)) return context;

  const mustUseAal2 = options.requireAal2 || (!options.allowAal1 && isAdminMfaRequired());
  if (!mustUseAal2) return context;

  try {
    const bearerAccessToken = await getBearerAccessToken();
    const assurance = await getAdminMfaAssurance(
      await createClient(),
      bearerAccessToken ?? undefined
    );
    if (assurance.currentLevel !== "aal2") {
      return NextResponse.json({ error: "mfa_required" }, { status: 403 });
    }
    if (isAdminMfaRequired() && !bearerAccessToken) {
      const cookieStore = await cookies();
      const recentMfa = await isValidAdminMfaCookie(
        cookieStore.get(ADMIN_MFA_COOKIE_NAME)?.value,
        context.userId
      );
      if (!recentMfa) {
        return NextResponse.json({ error: "mfa_required" }, { status: 403 });
      }
    }
  } catch (error) {
    console.error("[admin/api-guard] MFA assurance check failed", error);
    return NextResponse.json({ error: "mfa_check_failed" }, { status: 503 });
  }

  return context;
}

export function isAdminGuardResponse(
  value: AuthContext | NextResponse
): value is NextResponse {
  return isGuardResponse(value);
}
