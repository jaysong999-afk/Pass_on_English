import type { Teacher } from "@/types";

let teacherCache: Teacher[] = [];
const pendingTeachers = new Map<string, Teacher>();

export function setTeacherProfileCache(teachers: Teacher[]) {
  teacherCache = teachers.map((t) => ({ ...t, specialties: [...t.specialties] }));
}

export function getTeacherProfileCache() {
  return teacherCache.map((t) => ({ ...t, specialties: [...t.specialties] }));
}

export function patchTeacherProfileCache(teacher: Teacher) {
  const index = teacherCache.findIndex((t) => t.id === teacher.id);
  const cloned = { ...teacher, specialties: [...teacher.specialties] };
  if (index === -1) {
    teacherCache.push(cloned);
  } else {
    teacherCache[index] = cloned;
  }
}

export function setPendingTeacherProfile(teacher: Teacher) {
  pendingTeachers.set(teacher.id, { ...teacher, specialties: [...teacher.specialties] });
}

export function getPendingTeacherProfiles() {
  return [...pendingTeachers.values()].map((t) => ({ ...t, specialties: [...t.specialties] }));
}

export function getAllTeachersFromCache() {
  const merged = [...teacherCache, ...getPendingTeacherProfiles()];
  return merged.map((t) => ({ ...t, specialties: [...t.specialties] }));
}

export function clearTeacherProfileCache() {
  teacherCache = [];
  pendingTeachers.clear();
}

export function getTeacherFromCache(id: string) {
  const teacher =
    teacherCache.find((t) => t.id === id) ?? pendingTeachers.get(id);
  return teacher ? { ...teacher, specialties: [...teacher.specialties] } : undefined;
}
