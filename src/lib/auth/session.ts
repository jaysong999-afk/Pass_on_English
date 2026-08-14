import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient, getBearerAccessToken } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { AuthContext, AuthProfile, UserRole } from "@/lib/auth/types";
import { AuthError, forbidden, unauthorized, wrongRole } from "@/lib/auth/errors";

interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string | null;
  locale: string | null;
}

function rowToProfile(row: ProfileRow): AuthProfile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    locale: row.locale,
  };
}

export async function fetchAuthProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, locale")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`profile_fetch_failed: ${error.message}`);
  }

  if (!data) return null;
  return rowToProfile(data as ProfileRow);
}

export async function fetchAuthProfilePrivileged(userId: string): Promise<AuthProfile | null> {
  const supabase = createPrivilegedClient();
  return fetchAuthProfile(supabase, userId);
}

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const accessToken = await getBearerAccessToken();
  const {
    data: { user },
    error,
  } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (
      error.name === "AuthSessionMissingError" ||
      message.includes("auth session missing") ||
      message.includes("jwt")
    ) {
      return null;
    }
    throw new Error(`auth_get_user_failed: ${error.message}`);
  }

  return user;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  let profile = await fetchAuthProfile(supabase, user.id);
  if (!profile) {
    profile = await fetchAuthProfilePrivileged(user.id);
  }
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw unauthorized();
  }
  return context;
}

export async function requireRole(role: UserRole): Promise<AuthContext> {
  const context = await requireAuthContext();
  if (context.profile.role !== role) {
    throw wrongRole(role, context.profile.role);
  }
  return context;
}

export async function requireTeacherAuth(): Promise<AuthContext & { teacherId: string }> {
  const context = await requireRole("teacher");
  const supabase = createPrivilegedClient();
  const { data: teacher, error } = await supabase
    .from("teachers")
    .select("id, status")
    .eq("id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_lookup_failed: ${error.message}`);
  }

  if (!teacher) {
    throw forbidden("teacher_profile_not_found");
  }

  if (teacher.status !== "active") {
    throw forbidden("teacher_not_active");
  }

  return { ...context, teacherId: teacher.id as string };
}

export async function assertTeacherIsActive(userId: string): Promise<void> {
  const supabase = createPrivilegedClient();
  const { data: teacher, error } = await supabase
    .from("teachers")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_lookup_failed: ${error.message}`);
  }

  if (!teacher || teacher.status !== "active") {
    throw forbidden("teacher_not_active");
  }
}

export async function resolveTeacherIdFromAuth(fallback?: string): Promise<string | undefined> {
  const context = await getAuthContext();
  if (context?.profile.role === "teacher") {
    return context.userId;
  }
  return fallback;
}

export async function requireStudentAuth(): Promise<AuthContext> {
  return requireRole("student");
}

export async function requireAdminAuth(): Promise<AuthContext> {
  return requireRole("admin");
}

/** Ensures the learner belongs to the authenticated student account. */
export async function assertLearnerAccess(learnerId: string): Promise<AuthContext> {
  const context = await requireStudentAuth();
  const supabase = createPrivilegedClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id")
    .eq("id", learnerId)
    .eq("account_holder_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`learner_lookup_failed: ${error.message}`);
  }

  if (!student) {
    throw forbidden("learner_not_found");
  }

  return context;
}
