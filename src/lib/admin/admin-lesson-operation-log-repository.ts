import type { AdminLessonOperationLogEntry, AdminLessonOperationType } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { getTeacherById } from "@/lib/teacher-profile-store-sync";
import { isUuid } from "@/lib/teachers/resolve-teacher-id";
import {
  getAdminLessonOperationLogCache,
  patchAdminLessonOperationLogCache,
  prependAdminLessonOperationLogCache,
  setAdminLessonOperationLogCache,
} from "@/lib/admin/admin-lesson-operation-log-cache";

interface AdminLessonOperationLogRow {
  id: string;
  at: string;
  teacher_id: string | null;
  lesson_id: string | null;
  student_name: string | null;
  scheduled_at: string | null;
  week_start_key: string | null;
  action: AdminLessonOperationType;
  summary: string;
  note: string | null;
  admin_name: string;
  undone_at: string | null;
  undoable: boolean;
  undo_payload: AdminLessonOperationLogEntry["undoPayload"] | null;
}

function rowToEntry(row: AdminLessonOperationLogRow): AdminLessonOperationLogEntry {
  const teacherId = row.teacher_id ?? "";
  const teacher = teacherId ? getTeacherById(teacherId) : undefined;
  return {
    id: row.id,
    at: row.at,
    teacherId,
    teacherName: teacher?.displayName ?? teacherId,
    lessonId: row.lesson_id ?? "",
    studentName: row.student_name ?? undefined,
    scheduledAt: row.scheduled_at ?? "",
    weekStartKey: row.week_start_key ?? "",
    action: row.action,
    summary: row.summary,
    note: row.note ?? undefined,
    adminName: row.admin_name,
    undoneAt: row.undone_at ?? undefined,
    undoable: row.undoable,
    undoPayload: row.undo_payload ?? undefined,
  };
}

async function fetchOperationLogRows(
  teacherId?: string,
  weekStartKey?: string
): Promise<AdminLessonOperationLogRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("admin_lesson_operation_logs")
    .select(
      "id, at, teacher_id, lesson_id, student_name, scheduled_at, week_start_key, action, summary, note, admin_name, undone_at, undoable, undo_payload"
    )
    .order("at", { ascending: false });

  if (teacherId) {
    query = query.eq("teacher_id", teacherId);
  }
  if (weekStartKey) {
    query = query.eq("week_start_key", weekStartKey);
  }

  const { data, error } = await query.limit(500);
  if (error) {
    throw new Error(`admin_lesson_operation_logs_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as AdminLessonOperationLogRow[];
}

export async function warmAdminLessonOperationLogCache() {
  const rows = await fetchOperationLogRows();
  setAdminLessonOperationLogCache(rows.map(rowToEntry));
  return getAdminLessonOperationLogCache();
}

export async function appendAdminLessonOperationLogInDb(
  input: Omit<AdminLessonOperationLogEntry, "id" | "at"> & { at?: string }
): Promise<AdminLessonOperationLogEntry> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_lesson_operation_logs")
    .insert({
      ...(input.at ? { at: input.at } : {}),
      teacher_id: input.teacherId || null,
      lesson_id: input.lessonId && isUuid(input.lessonId) ? input.lessonId : null,
      student_name: input.studentName ?? null,
      scheduled_at: input.scheduledAt || null,
      week_start_key: input.weekStartKey || null,
      action: input.action,
      summary: input.summary,
      note: input.note ?? null,
      admin_name: input.adminName,
      undoable: input.undoable ?? false,
      undo_payload: input.undoPayload ?? null,
    })
    .select(
      "id, at, teacher_id, lesson_id, student_name, scheduled_at, week_start_key, action, summary, note, admin_name, undone_at, undoable, undo_payload"
    )
    .single();

  if (error) {
    throw new Error(`admin_lesson_operation_log_insert_failed: ${error.message}`);
  }

  const entry = rowToEntry(data as AdminLessonOperationLogRow);
  prependAdminLessonOperationLogCache(entry);
  return { ...entry };
}

export async function getAdminLessonOperationLogsInDb(teacherId: string, weekStartKey: string) {
  const cached = getAdminLessonOperationLogCache().filter(
    (l) => l.teacherId === teacherId && l.weekStartKey === weekStartKey
  );
  if (cached.length) {
    return cached.sort((a, b) => b.at.localeCompare(a.at));
  }

  const rows = await fetchOperationLogRows(teacherId, weekStartKey);
  const entries = rows.map(rowToEntry);
  for (const entry of entries) {
    prependAdminLessonOperationLogCache(entry);
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export async function getAdminLessonOperationLogByIdInDb(id: string) {
  const cached = getAdminLessonOperationLogCache().find((l) => l.id === id);
  if (cached) return { ...cached, undoPayload: cached.undoPayload ? { ...cached.undoPayload } : undefined };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_lesson_operation_logs")
    .select(
      "id, at, teacher_id, lesson_id, student_name, scheduled_at, week_start_key, action, summary, note, admin_name, undone_at, undoable, undo_payload"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`admin_lesson_operation_log_fetch_failed: ${error.message}`);
  }
  if (!data) return undefined;

  const entry = rowToEntry(data as AdminLessonOperationLogRow);
  prependAdminLessonOperationLogCache(entry);
  return { ...entry, undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined };
}

export async function markAdminLessonOperationUndoneInDb(id: string) {
  const supabase = await createClient();
  const undoneAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("admin_lesson_operation_logs")
    .update({ undone_at: undoneAt })
    .eq("id", id)
    .select(
      "id, at, teacher_id, lesson_id, student_name, scheduled_at, week_start_key, action, summary, note, admin_name, undone_at, undoable, undo_payload"
    )
    .single();

  if (error) {
    throw new Error(`admin_lesson_operation_log_undo_failed: ${error.message}`);
  }
  if (!data) return undefined;

  const entry = rowToEntry(data as AdminLessonOperationLogRow);
  patchAdminLessonOperationLogCache(entry);
  return { ...entry, undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined };
}
