import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import {
  getAllTeachersFromCache,
  getTeacherFromCache,
} from "@/lib/teachers/teacher-profile-cache";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Map demo teacher id (teacher-1) or slug to Supabase teacher uuid when cache is warm. */
export function resolveTeacherId(teacherId?: string): string | undefined {
  if (!teacherId) return getAllTeachersFromCache()[0]?.id;
  if (isUuid(teacherId)) return teacherId;
  if (teacherId === CURRENT_TEACHER_ID) {
    return (
      getTeacherFromCache(CURRENT_TEACHER_ID)?.id ?? getAllTeachersFromCache()[0]?.id
    );
  }
  return getTeacherFromCache(teacherId)?.id ?? getAllTeachersFromCache()[0]?.id;
}
