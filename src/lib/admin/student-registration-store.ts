import type { AccountType, CefrLevel, CountryCode, CoursePurpose, RegistrationStatus, StudentRegistrationReview } from "@/types";

const SEED: StudentRegistrationReview[] = [
  {
    id: "student-4",
    accountHolderName: "김영희",
    accountEmail: "parent@example.com",
    accountPhone: "010-1234-5678",
    accountType: "guardian",
    country: "KR",
    learnerFullName: "김서연",
    learnerEnglishName: "Seoyeon Kim",
    learnerDateOfBirth: "2017-08-20",
    englishLevel: "A2",
    purposes: ["phonics", "graded_reading"],
    submittedAt: "2026-07-10T00:00:00.000Z",
    status: "pending",
  },
];

let registrations: StudentRegistrationReview[] = structuredClone(SEED);

export function getPendingStudentRegistrations(): StudentRegistrationReview[] {
  return registrations
    .filter((r) => r.status === "pending")
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((r) => ({
      ...r,
      purposes: r.purposes ? [...r.purposes] : undefined,
    }));
}

export function getStudentRegistrationById(id: string): StudentRegistrationReview | null {
  const item = registrations.find((r) => r.id === id);
  if (!item) return null;
  return {
    ...item,
    purposes: item.purposes ? [...item.purposes] : undefined,
  };
}

export interface RegisterStudentReviewInput {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone: string;
  country: CountryCode;
  learnerFullName: string;
  learnerEnglishName: string;
  learnerDateOfBirth: string;
  learnerId: string;
  englishLevel?: CefrLevel;
  purposes?: CoursePurpose[];
}

export function registerStudentForReview(input: RegisterStudentReviewInput): StudentRegistrationReview {
  const existing = registrations.find((r) => r.id === input.learnerId);
  if (existing) {
    return getStudentRegistrationById(input.learnerId)!;
  }

  const review: StudentRegistrationReview = {
    id: input.learnerId,
    accountHolderName: input.fullName.trim(),
    accountEmail: input.email.trim(),
    accountPhone: input.phone.trim(),
    accountType: input.accountType,
    country: input.country,
    learnerFullName: input.learnerFullName.trim(),
    learnerEnglishName: input.learnerEnglishName.trim(),
    learnerDateOfBirth: input.learnerDateOfBirth,
    submittedAt: new Date().toISOString(),
    status: "pending",
  };

  registrations.unshift(review);
  return { ...review };
}

export function updateStudentRegistrationStatus(
  id: string,
  status: RegistrationStatus
): StudentRegistrationReview | null {
  const index = registrations.findIndex((r) => r.id === id);
  if (index === -1) return null;
  registrations[index] = { ...registrations[index], status };
  return getStudentRegistrationById(id);
}

/** @internal */
export function resetStudentRegistrationStore() {
  registrations = structuredClone(SEED);
}
