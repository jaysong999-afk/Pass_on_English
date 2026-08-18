import { getTeacherFromCache } from "@/lib/teachers/teacher-profile-cache";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Resolve an exact teacher UUID or a known cached identifier without guessing. */
export function resolveTeacherId(teacherId?: string): string | undefined {
  if (!teacherId) return undefined;
  if (isUuid(teacherId)) return teacherId;
  return getTeacherFromCache(teacherId)?.id;
}
