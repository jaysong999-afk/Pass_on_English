import type { AdminLessonOperationLogEntry } from "@/types";
import { getAdminLessonOperationLogCache } from "@/lib/admin/admin-lesson-operation-log-cache";

export {
  weekStartKeyFromDate,
  weekStartKeyFromScheduledAt,
  operationTypeLabel,
} from "@/lib/admin/admin-lesson-operation-log-utils";

export function getAdminLessonOperationLogs(
  teacherId: string,
  weekStartKey: string
): AdminLessonOperationLogEntry[] {
  return getAdminLessonOperationLogCache()
    .filter((l) => l.teacherId === teacherId && l.weekStartKey === weekStartKey)
    .map((l) => ({
      ...l,
      undoPayload: l.undoPayload ? { ...l.undoPayload } : undefined,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function getAdminLessonOperationLogById(
  id: string
): AdminLessonOperationLogEntry | undefined {
  const entry = getAdminLessonOperationLogCache().find((l) => l.id === id);
  if (!entry) return undefined;
  return {
    ...entry,
    undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined,
  };
}

import { clearAdminLessonOperationLogCache } from "@/lib/admin/admin-lesson-operation-log-cache";

/** @internal */
export function resetAdminLessonOperationLogStore() {
  clearAdminLessonOperationLogCache();
}
