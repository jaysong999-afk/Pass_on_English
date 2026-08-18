export type {
  AddLearnerInput,
  BookTrialInput,
  LearnerSurveyInput,
  RegisterAccountInput,
} from "@/lib/account-store.types";

export {
  getAccountSession,
  getAccountHolder,
  getLearnersForAccount,
  getLearnerById,
  getActiveLearner,
  updateLearnerEnrollmentMeta,
  updateLearnerRegistrationStatus,
} from "@/lib/account-store-sync";

export {
  ensureAccountSession,
  loadAccountSession,
  getAccountSessionFromDb,
  updateAccountProfileInDb as updateAccountProfile,
  registerAccountInDb as registerAccount,
  addLearnerInDb as addLearner,
  setActiveLearnerInDb as setActiveLearner,
  updateLearnerSurveyInDb as updateLearnerSurvey,
  bookTrialForLearnerInDb as bookTrialForLearner,
} from "@/lib/accounts/repository";

/** @internal */
export function resetAccountStore() {
  // Session is loaded from Supabase per authenticated user.
}
