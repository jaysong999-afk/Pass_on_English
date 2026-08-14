import type { TeacherApplication, TeacherSignupInput } from "@/types";

export type TeacherApplicationSubmitResult =
  | { ok: true; application: TeacherApplication }
  | { ok: false; error: string };

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Please fill in all required fields.",
  password_too_short: "Password must be at least 8 characters.",
  email_already_registered: "An account with this email already exists. Try signing in instead.",
  signup_rate_limited: "Too many signup attempts. Please wait a minute and try again.",
  application_create_failed: "Could not save your application. Please try again.",
  profile_update_failed: "Could not complete registration. Please try again.",
  signup_failed: "Something went wrong. Please try again.",
};

export type FetchTeacherApplicationResult =
  | { ok: true; application: TeacherApplication }
  | { ok: false; error: "unauthorized" | "forbidden" | "not_found" | "network" };

export function teacherApplicationErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.signup_failed;
}

/** Client fetch helper — list applications from server */
export async function fetchTeacherApplications(): Promise<TeacherApplication[]> {
  const res = await fetch("/api/teacher/applications");
  if (!res.ok) return [];
  const data = (await res.json()) as { applications?: TeacherApplication[] };
  return data.applications ?? [];
}

/** Client fetch helper — submit application with auth account creation */
export async function submitTeacherApplication(
  input: TeacherSignupInput
): Promise<TeacherApplicationSubmitResult> {
  const res = await fetch("/api/teacher/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await res.json()) as { application?: TeacherApplication; error?: string };

  if (!res.ok) {
    return { ok: false, error: data.error ?? "signup_failed" };
  }

  if (!data.application) {
    return { ok: false, error: "signup_failed" };
  }

  return { ok: true, application: data.application };
}

/** Client fetch helper — fetch single application (requires teacher session) */
export async function fetchTeacherApplicationById(
  id: string
): Promise<FetchTeacherApplicationResult> {
  try {
    const res = await fetch(`/api/teacher/applications?id=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { application?: TeacherApplication; error?: string };

    if (res.status === 401) {
      return { ok: false, error: "unauthorized" };
    }
    if (res.status === 403) {
      return { ok: false, error: "forbidden" };
    }
    if (res.status === 404 || !data.application) {
      return { ok: false, error: "not_found" };
    }
    if (!res.ok) {
      return { ok: false, error: "network" };
    }

    return { ok: true, application: data.application };
  } catch {
    return { ok: false, error: "network" };
  }
}
