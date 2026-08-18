import type { Lesson } from "@/types";
import { createServiceDbClient } from "@/lib/supabase/db-client";

export const TEACHER_LESSON_ASSIGNMENT_KIND = "teacher_lesson_assignment";

interface StudentPurposeRow {
  english_name: string | null;
  full_name: string;
  purposes: string[] | null;
}

export async function notifyTeacherOfLessonAssignmentInDb(input: {
  assignmentKey: string;
  lesson: Lesson;
}): Promise<boolean> {
  const { lesson, assignmentKey } = input;
  if (!lesson.studentId) return false;

  try {
    const supabase = createServiceDbClient();
    const { data: existing, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", lesson.teacherId)
      .eq("type", "lesson_reminder")
      .contains("payload", {
        kind: TEACHER_LESSON_ASSIGNMENT_KIND,
        assignmentKey,
      })
      .limit(1);

    if (existingError) {
      throw new Error(`assignment_notification_lookup_failed: ${existingError.message}`);
    }
    if (existing && existing.length > 0) return false;

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("english_name, full_name, purposes")
      .eq("id", lesson.studentId)
      .single();

    if (studentError) {
      throw new Error(`assignment_student_lookup_failed: ${studentError.message}`);
    }

    const studentRow = student as StudentPurposeRow;
    const studentName = studentRow.english_name?.trim() || studentRow.full_name || lesson.studentName || "Student";
    const { error: insertError } = await supabase.from("notifications").insert({
      user_id: lesson.teacherId,
      type: "lesson_reminder",
      title: lesson.isTrial ? "New trial lesson assigned" : "New student lessons assigned",
      body: `${studentName} · ${lesson.isTrial ? "Trial lesson" : "New enrollment"}`,
      payload: {
        kind: TEACHER_LESSON_ASSIGNMENT_KIND,
        assignmentKey,
        lessonId: lesson.id,
        enrollmentId: lesson.enrollmentId ?? null,
        studentId: lesson.studentId,
        studentName,
        purposes: studentRow.purposes ?? [],
        isTrial: lesson.isTrial,
        scheduledAt: lesson.scheduledAt,
      },
    });

    if (insertError) {
      throw new Error(`assignment_notification_insert_failed: ${insertError.message}`);
    }
    return true;
  } catch (error) {
    // Lesson creation is the source of truth. A notification failure must not
    // roll back a successfully registered class outside a DB transaction.
    console.error("[notifyTeacherOfLessonAssignmentInDb]", error);
    return false;
  }
}
