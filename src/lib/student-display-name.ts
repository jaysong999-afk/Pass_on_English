/** Student-facing display name — prefers signup englishName over legal fullName. */
export function getStudentDisplayName(student: {
  englishName?: string | null;
  fullName: string;
}): string {
  const english = student.englishName?.trim();
  return english || student.fullName;
}
