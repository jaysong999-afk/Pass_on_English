import type {
  AccountHolder,
  AccountSession,
  AccountType,
  CefrLevel,
  CountryCode,
  CoursePurpose,
  Learner,
  PaymentStatus,
  RegistrationStatus,
} from "@/types";
import { registerStudentForReview } from "@/lib/admin/student-registration-store";

const DEFAULT_ACCOUNT: AccountHolder = {
  id: "account-1",
  fullName: "김영희",
  email: "parent@example.com",
  phone: "010-1234-5678",
  country: "KR",
  accountType: "guardian",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const DEFAULT_LEARNERS: Learner[] = [
  {
    id: "student-1",
    accountHolderId: "account-1",
    fullName: "김민준",
    englishName: "Minjun Kim",
    dateOfBirth: "2015-03-15",
    englishLevel: "A1",
    purposes: ["daily_conversation", "phonics"],
    trialUsed: true,
    paymentStatus: "confirmed",
    registrationStatus: "confirmed",
    planLabel: "주5회(월~금) 20분 (20회)",
    teacherName: "Sarah Mitchell",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "student-4",
    accountHolderId: "account-1",
    fullName: "김서연",
    englishName: "Seoyeon Kim",
    dateOfBirth: "2017-08-20",
    englishLevel: "A2",
    purposes: ["phonics", "graded_reading"],
    trialUsed: false,
    paymentStatus: "pending",
    registrationStatus: "pending",
    createdAt: "2026-07-10T00:00:00.000Z",
  },
];

let account: AccountHolder = { ...DEFAULT_ACCOUNT };
let learners: Learner[] = structuredClone(DEFAULT_LEARNERS);
let activeLearnerId = "student-1";

function cloneLearner(l: Learner): Learner {
  return {
    ...l,
    purposes: l.purposes ? [...l.purposes] : undefined,
  };
}

export function getAccountSession(): AccountSession {
  return {
    account: { ...account },
    learners: learners.map(cloneLearner),
    activeLearnerId,
  };
}

export function getAccountHolder(): AccountHolder {
  return { ...account };
}

export function getLearnersForAccount(accountId = account.id): Learner[] {
  return learners.filter((l) => l.accountHolderId === accountId).map(cloneLearner);
}

export function getLearnerById(id: string): Learner | undefined {
  const l = learners.find((x) => x.id === id);
  return l ? cloneLearner(l) : undefined;
}

export function getActiveLearner(): Learner {
  const l = learners.find((x) => x.id === activeLearnerId);
  if (!l) {
    throw new Error("active_learner_not_found");
  }
  return cloneLearner(l);
}

export function setActiveLearner(learnerId: string): Learner | null {
  if (!learners.some((l) => l.accountHolderId === account.id && l.id === learnerId)) {
    return null;
  }
  activeLearnerId = learnerId;
  return getActiveLearner();
}

export interface RegisterAccountInput {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone: string;
  country: CountryCode;
  learnerFullName: string;
  learnerEnglishName: string;
  learnerDateOfBirth: string;
}

export function registerAccount(input: RegisterAccountInput): AccountSession {
  const accountId = `account-${Date.now()}`;
  const learnerId = `student-${Date.now()}`;

  account = {
    id: accountId,
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    country: input.country,
    accountType: input.accountType,
    createdAt: new Date().toISOString(),
  };

  learners = [
    {
      id: learnerId,
      accountHolderId: accountId,
      fullName: input.learnerFullName.trim(),
      englishName: input.learnerEnglishName.trim(),
      dateOfBirth: input.learnerDateOfBirth,
      trialUsed: false,
      paymentStatus: "pending",
      registrationStatus: "pending",
      createdAt: new Date().toISOString(),
    },
  ];
  activeLearnerId = learnerId;

  registerStudentForReview({
    ...input,
    learnerId,
  });

  return getAccountSession();
}

export interface AddLearnerInput {
  fullName: string;
  englishName: string;
  dateOfBirth: string;
}

export function addLearner(input: AddLearnerInput): Learner {
  const learner: Learner = {
    id: `student-${Date.now()}`,
    accountHolderId: account.id,
    fullName: input.fullName.trim(),
    englishName: input.englishName.trim(),
    dateOfBirth: input.dateOfBirth,
    trialUsed: false,
    paymentStatus: "pending",
    registrationStatus: "pending",
    createdAt: new Date().toISOString(),
  };
  learners.push(learner);
  activeLearnerId = learner.id;

  registerStudentForReview({
    accountType: "guardian",
    fullName: account.fullName,
    email: account.email,
    phone: account.phone,
    country: account.country,
    learnerFullName: input.fullName.trim(),
    learnerEnglishName: input.englishName.trim(),
    learnerDateOfBirth: input.dateOfBirth,
    learnerId: learner.id,
  });

  return cloneLearner(learner);
}

export interface LearnerSurveyInput {
  englishLevel: CefrLevel;
  purposes: CoursePurpose[];
  surveyNotes?: string;
}

export function updateLearnerSurvey(learnerId: string, input: LearnerSurveyInput): Learner | null {
  const index = learners.findIndex((l) => l.id === learnerId);
  if (index === -1) return null;

  learners[index] = {
    ...learners[index],
    englishLevel: input.englishLevel,
    purposes: [...input.purposes],
    surveyNotes: input.surveyNotes?.trim() || undefined,
  };
  return cloneLearner(learners[index]);
}

export interface BookTrialInput {
  scheduledAt: string;
  trialLessonId: string;
}

export function bookTrialForLearner(learnerId: string, input: BookTrialInput): Learner | null {
  const index = learners.findIndex((l) => l.id === learnerId);
  if (index === -1) return null;
  if (learners[index].trialUsed) return null;

  learners[index] = {
    ...learners[index],
    trialUsed: true,
    trialScheduledAt: input.scheduledAt,
    trialLessonId: input.trialLessonId,
  };
  return cloneLearner(learners[index]);
}

export function updateLearnerEnrollmentMeta(
  learnerId: string,
  input: {
    paymentStatus?: PaymentStatus;
    planLabel?: string;
    teacherName?: string;
  }
): Learner | null {
  const index = learners.findIndex((l) => l.id === learnerId);
  if (index === -1) return null;

  learners[index] = {
    ...learners[index],
    paymentStatus: input.paymentStatus ?? learners[index].paymentStatus,
    planLabel: input.planLabel ?? learners[index].planLabel,
    teacherName: input.teacherName ?? learners[index].teacherName,
  };
  return cloneLearner(learners[index]);
}

export function updateLearnerRegistrationStatus(
  learnerId: string,
  registrationStatus: RegistrationStatus
): Learner | null {
  const index = learners.findIndex((l) => l.id === learnerId);
  if (index === -1) return null;

  learners[index] = {
    ...learners[index],
    registrationStatus,
  };
  return cloneLearner(learners[index]);
}

/** @internal */
export function resetAccountStore() {
  account = { ...DEFAULT_ACCOUNT };
  learners = structuredClone(DEFAULT_LEARNERS);
  activeLearnerId = "student-1";
}
