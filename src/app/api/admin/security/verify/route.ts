import { NextResponse } from "next/server";
import { appendAdminSecurityEvent } from "@/lib/admin/security-events";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  ADMIN_MFA_COOKIE_NAME,
  adminMfaMaxAgeSeconds,
  createAdminMfaCookie,
} from "@/lib/auth/admin-mfa-cookie";
import { createClient } from "@/lib/supabase/server";
import { isAdminMfaRequired } from "@/lib/auth/admin-security";

export async function POST(request: Request) {
  const auth = await guardAdminApi({ allowAal1: true });
  if (isAdminGuardResponse(auth)) return auth;

  let body: { factorId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const factorId = body.factorId?.trim();
  const code = body.code?.trim();
  if (!factorId || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_mfa_code" }, { status: 400 });
  }

  const supabase = await createClient();
  const factorsResult = await supabase.auth.mfa.listFactors();
  if (factorsResult.error) {
    return NextResponse.json({ error: "mfa_factor_lookup_failed" }, { status: 503 });
  }

  const factor = factorsResult.data.all.find(
    (candidate) => candidate.id === factorId && candidate.factor_type === "totp"
  );
  if (!factor) {
    return NextResponse.json({ error: "mfa_factor_not_found" }, { status: 404 });
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (verifyError) {
    return NextResponse.json({ error: "invalid_mfa_code" }, { status: 400 });
  }

  const signedCookie = await createAdminMfaCookie(auth.userId);
  if (!signedCookie && isAdminMfaRequired()) {
    console.error("[admin/security/verify] no MFA cookie signing secret configured");
    return NextResponse.json({ error: "mfa_session_configuration_missing" }, { status: 503 });
  }

  await appendAdminSecurityEvent({
    actorId: auth.userId,
    eventType: factor.status === "verified" ? "mfa_verified" : "mfa_enrolled",
    request,
  });

  const response = NextResponse.json({ ok: true });
  if (signedCookie) {
    response.cookies.set(ADMIN_MFA_COOKIE_NAME, signedCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: adminMfaMaxAgeSeconds(),
    });
  }
  return response;
}
