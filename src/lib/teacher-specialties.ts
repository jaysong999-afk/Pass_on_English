import type { TeacherSpecialty } from "@/types";

/** Fixed specialty options for teacher public profiles (multi-select) */
export const TEACHER_SPECIALTY_OPTIONS: TeacherSpecialty[] = [
  "Beginners",
  "Adult",
  "Phonics",
  "Business",
  "Debate",
  "IELTS Speeking",
  "Storytelling",
  "Patient",
  "Energetic",
  "Encouraging",
  "Friendly",
  "Interactive",
  "Detail-Oriented",
  "Academic",
  "Interview Prep",
];

export function isTeacherSpecialty(value: string): value is TeacherSpecialty {
  return TEACHER_SPECIALTY_OPTIONS.includes(value as TeacherSpecialty);
}
