import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getAdminMfaMode } from "@/lib/auth/admin-security";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ADMIN_MFA_COOKIE_NAME, isValidAdminMfaCookie } from "@/lib/auth/admin-mfa-cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await guardAdminApi({ allowAal1: true });
  if (isAdminGuardResponse(auth)) return auth;

  const supabase = await createClient();
  const [assuranceResult, factorsResult] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (assuranceResult.error || factorsResult.error) {
    console.error("[admin/security/status] failed", {
      assurance: assuranceResult.error?.message,
      factors: factorsResult.error?.message,
    });
    return NextResponse.json({ error: "mfa_status_failed" }, { status: 503 });
  }

  const verifiedFactors = factorsResult.data.totp.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? "인증 앱",
    createdAt: factor.created_at,
    lastChallengedAt: factor.last_challenged_at ?? null,
  }));
  const mode = getAdminMfaMode();
  const cookieStore = await cookies();
  const recentMfa = await isValidAdminMfaCookie(
    cookieStore.get(ADMIN_MFA_COOKIE_NAME)?.value,
    auth.userId
  );

  return NextResponse.json(
    {
      mode,
      currentLevel: assuranceResult.data.currentLevel,
      nextLevel: assuranceResult.data.nextLevel,
      hasVerifiedFactor: verifiedFactors.length > 0,
      requiresVerification:
        mode === "required" &&
        (assuranceResult.data.currentLevel !== "aal2" || !recentMfa),
      recentMfa,
      verifiedFactors,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
