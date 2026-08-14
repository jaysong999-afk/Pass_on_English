import type { AccountHolder, Learner, Student } from "@/types";

export interface StudentDirectoryEntry {
  student: Student;
  learner: Learner;
  accountHolder?: AccountHolder;
  isActive: boolean;
}

let entries: StudentDirectoryEntry[] = [];

export function getStudentDirectoryCache(): StudentDirectoryEntry[] {
  return entries;
}

export function getStudentDirectoryEntryById(id: string): StudentDirectoryEntry | undefined {
  return entries.find((e) => e.student.id === id);
}

export function setStudentDirectoryCache(next: StudentDirectoryEntry[]) {
  entries = next.map((e) => ({
    ...e,
    student: { ...e.student },
    learner: { ...e.learner },
    accountHolder: e.accountHolder ? { ...e.accountHolder } : undefined,
  }));
}

export function clearStudentDirectoryCache() {
  entries = [];
}
