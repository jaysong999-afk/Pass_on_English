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
import { getChatRooms } from "@/lib/chat/chat-store-sync";
import {
  getEnrollmentsByStudent,
  getPaymentRecordsByStudent,
} from "@/lib/enrollment-store-sync";
import { getFeedbacksByStudent, getReportsByStudent } from "@/lib/learning-store-sync";
import { getRescheduleRequestsForStudent } from "@/lib/reschedule-store-sync";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getStudentLessons } from "@/lib/teacher-lesson-store-sync";
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
  const adminRooms = getChatRooms({ viewerRole: "admin" });
  const teacherRooms = getChatRooms({ viewerRole: "teacher" }).filter(
    (r) => r.studentId === studentId
  );

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
  const directoryEntry = getStudentDirectoryEntry(studentId);
  if (!directoryEntry) return null;

  const { student, learner, accountHolder } = directoryEntry;
  const displayName = getStudentDisplayName(student);
  const legalName = student.fullName;

  const enrollments = getEnrollmentsByStudent(studentId).sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  );
  const { firstEnrollmentDate, enrollmentPeriod } = computeEnrollmentDates(enrollments);

  const payments = getPaymentRecordsByStudent(studentId).sort((a, b) =>
    b.paidAt.localeCompare(a.paidAt)
  );

  const lessons = getStudentLessons(studentId).sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

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
