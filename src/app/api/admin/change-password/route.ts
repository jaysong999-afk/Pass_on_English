import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { isAuthError } from "@/lib/auth/errors";

function parsePassword(value: unknown): string {
  return String(value ?? "");
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

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[admin/change-password]", error);
    return NextResponse.json({ error: "password_update_failed" }, { status: 500 });
  }
}
