import type { LessonFeedback, MonthlyGrowthReport } from "@/types";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import { warmEnrollmentCache } from "@/lib/enrollments/repository";
import { completeLessonInDb, getLessonById, warmLessonCache } from "@/lib/lessons/repository";
import {
  getFeedbackCache,
  getReportCache,
  patchFeedbackInCache,
  patchReportInCache,
  setFeedbackCache,
  setReportCache,
} from "@/lib/learning/learning-cache";
import {
  getFeedbacksByStudent,
  getFeedbacksByTeacher,
  getFeedbacksByTeacherMonth,
  getFeedbackByLesson,
  getLastFeedbackForStudent,
  getReportsByStudent,
  getReportsByTeacher,
  countUnreadForStudent,
} from "@/lib/learning-store-sync";
import {
  studentNameFromDb,
  teacherNameFromDb,
  type StudentNameDbJoin,
  type TeacherNameDbJoin,
} from "@/lib/db/join-types";
import { getTeacherStudentContext } from "@/lib/teacher-student-context-store-sync";

interface FeedbackRow {
  id: string;
  lesson_id: string;
  teacher_id: string;
  student_id: string | null;
  content: string;
  homework: string | null;
  textbook: string | null;
  progress_pages: string | null;
  read_at: string | null;
  created_at: string;
  lesson?: { scheduled_at: string; operation_note: string | null } | null;
  teacher?: TeacherNameDbJoin | null;
  student?: StudentNameDbJoin | null;
}

interface ReportRow {
  id: string;
  student_id: string;
  teacher_id: string;
  month: string;
  title: string;
  lessons_covered: string;
  progress_made: string;
  areas_to_work_on: string;
  next_month_goals: string;
  overall_comment: string;
  published_at: string | null;
  read_at: string | null;
  created_at: string;
  teacher?: TeacherNameDbJoin | null;
  student?: StudentNameDbJoin | null;
}

const FEEDBACK_SELECT = `
  id,
  lesson_id,
  teacher_id,
  student_id,
  content,
  homework,
  textbook,
  progress_pages,
  read_at,
  created_at,
  lesson:lessons!lesson_feedbacks_lesson_id_fkey(scheduled_at, operation_note),
  teacher:teachers!lesson_feedbacks_teacher_id_fkey(display_name),
  student:students!lesson_feedbacks_student_id_fkey(english_name, full_name)
`;

const REPORT_SELECT = `
  id,
  student_id,
  teacher_id,
  month,
  title,
  lessons_covered,
  progress_made,
  areas_to_work_on,
  next_month_goals,
  overall_comment,
  published_at,
  read_at,
  created_at,
  teacher:teachers!monthly_growth_reports_teacher_id_fkey(display_name),
  student:students!monthly_growth_reports_student_id_fkey(english_name, full_name)
`;

function rowToFeedback(row: FeedbackRow, names?: { teacherName?: string; studentName?: string }): LessonFeedback {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id ?? "",
    studentName: names?.studentName ?? studentNameFromDb(row.student, "Student"),
    teacherId: row.teacher_id,
    teacherName: names?.teacherName ?? teacherNameFromDb(row.teacher),
    lessonDate: row.lesson?.scheduled_at ?? row.created_at,
    topic: row.lesson?.operation_note?.trim() || undefined,
    feedback: row.content,
    homework: row.homework ?? undefined,
    textbook: row.textbook ?? undefined,
    progressPages: row.progress_pages ?? undefined,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
  };
}

function rowToReport(row: ReportRow, names?: { teacherName?: string; studentName?: string }): MonthlyGrowthReport {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: names?.studentName ?? studentNameFromDb(row.student, "Student"),
    teacherId: row.teacher_id,
    teacherName: names?.teacherName ?? teacherNameFromDb(row.teacher),
    month: row.month,
    title: row.title,
    lessonsCovered: row.lessons_covered,
    progressMade: row.progress_made,
    areasToWorkOn: row.areas_to_work_on,
    nextMonthGoals: row.next_month_goals,
    overallComment: row.overall_comment,
    publishedAt: row.published_at ?? row.created_at,
    readAt: row.read_at ?? undefined,
  };
}

export {
  getFeedbacksByStudent,
  getFeedbacksByTeacher,
  getFeedbacksByTeacherMonth,
  getFeedbackByLesson,
  getLastFeedbackForStudent,
  getReportsByStudent,
  getReportsByTeacher,
  countUnreadForStudent,
};

export async function warmLearningCache(): Promise<{
  feedbacks: LessonFeedback[];
  reports: MonthlyGrowthReport[];
}> {
  const supabase = createBootstrapDbClient();

  const [feedbackResult, reportResult] = await Promise.all([
    supabase.from("lesson_feedbacks").select(FEEDBACK_SELECT).order("created_at", { ascending: false }),
    supabase.from("monthly_growth_reports").select(REPORT_SELECT).order("month", { ascending: false }),
  ]);

  if (feedbackResult.error) {
    throw new Error(`lesson_feedbacks_fetch_failed: ${feedbackResult.error.message}`);
  }
  if (reportResult.error) {
    throw new Error(`monthly_growth_reports_fetch_failed: ${reportResult.error.message}`);
  }

  const feedbacks = ((feedbackResult.data ?? []) as unknown as FeedbackRow[]).map((row) =>
    rowToFeedback(row)
  );
  const reports = ((reportResult.data ?? []) as unknown as ReportRow[]).map((row) =>
    rowToReport(row)
  );

  setFeedbackCache(feedbacks);
  setReportCache(reports);
  return { feedbacks, reports };
}

export type AddLessonFeedbackInput = Omit<LessonFeedback, "id" | "createdAt" | "readAt">;

export async function addLessonFeedbackInDb(
  input: AddLessonFeedbackInput
): Promise<LessonFeedback> {
  const lesson = getLessonById(input.lessonId);
  if (!lesson) {
    throw new Error("lesson_not_found");
  }

  const supabase = await createClient();
  const existing = getFeedbackCache().find((f) => f.lessonId === input.lessonId);
  const textbook = lesson.studentId
    ? getTeacherStudentContext(lesson.studentId, lesson.teacherId).textbook
    : "";

  const payload = {
    lesson_id: input.lessonId,
    teacher_id: input.teacherId,
    student_id: input.studentId,
    content: input.feedback.trim(),
    homework: input.homework?.trim() || null,
    textbook: (existing?.textbook ?? textbook.trim()) || null,
    progress_pages: input.progressPages?.trim() || null,
  };

  let row: FeedbackRow;

  if (existing) {
    const { data, error } = await supabase
      .from("lesson_feedbacks")
      .update(payload)
      .eq("id", existing.id)
      .select(FEEDBACK_SELECT)
      .single();
    if (error) throw new Error(`lesson_feedback_update_failed: ${error.message}`);
    row = data as unknown as FeedbackRow;
  } else {
    const { data, error } = await supabase
      .from("lesson_feedbacks")
      .insert(payload)
      .select(FEEDBACK_SELECT)
      .single();
    if (error) throw new Error(`lesson_feedback_insert_failed: ${error.message}`);
    row = data as unknown as FeedbackRow;
  }

  if (lesson.status !== "completed") {
    await completeLessonInDb(input.lessonId);
    await warmLessonCache();
    await warmEnrollmentCache();
    try {
      const { ensureRenewalOffersInDb } = await import("@/lib/enrollments/repository");
      await ensureRenewalOffersInDb();
    } catch (error) {
      console.error("[addLessonFeedback] renewal offer", error);
    }
  }

  const feedback = rowToFeedback(row, {
    teacherName: input.teacherName,
    studentName: input.studentName,
  });
  patchFeedbackInCache(feedback);
  return feedback;
}

export type AddMonthlyReportInput = Omit<MonthlyGrowthReport, "id" | "publishedAt" | "readAt">;

export async function addMonthlyReportInDb(
  input: AddMonthlyReportInput
): Promise<MonthlyGrowthReport> {
  const supabase = await createClient();
  const publishedAt = new Date().toISOString();

  const payload = {
    student_id: input.studentId,
    teacher_id: input.teacherId,
    month: input.month,
    title: input.title.trim(),
    lessons_covered: input.lessonsCovered.trim(),
    progress_made: input.progressMade.trim(),
    areas_to_work_on: input.areasToWorkOn.trim(),
    next_month_goals: input.nextMonthGoals.trim(),
    overall_comment: input.overallComment.trim(),
    published_at: publishedAt,
    read_at: null,
  };

  const { data, error } = await supabase
    .from("monthly_growth_reports")
    .upsert(payload, { onConflict: "student_id,teacher_id,month" })
    .select(REPORT_SELECT)
    .single();

  if (error) {
    throw new Error(`monthly_growth_report_upsert_failed: ${error.message}`);
  }

  const report = rowToReport(data as unknown as ReportRow, {
    teacherName: input.teacherName,
    studentName: input.studentName,
  });
  patchReportInCache(report);
  return report;
}

export async function markFeedbackReadInDb(id: string): Promise<void> {
  const current = getFeedbackCache().find((f) => f.id === id);
  if (!current || current.readAt) return;

  const supabase = await createClient();
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("lesson_feedbacks")
    .update({ read_at: readAt })
    .eq("id", id);

  if (error) {
    throw new Error(`lesson_feedback_read_failed: ${error.message}`);
  }

  patchFeedbackInCache({ ...current, readAt });
}

export async function markReportReadInDb(id: string): Promise<void> {
  const current = getReportCache().find((r) => r.id === id);
  if (!current || current.readAt) return;

  const supabase = await createClient();
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("monthly_growth_reports")
    .update({ read_at: readAt })
    .eq("id", id);

  if (error) {
    throw new Error(`monthly_growth_report_read_failed: ${error.message}`);
  }

  patchReportInCache({ ...current, readAt });
}
