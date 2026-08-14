import type { StudentRegistrationReview } from "@/types";
import { clearStudentRegistrationCache, getStudentRegistrationCache } from "@/lib/student-registrations/registration-cache";

export function getPendingStudentRegistrations(): StudentRegistrationReview[] {
  return getStudentRegistrationCache()
    .filter((r) => r.status === "pending")
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((r) => ({
      ...r,
      purposes: r.purposes ? [...r.purposes] : undefined,
    }));
}

export function getStudentRegistrationById(id: string): StudentRegistrationReview | null {
  const item = getStudentRegistrationCache().find((r) => r.id === id);
  return item
    ? { ...item, purposes: item.purposes ? [...item.purposes] : undefined }
    : null;
}

/** @internal */
export function resetStudentRegistrationStore() {
  clearStudentRegistrationCache();
}

export type { RegisterStudentReviewInput } from "@/lib/student-registrations/repository";
