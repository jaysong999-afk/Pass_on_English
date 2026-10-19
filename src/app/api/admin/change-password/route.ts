import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { isAuthError } from "@/lib/auth/errors";
import { appendAdminSecurityEvent } from "@/lib/admin/security-events";

function parsePassword(value: unknown): string {
  return String(value ?? "");
}

const COMMON_PASSWORDS = new Set([
  "password123456",
  "qwerty12345678",
  "admin123456789",
  "passonenglish",
]);

function isStrongAdminPassword(password: string, email: string): boolean {
  if (password.length < 14 || password.length > 128) return false;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return false;
  const emailName = email.split("@")[0]?.toLowerCase();
  if (emailName && emailName.length >= 4 && password.toLowerCase().includes(emailName)) return false;

  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password)
  ).length;
  return groups >= 3;
}

export async function POST(request: Request) {
  const auth = await guardAdminApi();
  if (isAdminGuardResponse(auth)) return auth;

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const currentPassword = parsePassword(body.currentPassword);
  const newPassword = parsePassword(body.newPassword);
  const confirmPassword = parsePassword(body.confirmPassword ?? body.newPassword);

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!isStrongAdminPassword(newPassword, auth.email)) {
    return NextResponse.json({ error: "password_too_weak" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "password_mismatch" }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "password_unchanged" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: auth.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("[admin/change-password]", updateError);
      return NextResponse.json({ error: "password_update_failed" }, { status: 500 });
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) {
      console.error("[admin/change-password] other-session sign-out failed", signOutError);
    }

    await appendAdminSecurityEvent({
      actorId: auth.userId,
      eventType: "password_changed",
      request,
      metadata: { otherSessionsRevoked: !signOutError },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[admin/change-password]", error);
    return NextResponse.json({ error: "password_update_failed" }, { status: 500 });
  }
}
