import { NextResponse } from "next/server";
import { appendAdminSecurityEvent } from "@/lib/admin/security-events";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await guardAdminApi({ requireAal2: true });
  if (isAdminGuardResponse(auth)) return auth;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    console.error("[admin/security/sessions] sign-out failed", error);
    return NextResponse.json({ error: "session_revoke_failed" }, { status: 500 });
  }

  await appendAdminSecurityEvent({
    actorId: auth.userId,
    eventType: "other_sessions_signed_out",
    request,
  });
  return NextResponse.json({ ok: true });
}
