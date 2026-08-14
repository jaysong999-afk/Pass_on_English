import type { AdminLessonOperationLogEntry } from "@/types";

let operationLogCache: AdminLessonOperationLogEntry[] = [];

export function setAdminLessonOperationLogCache(logs: AdminLessonOperationLogEntry[]) {
  operationLogCache = logs.map((log) => ({
    ...log,
    undoPayload: log.undoPayload ? { ...log.undoPayload } : undefined,
  }));
}

export function prependAdminLessonOperationLogCache(entry: AdminLessonOperationLogEntry) {
  operationLogCache.unshift({
    ...entry,
    undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined,
  });
}

export function patchAdminLessonOperationLogCache(entry: AdminLessonOperationLogEntry) {
  const index = operationLogCache.findIndex((l) => l.id === entry.id);
  if (index === -1) return;
  operationLogCache[index] = {
    ...entry,
    undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined,
  };
}

export function getAdminLessonOperationLogCache() {
  return operationLogCache.map((log) => ({
    ...log,
    undoPayload: log.undoPayload ? { ...log.undoPayload } : undefined,
  }));
}

export function clearAdminLessonOperationLogCache() {
  operationLogCache = [];
}
