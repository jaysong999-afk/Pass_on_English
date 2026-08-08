import type { TeacherStudentContext, VideoPlatform } from "@/types";
import { getStudent } from "@/lib/mock-data";

const SEED: TeacherStudentContext[] = [
  {
    studentId: "student-1",
    teacherId: "teacher-1",
    textbook: "Oxford Phonics World 2",
    videoPlatform: "ZOOM",
    specialNotes: "Prefers visual cues. Parent joins first 2 min on Mondays.",
  },
  {
    studentId: "student-2",
    teacherId: "teacher-1",
    textbook: "Business Result Intermediate",
    videoPlatform: "VOOV",
    specialNotes: "Corporate learner — focus on presentation skills.",
  },
  {
    studentId: "student-3",
    teacherId: "teacher-1",
    textbook: "Speaker English Intermediate",
    videoPlatform: "ZOOM",
    specialNotes: "Interested in current affairs topics.",
  },
];

const store = new Map<string, TeacherStudentContext>();

function contextKey(studentId: string, teacherId: string) {
  return `${teacherId}|${studentId}`;
}

function defaultPlatform(studentId: string): VideoPlatform {
  const student = getStudent(studentId);
  return student?.country === "CN" ? "VOOV" : "ZOOM";
}

function ensureContext(studentId: string, teacherId: string): TeacherStudentContext {
  const key = contextKey(studentId, teacherId);
  if (!store.has(key)) {
    const seed = SEED.find((s) => s.studentId === studentId && s.teacherId === teacherId);
    store.set(
      key,
      seed ?? {
        studentId,
        teacherId,
        textbook: "",
        videoPlatform: defaultPlatform(studentId),
      }
    );
  }
  return { ...store.get(key)! };
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
  patch: Partial<Pick<TeacherStudentContext, "textbook" | "videoPlatform" | "specialNotes">>
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
  store.set(contextKey(studentId, teacherId), updated);
  return { ...updated };
}
