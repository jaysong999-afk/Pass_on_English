import type { AuthContext } from "@/lib/auth/types";
import { forbidden, unauthorized } from "@/lib/auth/errors";
import { getAuthContext, requireTeacherAuth } from "@/lib/auth/session";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";

export async function authorizeAvailabilityRead(rawTeacherId: string): Promise<{
  teacherId: string;
  context: AuthContext;
}> {
  const teacherId = resolveTeacherId(rawTeacherId);
  if (!teacherId) {
    throw unauthorized();
  }

  const context = await getAuthContext();
  if (!context) {
    throw unauthorized();
  }

  if (context.profile.role === "admin") {
    return { teacherId, context };
  }

  if (context.profile.role === "teacher") {
    if (context.userId !== teacherId) {
      throw forbidden("teacher_mismatch");
    }
    return { teacherId, context };
  }

  throw forbidden();
}

export async function authorizeAvailabilityWrite(
  rawTeacherId: string | undefined,
  action: string | undefined
): Promise<{ teacherId: string; context: AuthContext }> {
  if (action === "reserve") {
    const context = await getAuthContext();
    if (!context) {
      throw unauthorized();
    }
    if (context.profile.role !== "student") {
      throw forbidden();
    }

    const teacherId = resolveTeacherId(rawTeacherId ?? "");
    if (!teacherId) {
      throw forbidden("teacher_not_found");
    }

    return { teacherId, context };
  }

  const teacherAuth = await requireTeacherAuth();
  const teacherId = resolveTeacherId(rawTeacherId ?? teacherAuth.teacherId);
  if (!teacherId || teacherId !== teacherAuth.teacherId) {
    throw forbidden("teacher_mismatch");
  }

  return { teacherId, context: teacherAuth };
}
