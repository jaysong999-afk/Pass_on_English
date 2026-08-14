import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth/types";
import { fetchAuthProfile } from "@/lib/auth/session";
import { AuthError, forbidden, unauthorized, wrongRole } from "@/lib/auth/errors";

function parseRole(value: unknown): UserRole | null {
  if (value === "student" || value === "teacher" || value === "admin") {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; role?: UserRole };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;
  const expectedRole = parseRole(body.role);

  if (!email || !password) {
    return NextResponse.json({ error: "email_password_required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  try {
    const profile =
      (await fetchAuthProfile(supabase, data.user.id)) ??
      (await fetchAuthProfile(createPrivilegedClient(), data.user.id));

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "profile_not_found" }, { status: 403 });
    }

    if (expectedRole && profile.role !== expectedRole) {
      await supabase.auth.signOut();
      throw wrongRole(expectedRole, profile.role);
    }

    if (profile.role === "teacher") {
      const admin = createPrivilegedClient();
      const { data: teacher } = await admin
        .from("teachers")
        .select("status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!teacher || teacher.status !== "active") {
        await supabase.auth.signOut();
        throw forbidden("teacher_not_active");
      }
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      profile,
    });
  } catch (err) {
    await supabase.auth.signOut();
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
