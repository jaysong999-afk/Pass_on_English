import type { TeacherApplication } from "@/types";

/** Client fetch helper — list applications from server */
export async function fetchTeacherApplications(): Promise<TeacherApplication[]> {
  const res = await fetch("/api/teacher/applications");
  if (!res.ok) return [];
  const data = (await res.json()) as { applications?: TeacherApplication[] };
  return data.applications ?? [];
}

/** Client fetch helper — submit application */
export async function submitTeacherApplication(
  input: Omit<TeacherApplication, "id" | "status" | "submittedAt">
): Promise<TeacherApplication | null> {
  const res = await fetch("/api/teacher/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { application?: TeacherApplication };
  return data.application ?? null;
}

/** Client fetch helper — fetch single application */
export async function fetchTeacherApplicationById(
  id: string
): Promise<TeacherApplication | null> {
  const res = await fetch(`/api/teacher/applications?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { application?: TeacherApplication };
  return data.application ?? null;
}
