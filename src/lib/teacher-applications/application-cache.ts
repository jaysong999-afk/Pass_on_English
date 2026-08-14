import type { TeacherApplication } from "@/types";

let applicationCache: TeacherApplication[] = [];

export function setTeacherApplicationCache(applications: TeacherApplication[]) {
  applicationCache = applications.map((a) => ({ ...a }));
}

export function getTeacherApplicationCache() {
  return applicationCache.map((a) => ({ ...a }));
}

export function patchTeacherApplicationCache(application: TeacherApplication) {
  const index = applicationCache.findIndex((a) => a.id === application.id);
  if (index === -1) {
    applicationCache.unshift({ ...application });
  } else {
    applicationCache[index] = { ...application };
  }
}

export function clearTeacherApplicationCache() {
  applicationCache = [];
}
