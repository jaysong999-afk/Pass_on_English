import type { Teacher, TeacherProfileInput, TeacherSpecialty } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store";

const SEED: Teacher[] = [
  {
    id: "teacher-1",
    displayName: "Sarah Mitchell",
    bio: "10 years of ESL teaching experience with kids and adults. Passionate about making English fun!",
    specialties: ["Beginners", "Phonics", "Friendly", "Interactive", "Energetic"],
    experienceYears: 10,
    status: "active",
    availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    hourlyRatePhp: 150,
    profileCompleted: true,
  },
  {
    id: "teacher-2",
    displayName: "James Rivera",
    bio: "Business English specialist. Former corporate trainer helping professionals communicate globally.",
    specialties: ["Business", "Adult", "Academic", "Detail-Oriented", "Interview Prep"],
    experienceYears: 8,
    status: "active",
    availableDays: ["Mon", "Wed", "Fri"],
    hourlyRatePhp: 160,
    profileCompleted: true,
  },
  {
    id: "teacher-3",
    displayName: "Emily Santos",
    bio: "Early childhood education expert. Creative phonics and storytelling methods for young learners.",
    specialties: ["Beginners", "Phonics", "Storytelling", "Patient", "Encouraging"],
    experienceYears: 6,
    status: "active",
    availableDays: ["Tue", "Thu", "Sat"],
    hourlyRatePhp: 145,
    profileCompleted: true,
  },
  {
    id: "teacher-4",
    displayName: "Maria Chen",
    bio: "On leave — returning September 2026.",
    specialties: ["Beginners", "Academic", "Patient"],
    experienceYears: 5,
    status: "on_leave",
    availableDays: [],
    hourlyRatePhp: 140,
    profileCompleted: true,
  },
];

let teachers: Teacher[] = structuredClone(SEED);

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
  return teachers.map((t) => ({ ...t, specialties: [...t.specialties] }));
}

/** Active teachers with completed public profile (landing, enrollment) */
export function getPublicTeachers(): Teacher[] {
  return getAllTeachers()
    .filter((t) => t.status === "active" && t.profileCompleted)
    .map(syncAvailableDays);
}

export function getTeacherById(id: string): Teacher | undefined {
  const t = teachers.find((x) => x.id === id);
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
  if (existing) {
    const updated = updateTeacherProfile(existing.id, input);
    if (!updated) throw new Error("failed to update profile");
    return updated;
  }

  const id = `teacher-pending-${applicationId}`;
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
  teachers.push(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}

export function updateTeacherHourlyRatePhp(id: string, hourlyRatePhp: number): Teacher | null {
  const index = teachers.findIndex((t) => t.id === id);
  if (index === -1) return null;
  teachers[index] = { ...teachers[index], hourlyRatePhp };
  return { ...teachers[index], specialties: [...teachers[index].specialties] };
}

export function updateTeacherProfile(id: string, input: TeacherProfileInput): Teacher | null {
  const index = teachers.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const current = teachers[index];
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
  teachers[index] = updated;
  return { ...updated, specialties: [...updated.specialties] };
}

export function updateTeacherStatus(
  id: string,
  status: Teacher["status"]
): Teacher | null {
  const index = teachers.findIndex((t) => t.id === id);
  if (index === -1) return null;
  teachers[index] = { ...teachers[index], status };
  const synced = syncAvailableDays({ ...teachers[index], specialties: [...teachers[index].specialties] });
  teachers[index] = synced;
  return { ...synced, specialties: [...synced.specialties] };
}

/** @internal */
export function resetTeacherProfileStore() {
  teachers = structuredClone(SEED);
}
