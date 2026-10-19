import { NextResponse } from "next/server";
import { appendAdminSecurityEvent } from "@/lib/admin/security-events";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_MFA_COOKIE_NAME } from "@/lib/auth/admin-mfa-cookie";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
    : { data: null };
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return NextResponse.json({ error: "logout_failed" }, { status: 500 });
  }

  if (userId && profile?.role === "admin") {
    await appendAdminSecurityEvent({
      actorId: userId,
      eventType: "admin_logout",
      request,
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_MFA_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
