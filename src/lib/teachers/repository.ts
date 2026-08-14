import type { Teacher, TeacherProfileInput, TeacherSpecialty } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { createClient } from "@/lib/supabase/server";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store-sync";
import {
  getAllTeachersFromCache,
  getTeacherFromCache,
  patchTeacherProfileCache,
  setTeacherProfileCache,
} from "@/lib/teachers/teacher-profile-cache";
import { linkTeacherApplicationToTeacherInDb } from "@/lib/teacher-applications/repository";

interface TeacherRow {
  id: string;
  display_name: string;
  bio: string | null;
  specialties: string[] | null;
  experience_years: number | null;
  status: Teacher["status"];
  hourly_rate_php: number | null;
  application_id: string | null;
  profiles: { avatar_url: string | null; full_name: string | null } | { avatar_url: string | null; full_name: string | null }[] | null;
}

function normalizeProfile(row: TeacherRow) {
  if (!row.profiles) return null;
  return Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
}

function normalizeSpecialties(specialties: string[]): TeacherSpecialty[] {
  return specialties.filter(isTeacherSpecialty);
}

function syncAvailableDays(teacher: Teacher): Teacher {
  const availability = getTeacherWeeklyAvailability(teacher.id);
  const days = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).filter(
    (d) => availability.slots[d].length > 0
  );
  return { ...teacher, availableDays: [...days] };
}

function rowToTeacher(row: TeacherRow): Teacher {
  const specialties = normalizeSpecialties(row.specialties ?? []);
  const bio = row.bio?.trim() ?? "";
  const displayName = row.display_name.trim();
  return syncAvailableDays({
    id: row.id,
    displayName,
    bio,
    specialties,
    experienceYears: row.experience_years ?? 0,
    avatarUrl: normalizeProfile(row)?.avatar_url ?? undefined,
    status: row.status,
    availableDays: [],
    hourlyRatePhp: Number(row.hourly_rate_php ?? 150),
    applicationId: row.application_id ?? undefined,
    profileCompleted:
      bio.length > 0 && displayName.length > 0 && specialties.length > 0,
    email: undefined,
  });
}

async function fetchTeacherRows(): Promise<TeacherRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachers")
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, profiles(avatar_url, full_name)"
    );

  if (error) {
    throw new Error(`teachers_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as TeacherRow[];
}

export async function warmTeacherProfileCache() {
  const rows = await fetchTeacherRows();
  setTeacherProfileCache(rows.map(rowToTeacher));
  return getAllTeachersFromCache();
}

function profileInputToRow(input: TeacherProfileInput) {
  return {
    display_name: input.displayName.trim(),
    bio: input.bio.trim(),
    specialties: normalizeSpecialties(input.specialties),
    experience_years: Math.max(0, input.experienceYears),
    status: input.status,
    hourly_rate_php: input.hourlyRatePhp,
  };
}

export async function updateTeacherProfileInDb(
  id: string,
  input: TeacherProfileInput
): Promise<Teacher | null> {
  const supabase = await createClient();
  const existing = getTeacherFromCache(id);
  const payload = {
    ...profileInputToRow(input),
    status: input.status ?? existing?.status ?? "pending",
    hourly_rate_php: input.hourlyRatePhp ?? existing?.hourlyRatePhp ?? 150,
  };

  const { data, error } = await supabase
    .from("teachers")
    .update(payload)
    .eq("id", id)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, profiles(avatar_url, full_name)"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_update_failed: ${error.message}`);
  }
  if (!data) return null;

  if (input.avatarUrl !== undefined) {
    await supabase.from("profiles").update({ avatar_url: input.avatarUrl }).eq("id", id);
  }

  const teacher = rowToTeacher(data as TeacherRow);
  patchTeacherProfileCache(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}

export async function updateTeacherStatusInDb(
  id: string,
  status: Teacher["status"]
): Promise<Teacher | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachers")
    .update({ status })
    .eq("id", id)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, profiles(avatar_url, full_name)"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_status_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const teacher = rowToTeacher(data as TeacherRow);
  patchTeacherProfileCache(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}

export async function updateTeacherHourlyRatePhpInDb(
  id: string,
  hourlyRatePhp: number
): Promise<Teacher | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachers")
    .update({ hourly_rate_php: hourlyRatePhp })
    .eq("id", id)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, profiles(avatar_url, full_name)"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_hourly_rate_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const teacher = rowToTeacher(data as TeacherRow);
  patchTeacherProfileCache(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}

export async function createTeacherProfileFromApplicationInDb(
  applicationId: string,
  teacherUserId: string,
  input: TeacherProfileInput & { avatarUrl?: string }
): Promise<Teacher> {
  if (!teacherUserId.trim()) {
    throw new Error("teacher_user_id_required");
  }

  const supabase = await createClient();
  const payload = {
    id: teacherUserId,
    display_name: input.displayName.trim(),
    bio: input.bio.trim(),
    specialties: normalizeSpecialties(input.specialties),
    experience_years: Math.max(0, input.experienceYears),
    status: "pending" as Teacher["status"],
    hourly_rate_php: input.hourlyRatePhp ?? 150,
    application_id: applicationId,
    timezone: "Asia/Manila",
  };

  const { data, error } = await supabase
    .from("teachers")
    .upsert(payload)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, profiles(avatar_url, full_name)"
    )
    .single();

  if (error) {
    throw new Error(`teacher_create_failed: ${error.message}`);
  }

  if (input.avatarUrl) {
    await supabase
      .from("profiles")
      .update({ avatar_url: input.avatarUrl })
      .eq("id", teacherUserId);
  }

  await linkTeacherApplicationToTeacherInDb(applicationId, teacherUserId);

  const teacher = rowToTeacher(data as TeacherRow);
  patchTeacherProfileCache(teacher);
  return { ...teacher, specialties: [...teacher.specialties] };
}
