import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth/types";
import { fetchAuthProfile } from "@/lib/auth/session";
import { AuthError, forbidden, wrongRole } from "@/lib/auth/errors";
import {
  classifyLoginFailure,
  loginErrorLogFields,
} from "@/lib/auth/login-failure";

const TRANSIENT_RETRY_DELAY_MS = 300;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  let authResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  let signInAttempts = 1;

  try {
    authResult = await supabase.auth.signInWithPassword({ email, password });
    if (authResult.error && classifyLoginFailure(authResult.error).retryable) {
      console.warn("[auth/login] transient Supabase Auth failure; retrying once", {
        ...loginErrorLogFields(authResult.error),
        attempt: 1,
      });
      await wait(TRANSIENT_RETRY_DELAY_MS);
      signInAttempts = 2;
      authResult = await supabase.auth.signInWithPassword({ email, password });
    }
  } catch (error) {
    const firstFailure = classifyLoginFailure(error);
    if (!firstFailure.retryable) {
      console.error("[auth/login] Supabase Auth request failed", loginErrorLogFields(error));
      return NextResponse.json({ error: firstFailure.code }, { status: firstFailure.status });
    }

    console.warn("[auth/login] transient Supabase Auth request error; retrying once", {
      ...loginErrorLogFields(error),
      attempt: 1,
    });
    await wait(TRANSIENT_RETRY_DELAY_MS);
    signInAttempts = 2;
    try {
      authResult = await supabase.auth.signInWithPassword({ email, password });
    } catch (retryError) {
      const retryFailure = classifyLoginFailure(retryError);
      console.error("[auth/login] Supabase Auth retry failed", {
        ...loginErrorLogFields(retryError),
        attempt: 2,
      });
      return NextResponse.json(
        { error: retryFailure.code },
        { status: retryFailure.status, headers: { "Retry-After": "3" } }
      );
    }
  }

  const { data, error } = authResult;

  if (error) {
    const failure = classifyLoginFailure(error);
    console.error("[auth/login] Supabase Auth sign-in rejected", {
      ...loginErrorLogFields(error),
      attempt: signInAttempts,
    });
    return NextResponse.json(
      { error: failure.code },
      {
        status: failure.status,
        ...(failure.retryable ? { headers: { "Retry-After": "3" } } : {}),
      }
    );
  }

  if (!data.user) {
    console.error("[auth/login] Supabase Auth returned no user without an error");
    return NextResponse.json({ error: "auth_failed" }, { status: 502 });
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
