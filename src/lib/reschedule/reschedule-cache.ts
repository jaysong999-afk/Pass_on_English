import type { LessonRescheduleRequest } from "@/types";

let rescheduleCache: LessonRescheduleRequest[] = [];

export function getRescheduleCache(): LessonRescheduleRequest[] {
  return rescheduleCache;
}

export function setRescheduleCache(items: LessonRescheduleRequest[]) {
  rescheduleCache = items;
}

export function patchRescheduleInCache(request: LessonRescheduleRequest) {
  const index = rescheduleCache.findIndex((r) => r.id === request.id);
  if (index === -1) {
    rescheduleCache.unshift(request);
  } else {
    rescheduleCache[index] = request;
  }
}
