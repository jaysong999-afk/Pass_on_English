import type { StudentRegistrationReview } from "@/types";

let registrationCache: StudentRegistrationReview[] = [];

export function setStudentRegistrationCache(registrations: StudentRegistrationReview[]) {
  registrationCache = registrations.map((r) => ({
    ...r,
    purposes: r.purposes ? [...r.purposes] : undefined,
  }));
}

export function getStudentRegistrationCache() {
  return registrationCache.map((r) => ({
    ...r,
    purposes: r.purposes ? [...r.purposes] : undefined,
  }));
}

export function patchStudentRegistrationCache(registration: StudentRegistrationReview) {
  const index = registrationCache.findIndex((r) => r.id === registration.id);
  const cloned = {
    ...registration,
    purposes: registration.purposes ? [...registration.purposes] : undefined,
  };
  if (index === -1) {
    registrationCache.unshift(cloned);
  } else {
    registrationCache[index] = cloned;
  }
}

export function clearStudentRegistrationCache() {
  registrationCache = [];
}
