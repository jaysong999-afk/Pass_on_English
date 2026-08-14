export type UserRole = "student" | "teacher" | "admin";
export type CountryCode = "KR" | "CN" | "OTHER";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type CoursePurpose =
  | "daily_conversation"
  | "phonics"
  | "graded_reading"
  | "debate"
  | "adult_conversation"
  | "business_english"
  | "current_affairs";
export type LessonStatus =
  | "pending_payment"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "reschedule_pending";

/** Admin / payroll flags for lesson operations */
export type LessonCancelReason =
  | "teacher_no_show"
  | "student_absence_admin"
  | "holiday"
  | "admin_unpaid_cancel"
  | "other";
export type PaymentStatus = "pending" | "reported" | "confirmed" | "rejected";

export type TeacherSpecialty =
  | "Beginners"
  | "Adult"
  | "Phonics"
  | "Business"
  | "Debate"
  | "IELTS Speeking"
  | "Storytelling"
  | "Patient"
  | "Energetic"
  | "Encouraging"
  | "Friendly"
  | "Interactive"
  | "Detail-Oriented"
  | "Academic"
  | "Interview Prep";

export type EnrollmentStatus = "active" | "expiring_soon" | "completed" | "pending_payment" | "cancelled";

export interface SessionAdjustment {
  id: string;
  at: string;
  adminName: string;
  deltaRemaining: number;
  previousRemaining: number;
  newRemaining: number;
  previousTotal: number;
  newTotal: number;
  reason?: string;
}

export interface StudentEnrollment {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  teacherAvatarUrl?: string;
  planId: string;
  planLabel: string;
  curriculum: string;
  /** 이번 달(또는 현재 수강 기간) 전체 수업 횟수 */
  sessionsTotal: number;
  /** 잔여 수업 횟수 — 관리자가 가감 가능 */
  sessionsRemaining: number;
  startDate: string;
  endDate: string;
  status: EnrollmentStatus;
  paymentStatus: PaymentStatus;
  amountKrw: number;
  adjustments?: SessionAdjustment[];
  /** 수강 신청 시 선택한 주간 시간 (플랜 요일 모두 동일 시간) */
  preferredSlotTime?: string;
  preferredSlotDay?: string;
  /** Copied from the pricing plan for student-facing schedule display */
  scheduleDays?: string[];
  sessionMinutes?: number;
  /** 재수강 시 이전 수강 계약 ID */
  renewedFromEnrollmentId?: string;
  /** Student confirmed application (hold starts) */
  confirmedAt?: string;
  /** Server deadline for payment (15h from confirm, trial end, or last-lesson end) */
  paymentDeadlineAt?: string;
  /** Student may apply for renewal (lessons exist through last-lesson-end + 12h). API-computed. */
  canStudentRenew?: boolean;
  renewalWindowStatus?: "ineligible" | "not_open" | "open" | "student_closed" | "expired";
  renewalLastLessonEndedAt?: string;
  renewalStudentDeadlineAt?: string;
  renewalHoldDeadlineAt?: string;
  /** True when this pending renewal is the post-last-lesson 12h/15h occupancy hold. */
  renewalIsLastLessonHold?: boolean;
  /** True when the hold was auto-created at last-lesson end (student has not applied yet). */
  renewalIsSystemAutoOffer?: boolean;
  cancelReason?: string;
  /** True when this enrollment was created with a free trial lesson (paid sessions start after trial). */
  includesTrial?: boolean;
}

export interface PaymentRecord {
  id: string;
  studentId: string;
  enrollmentId?: string;
  label: string;
  amountKrw: number;
  paidAt: string;
  status: PaymentStatus;
  depositorName?: string;
}

/** 수업 후 강사 피드백 */
export interface LessonFeedback {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  lessonDate: string;
  topic?: string;
  feedback: string;
  homework?: string;
  /** Textbook page progress e.g. "p. 12–14" */
  progressPages?: string;
  createdAt: string;
  readAt?: string;
}

/** 월말 성장 레포트 */
export interface MonthlyGrowthReport {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  /** YYYY-MM */
  month: string;
  title: string;
  /** 이번 달에 수업한 내용 */
  lessonsCovered: string;
  /** 개선된 점 */
  progressMade: string;
  /** 노력해야 할 부분 */
  areasToWorkOn: string;
  /** 다음 달 목표 */
  nextMonthGoals: string;
  /** 선생님 총평 */
  overallComment: string;
  publishedAt: string;
  readAt?: string;
}

export interface Teacher {
  id: string;
  displayName: string;
  bio: string;
  specialties: TeacherSpecialty[];
  experienceYears: number;
  avatarUrl?: string;
  status: "pending" | "active" | "on_leave" | "terminated";
  availableDays: string[];
  hourlyRatePhp: number;
  /** Linked signup application (pending teachers) */
  applicationId?: string;
  /** Public profile filled (signup step 2 or admin) */
  profileCompleted: boolean;
  email?: string;
}

export interface TeacherProfileInput {
  displayName: string;
  bio: string;
  specialties: TeacherSpecialty[];
  experienceYears: number;
  avatarUrl?: string;
  status?: Teacher["status"];
  hourlyRatePhp?: number;
}

/** Teacher self-registration payload (pending admin approval) */
export interface TeacherApplication {
  id: string;
  fullName: string;
  dateOfBirth: string;
  phone: string;
  bankAccount: string;
  facebookMessengerId: string;
  address: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  /** Linked teachers.id after signup profile step (Package B) */
  teacherId?: string | null;
}

export interface TeacherSignupInput {
  fullName: string;
  dateOfBirth: string;
  phone: string;
  bankAccount: string;
  facebookMessengerId: string;
  address: string;
  email: string;
  password: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  /** Chinese display name for zh-CN landing & student portal */
  nameZh?: string;
  scheduleDays: string[];
  sessionsCount: number;
  sessionMinutes: number;
  priceKrw: number;
  priceCny: number;
  isPopular?: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Student {
  id: string;
  fullName: string;
  englishName?: string;
  email?: string;
  dateOfBirth?: string;
  phone?: string;
  country: CountryCode;
  englishLevel: CefrLevel;
  purposes: CoursePurpose[];
  trialUsed: boolean;
  paymentStatus: PaymentStatus;
  planLabel?: string;
  teacherName?: string;
}

/** 로그인 계정 유형 — 본인 수강 vs 자녀(보호자) 관리 */
export type AccountType = "self" | "guardian";

/** auth.users + profiles(role=student) 에 대응 — 결제·연락 주체 */
export interface AccountHolder {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: CountryCode;
  accountType: AccountType;
  createdAt: string;
}

/** 실제 수업 대상 — enrollments·lessons·feedbacks·chat 단위 */
export interface Learner {
  id: string;
  accountHolderId: string;
  /** 한글/中文 실명 (관리·입금 확인용) */
  fullName: string;
  /** 수업·채팅 표시명 */
  englishName: string;
  dateOfBirth: string;
  englishLevel?: CefrLevel;
  purposes?: CoursePurpose[];
  surveyNotes?: string;
  trialUsed: boolean;
  trialScheduledAt?: string;
  trialLessonId?: string;
  trialDurationMinutes?: number;
  paymentStatus: PaymentStatus;
  /** Admin review after account signup — defaults to confirmed for legacy rows */
  registrationStatus?: RegistrationStatus;
  planLabel?: string;
  teacherName?: string;
  createdAt: string;
}

export type RegistrationStatus = "pending" | "confirmed" | "rejected";

export type AdminReviewCategory =
  | "reschedule"
  | "teacher_signup"
  | "student_signup"
  | "payment_activation";

export type AdminReviewAction = "approved" | "rejected" | "confirmed" | "activated";

export interface AdminReviewLogEntry {
  id: string;
  category: AdminReviewCategory;
  action: AdminReviewAction;
  targetId: string;
  targetLabel: string;
  detail?: string;
  adminName: string;
  at: string;
}

export type AdminLessonOperationType =
  | "assign_substitute"
  | "teacher_no_show"
  | "cancel_unpaid"
  | "reschedule";

export interface AdminLessonOperationUndoPayload {
  type: "teacher_no_show" | "cancel_unpaid";
  originalLesson?: Lesson;
  deletedLesson?: Lesson;
  makeupLessonId?: string;
  enrollmentId?: string;
  enrollmentDeltaRemaining: number;
  penaltyTeacherId?: string;
  penaltyMonth?: string;
}

export interface AdminLessonOperationLogEntry {
  id: string;
  at: string;
  teacherId: string;
  teacherName: string;
  lessonId: string;
  studentName?: string;
  scheduledAt: string;
  /** Monday date key (KST) for the lesson week */
  weekStartKey: string;
  action: AdminLessonOperationType;
  summary: string;
  note?: string;
  adminName: string;
  undoneAt?: string;
  undoable: boolean;
  undoPayload?: AdminLessonOperationUndoPayload;
}

/** Admin queue item — new student account awaiting review */
export interface StudentRegistrationReview {
  id: string;
  accountHolderName: string;
  accountEmail: string;
  accountPhone: string;
  accountType: AccountType;
  country: CountryCode;
  learnerFullName: string;
  learnerEnglishName: string;
  learnerDateOfBirth: string;
  englishLevel?: CefrLevel;
  purposes?: CoursePurpose[];
  submittedAt: string;
  status: RegistrationStatus;
}

export interface AccountSession {
  account: AccountHolder;
  learners: Learner[];
  activeLearnerId: string;
}

export type VideoPlatform = "ZOOM" | "VOOV";

/** Teacher-maintained context per student (textbook persists until changed) */
export interface TeacherStudentContext {
  studentId: string;
  teacherId: string;
  textbook: string;
  videoPlatform: VideoPlatform;
  specialNotes?: string;
}

export interface Lesson {
  id: string;
  /** 연결된 수강 계약 */
  enrollmentId?: string;
  teacherId: string;
  teacherName: string;
  studentId?: string;
  studentName?: string;
  scheduledAt: string;
  durationMinutes: number;
  status: LessonStatus;
  isTrial: boolean;
  /** Student no-show: completed without feedback; counts toward teacher payroll */
  studentAbsent?: boolean;
  /** Substitute / bulk reassignment — original assigned teacher */
  originalTeacherId?: string;
  originalTeacherName?: string;
  /** Who receives payroll when lesson completes (defaults to teacherId) */
  payrollTeacherId?: string;
  payrollTeacherName?: string;
  /** Exclude from assigned teacher payroll (no-show, admin unpaid cancel) */
  unpaidForTeacher?: boolean;
  teacherNoShow?: boolean;
  adminCancelledUnpaid?: boolean;
  cancelReason?: LessonCancelReason;
  /** Linked makeup lesson after teacher no-show */
  relatedLessonId?: string;
  operationNote?: string;
}

export interface TeacherPayrollPenalty {
  teacherId: string;
  /** YYYY-MM */
  month: string;
  perfectAttendanceForfeited: boolean;
  quarterlyBonusReset: boolean;
  reason?: string;
  createdAt: string;
}

export type RescheduleInitiator = "teacher" | "student";

export type RescheduleRequestStatus =
  | "pending_student_approval"
  | "pending_teacher_approval"
  | "approved"
  | "rejected"
  | "cancelled";

/** 수업시간 변경(보강) 요청 */
export interface LessonRescheduleRequest {
  id: string;
  lessonId: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  originalScheduledAt: string;
  proposedScheduledAt: string;
  reason?: string;
  initiator: RescheduleInitiator;
  status: RescheduleRequestStatus;
  /** YYYY-MM — student monthly limit tracking */
  requestMonth: string;
  createdAt: string;
  respondedAt?: string;
}

export interface ChatRoom {
  id: string;
  teacherId?: string;
  teacherName: string;
  studentId?: string;
  studentName?: string;
  /** 알림·목록에 표시할 상대방 이름 */
  displayName: string;
  /** Inbox counterpart avatar (teacher for students, student for teachers) */
  avatarUrl?: string;
  teacherAvatarUrl?: string;
  studentAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  senderRole: UserRole;
  body: string;
  createdAt: string;
  isOwn?: boolean;
}

export interface SalarySummary {
  baseSalary: number;
  monthlyBonus: number;
  quarterlyBonus: number;
  manualBonus: number;
  totalHours: number;
  hourlyRate: number;
}

export type SalaryPayoutStatus =
  | "estimated"
  | "confirmed"
  | "processing"
  | "paid"
  | "completed";

export interface SalaryBonusPolicyConfig {
  perfectAttendancePerHourPhp: number;
  perfectAttendanceDescription: string;
  quarterlyPeriodMonths: number;
  quarterlyTiers: {
    minHours: number;
    maxHours: number | null;
    amountPhp: number;
  }[];
}

export interface TeacherSalaryAdjustment {
  id: string;
  teacherId: string;
  /** YYYY-MM */
  month: string;
  type: "bonus" | "penalty";
  amountPhp: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface SalaryLessonVerificationRow {
  id: string;
  scheduledAt: string;
  studentName: string;
  durationMinutes: number;
  durationHours: number;
  status: string;
  countsForPayroll: boolean;
}

export interface TeacherPayoutAccount {
  type: "bank" | "gcash" | "wise";
  label: string;
  accountNumber: string;
  accountName?: string;
}

/** Monthly teacher salary statement (payroll slip) */
export interface TeacherSalaryStatement {
  id: string;
  teacherId: string;
  teacherName: string;
  /** YYYY-MM */
  month: string;
  status: SalaryPayoutStatus;
  completedClasses: number;
  totalHours: number;
  hourlyRate: number;
  baseSalary: number;
  perfectAttendanceBonus: number;
  quarterlyBonus: number;
  otherIncentives: number;
  deductions: number;
  /** Scheduled or actual payout date (ISO date) */
  paymentDate?: string;
  /** Admin verified hours and amounts after month end */
  adminConfirmedAt?: string;
  adminConfirmedBy?: string;
  /** PHP deposited to teacher account */
  phpPaidAt?: string;
  /** Final KRW transfer amount including fees */
  krwTransferAmount?: number;
  completedAt?: string;
  financeTransactionId?: string;
  payoutAccount: TeacherPayoutAccount;
  /** Current month in-progress estimate */
  isLiveEstimate?: boolean;
}

export interface FinanceSummary {
  revenueKrw: number;
  revenueCny: number;
  expensePhp: number;
  month: string;
}

export type TransactionType = "income" | "expense";
export type TransactionSource = "auto" | "manual";
export type TaxTreatment = "taxable" | "zero_rated" | "exempt" | "non_taxable";
export type FinanceCurrency = "KRW" | "CNY" | "PHP";

export type TransactionCategory =
  | "student_payment_kr"
  | "student_payment_cn"
  | "teacher_payroll"
  | "server_infra"
  | "manual_income"
  | "manual_expense"
  | "other";

export interface FinanceTransaction {
  id: string;
  date: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  currency: FinanceCurrency;
  /** Original currency amount (positive) */
  amount: number;
  /** KRW equivalent for reporting */
  amountKrw: number;
  supplyAmount: number;
  vatAmount: number;
  taxTreatment: TaxTreatment;
  source: TransactionSource;
  teacherId?: string;
  teacherName?: string;
  studentName?: string;
}

export interface MonthlyPlSummary {
  totalRevenueKrw: number;
  totalExpenseKrw: number;
  netProfitKrw: number;
  outputVat: number;
  inputVat: number;
  estimatedVatPayable: number;
  revenueCnyThisMonth: number;
  revenueKrTaxableKrw: number;
  revenueCnExemptKrw: number;
  revenueOtherKrw: number;
  expensePayrollKrw: number;
  expenseOtherKrw: number;
}

export interface ExchangeRates {
  cnyToKrw: number;
  phpToKrw: number;
  updatedAt: string;
}

export interface TimeSlot {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
}

export interface FaqItem {
  id: string;
  categoryKo: string;
  categoryZh: string;
  questionKo: string;
  questionZh: string;
  answerKo: string;
  answerZh: string;
  sortOrder: number;
  published: boolean;
  updatedAt: string;
}

export interface UpsertFaqInput {
  categoryKo: string;
  categoryZh: string;
  questionKo: string;
  questionZh: string;
  answerKo: string;
  answerZh: string;
  sortOrder?: number;
  published?: boolean;
}
