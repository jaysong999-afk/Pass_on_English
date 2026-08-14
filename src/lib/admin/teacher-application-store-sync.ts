import type { TeacherApplication } from "@/types";
import { getTeacherApplicationCache } from "@/lib/teacher-applications/application-cache";

export function listTeacherApplications(): TeacherApplication[] {
  return getTeacherApplicationCache()
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((a) => ({ ...a }));
}

export function getPendingTeacherApplications(): TeacherApplication[] {
  return listTeacherApplications().filter((a) => a.status === "pending");
}

export function getTeacherApplicationById(id: string): TeacherApplication | null {
  const item = getTeacherApplicationCache().find((a) => a.id === id);
  return item ? { ...item } : null;
}
