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

export function patchStudentDirectoryEntry(next: StudentDirectoryEntry) {
  const cloned = {
    ...next,
    student: { ...next.student },
    learner: { ...next.learner },
    accountHolder: next.accountHolder ? { ...next.accountHolder } : undefined,
  };
  const index = entries.findIndex((entry) => entry.student.id === next.student.id);
  if (index === -1) entries.push(cloned);
  else entries[index] = cloned;
}

export function clearStudentDirectoryCache() {
  entries = [];
}
