import type { TeacherStudentContext, VideoPlatform } from "@/types";
import {
  getTeacherStudentContextCache,
  setTeacherStudentContextCacheEntry,
} from "@/lib/teacher-student-context-cache";

function defaultPlatform(_studentId: string): VideoPlatform {
  return "ZOOM";
}

function ensureContext(studentId: string, teacherId: string): TeacherStudentContext {
  const cached = getTeacherStudentContextCache(studentId, teacherId);
  if (cached) return cached;

  const fallback: TeacherStudentContext = {
    studentId,
    teacherId,
    textbook: "",
    textbookHistory: [],
    videoPlatform: defaultPlatform(studentId),
  };
  setTeacherStudentContextCacheEntry(fallback);
  return { ...fallback };
}

export function getTeacherStudentContext(
  studentId: string,
  teacherId: string
): TeacherStudentContext {
  return ensureContext(studentId, teacherId);
}

export function updateTeacherStudentContext(
  studentId: string,
  teacherId: string,
  patch: Partial<
    Pick<TeacherStudentContext, "textbook" | "textbookHistory" | "videoPlatform" | "specialNotes">
  >
): TeacherStudentContext {
  const current = ensureContext(studentId, teacherId);
  const updated: TeacherStudentContext = {
    ...current,
    ...patch,
    textbook: patch.textbook !== undefined ? patch.textbook.trim() : current.textbook,
    specialNotes:
      patch.specialNotes !== undefined
        ? patch.specialNotes.trim() || undefined
        : current.specialNotes,
  };
  setTeacherStudentContextCacheEntry(updated);
  return { ...updated };
}

import { clearTeacherStudentContextCache } from "@/lib/teacher-student-context-cache";

/** @internal */
export function resetTeacherStudentContextStore() {
  clearTeacherStudentContextCache();
}
