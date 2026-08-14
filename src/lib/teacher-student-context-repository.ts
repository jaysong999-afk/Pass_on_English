import type { CountryCode, TeacherStudentContext, VideoPlatform } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherStudentContextCache,
  setTeacherStudentContextCache,
  setTeacherStudentContextCacheEntry,
} from "@/lib/teacher-student-context-cache";

interface TeacherStudentContextRow {
  id: string;
  teacher_id: string;
  student_id: string;
  textbook: string;
  video_platform: VideoPlatform;
  special_notes: string | null;
  updated_at: string;
}

export function defaultVideoPlatformForCountry(
  country: CountryCode | null | undefined
): VideoPlatform {
  return country === "CN" ? "VOOV" : "ZOOM";
}

function rowToContext(row: TeacherStudentContextRow): TeacherStudentContext {
  return {
    studentId: row.student_id,
    teacherId: row.teacher_id,
    textbook: row.textbook,
    videoPlatform: row.video_platform,
    specialNotes: row.special_notes ?? undefined,
  };
}

async function fetchContextRows(): Promise<TeacherStudentContextRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_student_context")
    .select("id, teacher_id, student_id, textbook, video_platform, special_notes, updated_at");

  if (error) {
    throw new Error(`teacher_student_context_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as TeacherStudentContextRow[];
}

export async function warmTeacherStudentContextCache() {
  const rows = await fetchContextRows();
  setTeacherStudentContextCache(rows.map(rowToContext));
  return rows.map(rowToContext);
}

async function fetchContextRow(studentId: string, teacherId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_student_context")
    .select("id, teacher_id, student_id, textbook, video_platform, special_notes, updated_at")
    .eq("student_id", studentId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_student_context_fetch_failed: ${error.message}`);
  }

  return (data as TeacherStudentContextRow | null) ?? null;
}

export async function getTeacherStudentContextInDb(
  studentId: string,
  teacherId: string,
  defaults?: Partial<Pick<TeacherStudentContext, "textbook" | "videoPlatform">>
): Promise<TeacherStudentContext> {
  const cached = getTeacherStudentContextCache(studentId, teacherId);
  if (cached) return cached;

  const row = await fetchContextRow(studentId, teacherId);
  if (row) {
    const context = rowToContext(row);
    setTeacherStudentContextCacheEntry(context);
    return { ...context };
  }

  const fallback: TeacherStudentContext = {
    studentId,
    teacherId,
    textbook: defaults?.textbook ?? "",
    videoPlatform: defaults?.videoPlatform ?? "ZOOM",
  };
  return { ...fallback };
}

export async function updateTeacherStudentContextInDb(
  studentId: string,
  teacherId: string,
  patch: Partial<Pick<TeacherStudentContext, "textbook" | "videoPlatform" | "specialNotes">>,
  defaults?: Partial<Pick<TeacherStudentContext, "textbook" | "videoPlatform">>
): Promise<TeacherStudentContext> {
  const current = await getTeacherStudentContextInDb(studentId, teacherId, defaults);
  const updated: TeacherStudentContext = {
    ...current,
    ...patch,
    textbook: patch.textbook !== undefined ? patch.textbook.trim() : current.textbook,
    specialNotes:
      patch.specialNotes !== undefined
        ? patch.specialNotes.trim() || undefined
        : current.specialNotes,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_student_context")
    .upsert(
      {
        teacher_id: teacherId,
        student_id: studentId,
        textbook: updated.textbook,
        video_platform: updated.videoPlatform,
        special_notes: updated.specialNotes ?? null,
      },
      { onConflict: "teacher_id,student_id" }
    )
    .select("id, teacher_id, student_id, textbook, video_platform, special_notes, updated_at")
    .single();

  if (error) {
    throw new Error(`teacher_student_context_upsert_failed: ${error.message}`);
  }

  const context = rowToContext(data as TeacherStudentContextRow);
  setTeacherStudentContextCacheEntry(context);
  return { ...context };
}
