import "server-only";
import { createRequestDbClient } from "@/lib/supabase/db-client";
import { getEnrollmentCache, patchEnrollmentInCache } from "@/lib/enrollments/enrollment-cache";
import { getLessonCache, patchLessonInCache } from "@/lib/lessons/lesson-cache";
import type { TransferInput, TransferSlotPreview } from "./enrollment-transfer";
import type { BulkEnrollmentTransferPreview, BulkEnrollmentTransferItemResult } from "./lesson-operations-store";

interface TransferResult {
  ok: boolean;
  slotsByEnrollment: Record<string, TransferSlotPreview>;
  transfers: (BulkEnrollmentTransferItemResult & { lessonIds: string[] })[];
}
export async function listTransferEnrollments(fromTeacherId: string): Promise<BulkEnrollmentTransferPreview[]> {
  const db = await createRequestDbClient();
  const { data, error } = await db.rpc("admin_transfer_enrollments", { p_from: fromTeacherId });
  if (error) throw new Error("이관 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return data;
}
export async function transferEnrollments(input: TransferInput, execute = false): Promise<TransferResult> {
  const db = await createRequestDbClient();
  const { data, error } = await db.rpc("admin_transfer_batch", {
    p_from: input.fromTeacherId, p_transfers: input.transfers, p_execute: execute,
  });
  if (error) throw new Error("이관 검증 또는 저장에 실패했습니다. 새로 확인한 후 다시 시도해 주세요.");
  const result = data as TransferResult;
  if (execute && result.ok) {
    // Patch already-loaded entries only after commit, without downloading tables.
    for (const item of result.transfers) {
      const enrollment = getEnrollmentCache().find(e => e.id === item.enrollmentId);
      if (enrollment) patchEnrollmentInCache({ ...enrollment, teacherId: item.toTeacherId, teacherName: item.toTeacherName });
      const ids = new Set(item.lessonIds);
      for (const lesson of getLessonCache().filter(l => ids.has(l.id))) {
        patchLessonInCache({ ...lesson, originalTeacherId: lesson.originalTeacherId ?? lesson.teacherId,
          originalTeacherName: lesson.originalTeacherName ?? lesson.teacherName,
          teacherId: item.toTeacherId, teacherName: item.toTeacherName,
          payrollTeacherId: item.toTeacherId, payrollTeacherName: item.toTeacherName,
          operationNote: "휴직·퇴직 수강 일괄 이관" });
      }
    }
  }
  return result;
}
