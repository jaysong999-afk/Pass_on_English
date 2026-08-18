import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const auth = await requireRole("teacher");
    const body = await request.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");
    if (!currentPassword || !newPassword || !confirmPassword) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    if (newPassword.length < 8) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "password_mismatch" }, { status: 400 });
    if (currentPassword === newPassword) return NextResponse.json({ error: "password_unchanged" }, { status: 400 });

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: auth.email, password: currentPassword });
    if (verifyError) return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) return NextResponse.json({ error: "password_update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("[teacher/settings/password]", error);
    return NextResponse.json({ error: "password_update_failed" }, { status: 500 });
  }
}
