import type { Teacher, TeacherProfileInput, TeacherSpecialty } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store-sync";
import {
  getAllTeachersFromCache,
  getTeacherFromCache,
  patchTeacherProfileCache,
  setPendingTeacherProfile,
} from "@/lib/teachers/teacher-profile-cache";

function persistTeacher(teacher: Teacher) {
  if (teacher.id.startsWith("teacher-pending-")) {
    setPendingTeacherProfile(teacher);
  } else {
    patchTeacherProfileCache(teacher);
  }
}

function syncAvailableDays(teacher: Teacher): Teacher {
  const availability = getTeacherWeeklyAvailability(teacher.id);
  const days = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).filter(
    (d) => availability.slots[d].length > 0
  );
  return { ...teacher, availableDays: [...days] };
}

function normalizeSpecialties(specialties: string[]): TeacherSpecialty[] {
  return specialties.filter(isTeacherSpecialty);
}

export function getAllTeachers(): Teacher[] {
  return getAllTeachersFromCache().map((t) => syncAvailableDays({ ...t, specialties: [...t.specialties] }));
}

export function getPublicTeachers(): Teacher[] {
  return getAllTeachers()
    .filter((t) => t.status === "active" && t.profileCompleted)
    .map(syncAvailableDays);
}

export function getTeacherById(id: string): Teacher | undefined {
  const t = getTeacherFromCache(id);
  if (!t) return undefined;
  return syncAvailableDays({ ...t, specialties: [...t.specialties] });
}

export function getTeacherByApplicationId(applicationId: string): Teacher | undefined {
  return getAllTeachers().find((t) => t.applicationId === applicationId);
}

export function createTeacherProfileFromApplication(
  applicationId: string,
  input: TeacherProfileInput & { email?: string; fullName?: string }
): Teacher {
  const existing = getTeacherByApplicationId(applicationId);
  if (existing && !existing.id.startsWith("teacher-pending-")) {
    return existing;
  }

  const id = existing?.id ?? `teacher-pending-${applicationId}`;
  const teacher: Teacher = syncAvailableDays({
    id,
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    specialties: normalizeSpecialties(input.specialties),
    experienceYears: Math.max(0, input.experienceYears),
    avatarUrl: input.avatarUrl,
    status: "pending",
    availableDays: [],
    hourlyRatePhp: input.hourlyRatePhp ?? 150,
    applicationId,
    profileCompleted: true,
    email: input.email,
  });
  setPendingTeacherProfile(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}

export function updateTeacherHourlyRatePhp(id: string, hourlyRatePhp: number): Teacher | null {
  const t = getTeacherFromCache(id);
  if (!t) return null;
  const updated = { ...t, hourlyRatePhp };
  persistTeacher(updated);
  return { ...updated, specialties: [...updated.specialties] };
}

export function updateTeacherProfile(id: string, input: TeacherProfileInput): Teacher | null {
  const current = getTeacherFromCache(id);
  if (!current) return null;

  const updated: Teacher = syncAvailableDays({
    ...current,
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    specialties: normalizeSpecialties(input.specialties),
    experienceYears: Math.max(0, input.experienceYears),
    avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : current.avatarUrl,
    status: input.status ?? current.status,
    hourlyRatePhp: input.hourlyRatePhp ?? current.hourlyRatePhp,
    profileCompleted: true,
  });
  persistTeacher(updated);
  return { ...updated, specialties: [...updated.specialties] };
}

export function updateTeacherStatus(id: string, status: Teacher["status"]): Teacher | null {
  const current = getTeacherFromCache(id);
  if (!current) return null;
  const synced = syncAvailableDays({
    ...current,
    status,
    specialties: [...current.specialties],
  });
  persistTeacher(synced);
  return { ...synced, specialties: [...synced.specialties] };
}

import { clearTeacherProfileCache } from "@/lib/teachers/teacher-profile-cache";

/** @internal */
export function resetTeacherProfileStore() {
  clearTeacherProfileCache();
}
