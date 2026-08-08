import type {
  ChatMessage,
  ChatRoom,
  FinanceSummary,
  Lesson,
  PaymentRecord,
  SalarySummary,
  Student,
  TimeSlot,
} from "@/types";
import {
  getEnrollmentById,
  getEnrollmentsByStudent,
  getPaymentRecordsByStudent,
} from "@/lib/enrollment-store";
import { getChatRooms } from "@/lib/chat-store";
import {
  getAllTeachers,
  getPublicTeachers,
  getTeacherById,
} from "@/lib/teacher-profile-store";

export const paymentRecords: PaymentRecord[] = [
  {
    id: "pay-1",
    studentId: "student-1",
    enrollmentId: "enroll-1",
    label: "주5회(월~금) 20분 (20회) — Sarah Mitchell",
    amountKrw: 87000,
    paidAt: "2026-07-01",
    status: "confirmed",
    depositorName: "김민준",
  },
  {
    id: "pay-2",
    studentId: "student-1",
    label: "주5회(월~금) 20분 (20회) — Sarah Mitchell",
    amountKrw: 87000,
    paidAt: "2026-06-01",
    status: "confirmed",
    depositorName: "김민준",
  },
];

export const teachers = getPublicTeachers();

export { getPublicTeachers, getAllTeachers, getTeacherById };

export const students: Student[] = [
  {
    id: "student-1",
    fullName: "김민준",
    englishName: "Minjun Kim",
    email: "minjun@example.com",
    dateOfBirth: "2015-03-15",
    phone: "010-1234-5678",
    country: "KR",
    englishLevel: "A1",
    purposes: ["daily_conversation", "phonics"],
    trialUsed: true,
    paymentStatus: "confirmed",
    planLabel: "주5회(월~금) 20분 (20회)",
    teacherName: "Sarah Mitchell",
  },
  {
    id: "student-2",
    fullName: "王小明",
    englishName: "Xiaoming Wang",
    country: "CN",
    englishLevel: "B1",
    purposes: ["business_english"],
    trialUsed: false,
    paymentStatus: "reported",
    planLabel: "월·수·금 20분",
    teacherName: "James Rivera",
  },
  {
    id: "student-3",
    fullName: "이서연",
    englishName: "Seoyeon Lee",
    country: "KR",
    englishLevel: "B2",
    purposes: ["daily_conversation", "current_affairs"],
    trialUsed: true,
    paymentStatus: "pending",
    planLabel: "화목 8회",
    teacherName: "Emily Santos",
  },
];

/**
 * Lesson seed data.
 *
 * Sarah Mitchell (teacher-1) — 수업 운영 센터 / 노쇼 데모
 * (오늘 날짜·시간은 teacher-lesson-store.applyTodayDemoDates 가 적용)
 *
 * | ID                        | 오늘 KST | 상태        | 용도                          |
 * |---------------------------|----------|-------------|-------------------------------|
 * | lesson-demo-noshow-done   | 10:00    | cancelled   | 이미 노쇼 → 캘린더 회색 셀     |
 * | lesson-demo-noshow-target | 11:00    | scheduled   | 노쇼 확인 창 테스트            |
 * | lesson-demo-active-2      | 14:00    | scheduled   | 일반 예정 수업 (대조)          |
 * | lesson-demo-40min         | 16:00    | scheduled   | 40분 수업 캘린더 데모          |
 * | lesson-demo-60min         | 18:00    | scheduled   | 60분 수업 캘린더 데모          |
 * | lesson-demo-noshow-makeup | +7일     | scheduled   | 노쇼 보강 (무급)               |
 *
 * James Rivera (teacher-2) — 변경 대기 데모: lesson-demo-reschedule
 */
export const lessons: Lesson[] = [
  {
    id: "lesson-hist-1",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-07-28T10:00:00+09:00",
    durationMinutes: 20,
    status: "completed",
    isTrial: false,
  },
  {
    id: "lesson-hist-2",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-07-29T10:00:00+09:00",
    durationMinutes: 20,
    status: "completed",
    isTrial: false,
  },
  {
    id: "lesson-demo-noshow-done",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-08-01T10:00:00+09:00",
    durationMinutes: 20,
    status: "cancelled",
    isTrial: false,
    teacherNoShow: true,
    unpaidForTeacher: true,
    cancelReason: "teacher_no_show",
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
    relatedLessonId: "lesson-demo-noshow-makeup",
    operationNote: "선생님 노쇼 처리 (데모)",
  },
  {
    id: "lesson-demo-noshow-makeup",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    originalTeacherId: "teacher-1",
    originalTeacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-08-08T11:00:00+09:00",
    durationMinutes: 20,
    status: "scheduled",
    isTrial: false,
    unpaidForTeacher: true,
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
    relatedLessonId: "lesson-demo-noshow-done",
    operationNote: "노쇼 보강 수업 (데모)",
  },
  {
    id: "lesson-demo-noshow-target",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-08-01T11:00:00+09:00",
    durationMinutes: 20,
    status: "scheduled",
    isTrial: false,
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
    operationNote: "데모 — 노쇼 처리 테스트용",
  },
  {
    id: "lesson-demo-active-2",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-08-01T14:00:00+09:00",
    durationMinutes: 20,
    status: "scheduled",
    isTrial: false,
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
  },
  {
    id: "lesson-demo-reschedule",
    enrollmentId: "enroll-2",
    teacherId: "teacher-2",
    teacherName: "James Rivera",
    studentId: "student-2",
    studentName: "Xiaoming Wang",
    scheduledAt: "2026-08-01T15:00:00+09:00",
    durationMinutes: 20,
    status: "reschedule_pending",
    isTrial: false,
  },
  {
    id: "lesson-hist-trial",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-2",
    studentName: "Xiaoming Wang",
    scheduledAt: "2026-07-29T14:00:00+09:00",
    durationMinutes: 20,
    status: "completed",
    isTrial: true,
  },
  {
    id: "lesson-demo-40min",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    scheduledAt: "2026-08-01T16:00:00+09:00",
    durationMinutes: 40,
    status: "scheduled",
    isTrial: false,
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
    operationNote: "40분 수업 데모 (16:00–16:40)",
  },
  {
    id: "lesson-demo-60min",
    enrollmentId: "enroll-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-3",
    studentName: "Seoyeon Lee",
    scheduledAt: "2026-08-01T18:00:00+09:00",
    durationMinutes: 60,
    status: "scheduled",
    isTrial: false,
    payrollTeacherId: "teacher-1",
    payrollTeacherName: "Sarah Mitchell",
    operationNote: "60분 수업 데모 (18:00–19:00)",
  },
];

export const chatRooms: ChatRoom[] = getChatRooms("student");

export const chatMessages: Record<string, ChatMessage[]> = {
  "room-1": [
    {
      id: "m1",
      senderId: "teacher-1",
      senderName: "Sarah Mitchell",
      senderRole: "teacher",
      body: "Hi! Welcome to Pass on English. I'm excited to be your teacher!",
      createdAt: "2026-07-25T10:00:00",
    },
    {
      id: "m2",
      senderId: "student-1",
      senderName: "Minjun Kim",
      senderRole: "student",
      body: "Thank you! I'm looking forward to our first lesson.",
      createdAt: "2026-07-25T10:05:00",
    },
  ],
};

export const financeSummary: FinanceSummary = {
  revenueKrw: 177000,
  revenueCny: 970,
  expensePhp: 8500,
  month: "2026-07",
};

export const financeData: FinanceSummary[] = [
  { month: "2026-06", revenueKrw: 87000, revenueCny: 480, expensePhp: 4200 },
  { month: "2026-07", revenueKrw: 177000, revenueCny: 970, expensePhp: 8500 },
];

export const salarySummary: SalarySummary = {
  baseSalary: 10000,
  monthlyBonus: 1500,
  quarterlyBonus: 0,
  manualBonus: 1000,
  totalHours: 40,
  hourlyRate: 250,
};

export const timeSlots: TimeSlot[] = [];

export function getStudent(id: string): Student | undefined {
  return students.find((s) => s.id === id);
}

export function getStudentEnrollment(studentId: string) {
  return getEnrollmentsByStudent(studentId).find(
    (e) => e.status === "active" || e.status === "expiring_soon"
  );
}

export function getEnrollment(id: string) {
  return getEnrollmentById(id);
}

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function getStudentPayments(studentId: string): PaymentRecord[] {
  return [...paymentRecords.filter((p) => p.studentId === studentId), ...getPaymentRecordsByStudent(studentId)];
}
