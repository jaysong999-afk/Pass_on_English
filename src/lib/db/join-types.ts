export interface TeacherNameDbJoin {
  display_name: string | null;
}

export interface StudentNameDbJoin {
  english_name: string | null;
  full_name: string | null;
}

export function teacherNameFromDb(
  teacher: TeacherNameDbJoin | null | undefined,
  fallback = "Teacher"
): string {
  return teacher?.display_name?.trim() || fallback;
}

export function studentNameFromDb<T extends string | undefined>(
  student: StudentNameDbJoin | null | undefined,
  fallback: T
): string | T {
  return student?.english_name?.trim() || student?.full_name?.trim() || fallback;
}
