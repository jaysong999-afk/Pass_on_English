import type {
  AccountHolder,
  AccountSession,
  Learner,
  PaymentStatus,
  RegistrationStatus,
} from "@/types";
import { getAccountSessionCache, patchAccountSessionCache } from "@/lib/account-session-cache";

function requireCachedSession(): AccountSession {
  const session = getAccountSessionCache();
  if (!session) {
    throw new Error("account_session_not_loaded");
  }
  return session;
}

function cloneLearner(l: Learner): Learner {
  return {
    ...l,
    purposes: l.purposes ? [...l.purposes] : undefined,
  };
}

export function getAccountSession(): AccountSession {
  const session = requireCachedSession();
  return {
    account: { ...session.account },
    learners: session.learners.map(cloneLearner),
    activeLearnerId: session.activeLearnerId,
  };
}

export function getAccountHolder(): AccountHolder {
  return { ...requireCachedSession().account };
}

export function getLearnersForAccount(accountId?: string): Learner[] {
  const session = requireCachedSession();
  const holderId = accountId ?? session.account.id;
  return session.learners
    .filter((l) => l.accountHolderId === holderId)
    .map(cloneLearner);
}

export function getLearnerById(id: string): Learner | undefined {
  const session = requireCachedSession();
  const learner = session.learners.find((x) => x.id === id);
  return learner ? cloneLearner(learner) : undefined;
}

export function getActiveLearner(): Learner {
  const session = requireCachedSession();
  const learner = session.learners.find((x) => x.id === session.activeLearnerId);
  if (!learner) {
    throw new Error("active_learner_not_found");
  }
  return cloneLearner(learner);
}

function patchLearnerInSession(learnerId: string, patch: Partial<Learner>): Learner | null {
  const session = getAccountSessionCache();
  if (!session) return null;

  const index = session.learners.findIndex((l) => l.id === learnerId);
  if (index === -1) return null;

  const updatedLearner = {
    ...session.learners[index],
    ...patch,
  };

  patchAccountSessionCache({
    ...session,
    learners: session.learners.map((l) => (l.id === learnerId ? updatedLearner : l)),
  });

  return updatedLearner;
}

export function updateLearnerEnrollmentMeta(
  learnerId: string,
  input: {
    paymentStatus?: PaymentStatus;
    planLabel?: string;
    teacherName?: string;
  }
): Learner | null {
  const session = getAccountSessionCache();
  if (!session) return null;
  const existing = session.learners.find((l) => l.id === learnerId);
  if (!existing) return null;

  return patchLearnerInSession(learnerId, {
    paymentStatus: input.paymentStatus ?? existing.paymentStatus,
    planLabel: input.planLabel ?? existing.planLabel,
    teacherName: input.teacherName ?? existing.teacherName,
  });
}

export function updateLearnerRegistrationStatus(
  learnerId: string,
  registrationStatus: RegistrationStatus
): Learner | null {
  return patchLearnerInSession(learnerId, { registrationStatus });
}
