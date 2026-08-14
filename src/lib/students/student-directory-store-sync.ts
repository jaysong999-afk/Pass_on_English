import type { StudentDirectoryEntry } from "@/lib/students/student-directory-cache";
import {
  getStudentDirectoryCache,
  getStudentDirectoryEntryById,
} from "@/lib/students/student-directory-cache";

export function getStudentDirectoryEntry(id: string): StudentDirectoryEntry | undefined {
  return getStudentDirectoryEntryById(id);
}

export function getAllStudentDirectoryEntries(): StudentDirectoryEntry[] {
  return getStudentDirectoryCache().map((entry) => ({
    ...entry,
    student: { ...entry.student },
    learner: { ...entry.learner },
    accountHolder: entry.accountHolder ? { ...entry.accountHolder } : undefined,
  }));
}
