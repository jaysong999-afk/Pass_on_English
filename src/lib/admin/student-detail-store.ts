import type {
  AccountHolder,
  ChatRoom,
  Learner,
  Lesson,
  LessonFeedback,
  LessonRescheduleRequest,
  MonthlyGrowthReport,
  PaymentRecord,
  SessionAdjustment,
  Student,
  StudentEnrollment,
} from "@/types";
import { getLearnerById, getAccountHolder } from "@/lib/account-store";
import { getChatRooms } from "@/lib/chat-store";
import {
  getEnrollmentsByStudent,
  getPaymentRecordsByStudent,
} from "@/lib/enrollment-store";
import { getFeedbacksByStudent, getReportsByStudent } from "@/lib/learning-store";
import { getStudent, getStudentPayments } from "@/lib/mock-data";
import { getRescheduleRequestsForStudent } from "@/lib/reschedule-store";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getStudentLessons } from "@/lib/teacher-lesson-store";
import { formatDate } from "@/lib/utils";

export interface SessionAdjustmentLogEntry extends SessionAdjustment {
  enrollmentId: string;
  planLabel: string;
}

export interface AdminStudentDetail {
  student: Student;
  learner?: Learner;
  accountHolder?: AccountHolder;
  displayName: string;
  legalName: string;
  firstEnrollmentDate: string | null;
  /** Human-readable current / overall period */
  enrollmentPeriod: string | null;
  enrollments: StudentEnrollment[];
  payments: PaymentRecord[];
  lessons: Lesson[];
  feedbacks: LessonFeedback[];
  reports: MonthlyGrowthReport[];
  rescheduleRequests: LessonRescheduleRequest[];
  chatRooms: ChatRoom[];
  sessionAdjustments: SessionAdjustmentLogEntry[];
}

function mergeStudentProfile(student: Student, learner?: Learner): Student {
  if (!learner) return student;
  return {
    ...student,
    fullName: learner.fullName || student.fullName,
    englishName: learner.englishName || student.englishName,
    dateOfBirth: learner.dateOfBirth || student.dateOfBirth,
    englishLevel: learner.englishLevel ?? student.englishLevel,
    purposes: learner.purposes ?? student.purposes,
    trialUsed: learner.trialUsed,
    paymentStatus: learner.paymentStatus ?? student.paymentStatus,
    planLabel: learner.planLabel ?? student.planLabel,
    teacherName: learner.teacherName ?? student.teacherName,
    email: student.email,
    phone: student.phone,
  };
}

function computeEnrollmentDates(enrollments: StudentEnrollment[]) {
  if (enrollments.length === 0) {
    return { firstEnrollmentDate: null, enrollmentPeriod: null };
  }

  const sorted = [...enrollments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const firstEnrollmentDate = sorted[0].startDate;

  const active = enrollments.find(
    (e) => e.status === "active" || e.status === "expiring_soon" || e.status === "pending_payment"
  );
  const latestEnd = enrollments.reduce(
    (max, e) => (e.endDate > max ? e.endDate : max),
    enrollments[0].endDate
  );

  if (active) {
    return {
      firstEnrollmentDate,
      enrollmentPeriod: `${formatDate(active.startDate, "ko")} ~ ${formatDate(active.endDate, "ko")} (현재 수강)`,
    };
  }

  return {
    firstEnrollmentDate,
    enrollmentPeriod: `${formatDate(firstEnrollmentDate, "ko")} ~ ${formatDate(latestEnd, "ko")}`,
  };
}

function collectSessionAdjustments(enrollments: StudentEnrollment[]): SessionAdjustmentLogEntry[] {
  return enrollments
    .flatMap((e) =>
      (e.adjustments ?? []).map((adj) => ({
        ...adj,
        enrollmentId: e.id,
        planLabel: e.planLabel,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function getChatRoomsForStudent(studentId: string, displayName: string, legalName: string): ChatRoom[] {
  const adminRooms = getChatRooms("admin");
  const teacherRooms = getChatRooms("teacher").filter((r) => r.studentId === studentId);

  const matchedAdmin = adminRooms.filter(
    (r) =>
      r.studentId === studentId ||
      r.displayName.includes(legalName) ||
      r.displayName.includes(displayName)
  );

  return [...matchedAdmin, ...teacherRooms].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function getAdminStudentDetail(studentId: string): AdminStudentDetail | null {
  const base = getStudent(studentId);
  if (!base) return null;

  const learner = getLearnerById(studentId);
  const student = mergeStudentProfile(base, learner);
  const displayName = getStudentDisplayName(student);
  const legalName = student.fullName;

  const enrollments = getEnrollmentsByStudent(studentId).sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  );
  const { firstEnrollmentDate, enrollmentPeriod } = computeEnrollmentDates(enrollments);

  const storePayments = getPaymentRecordsByStudent(studentId);
  const mockPayments = getStudentPayments(studentId);
  const paymentIds = new Set(storePayments.map((p) => p.id));
  const payments = [
    ...storePayments,
    ...mockPayments.filter((p) => !paymentIds.has(p.id)),
  ].sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  const lessons = getStudentLessons(studentId).sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  let accountHolder: AccountHolder | undefined;
  if (learner?.accountHolderId) {
    const holder = getAccountHolder();
    if (holder.id === learner.accountHolderId) {
      accountHolder = holder;
    }
  }

  return {
    student,
    learner,
    accountHolder,
    displayName,
    legalName,
    firstEnrollmentDate,
    enrollmentPeriod,
    enrollments,
    payments,
    lessons,
    feedbacks: getFeedbacksByStudent(studentId),
    reports: getReportsByStudent(studentId),
    rescheduleRequests: getRescheduleRequestsForStudent(studentId),
    chatRooms: getChatRoomsForStudent(studentId, displayName, legalName),
    sessionAdjustments: collectSessionAdjustments(enrollments),
  };
}
