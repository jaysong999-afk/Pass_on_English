import type { Lesson, TeacherStudentContext } from "@/types";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getFeedbacksByStudent } from "@/lib/learning-store";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getTeacherStudentContext } from "@/lib/teacher-student-context-store";

export interface LessonDisplayContext {
  lesson: Lesson;
  englishName: string;
  age: number | null;
  englishLevel: string;
  videoPlatform: TeacherStudentContext["videoPlatform"];
  textbook: string;
  lastProgressPages: string | null;
  lastHomework: string | null;
  specialNotes: string | null;
  studentContext: TeacherStudentContext;
}

function calcAge(dateOfBirth: string | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function buildLessonDisplayContext(lesson: Lesson): LessonDisplayContext | null {
  if (!lesson.studentId) return null;

  const directoryEntry = getStudentDirectoryEntry(lesson.studentId);
  const student = directoryEntry?.student;
  const studentContext = getTeacherStudentContext(lesson.studentId, lesson.teacherId);

  const priorFeedback = getFeedbacksByStudent(lesson.studentId).find(
    (f) => new Date(f.lessonDate).getTime() < new Date(lesson.scheduledAt).getTime()
  );

  return {
    lesson,
    englishName: student
      ? getStudentDisplayName(student)
      : lesson.studentName ?? "Student",
    age: calcAge(student?.dateOfBirth),
    englishLevel: student?.englishLevel ?? "—",
    videoPlatform: studentContext.videoPlatform,
    textbook: studentContext.textbook,
    lastProgressPages: priorFeedback?.progressPages ?? priorFeedback?.topic ?? null,
    lastHomework: priorFeedback?.homework ?? null,
    specialNotes: studentContext.specialNotes ?? null,
    studentContext,
  };
}
