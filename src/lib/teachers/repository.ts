import type { Teacher, TeacherProfileInput, TeacherSpecialty } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store-sync";
import {
  getAllTeachersFromCache,
  getTeacherFromCache,
  patchTeacherProfileCache,
  setTeacherProfileCache,
} from "@/lib/teachers/teacher-profile-cache";
import { linkTeacherApplicationToTeacherInDb } from "@/lib/teacher-applications/repository";
import { createPrivilegedClient } from "@/lib/supabase/admin";

export interface TeacherSelfSettings {
  teacher: Teacher;
  email: string;
  legalName: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  messengerId: string;
  bankAccount: string;
}

export interface TeacherSelfSettingsUpdate {
  displayName: string;
  bio: string;
  specialties: TeacherSpecialty[];
  experienceYears: number;
  avatarUrl?: string;
  phone: string;
  address: string;
  messengerId: string;
  videoPlatforms: import("@/types").VideoPlatform[];
}

interface TeacherRow {
  id: string;
  display_name: string;
  bio: string | null;
  specialties: string[] | null;
  experience_years: number | null;
  status: Teacher["status"];
  hourly_rate_php: number | null;
  application_id: string | null;
  created_at: string;
  video_platforms: import("@/types").VideoPlatform[] | null;
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
    createdAt: row.created_at,
    applicationId: row.application_id ?? undefined,
    profileCompleted:
      bio.length > 0 && displayName.length > 0 && specialties.length > 0,
    email: undefined,
    videoPlatforms: row.video_platforms?.length ? row.video_platforms : ["ZOOM"],
  });
}

async function fetchTeacherRows(): Promise<TeacherRow[]> {
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("teachers")
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)"
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
    ...(input.videoPlatforms ? { video_platforms: input.videoPlatforms } : {}),
  };
}

export async function updateTeacherProfileInDb(
  id: string,
  input: TeacherProfileInput
): Promise<Teacher | null> {
  const supabase = createPrivilegedClient();
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
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)"
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
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("teachers")
    .update({ status })
    .eq("id", id)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)"
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
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("teachers")
    .update({ hourly_rate_php: hourlyRatePhp })
    .eq("id", id)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)"
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

export async function getTeacherSelfSettingsInDb(
  teacherId: string,
  email: string
): Promise<TeacherSelfSettings | null> {
  const admin = createPrivilegedClient();
  const { data: teacherRow, error: teacherError } = await admin
    .from("teachers")
    .select("id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)")
    .eq("id", teacherId)
    .maybeSingle();
  if (teacherError) throw new Error(`teacher_settings_fetch_failed: ${teacherError.message}`);
  if (!teacherRow) return null;

  const typedTeacherRow = teacherRow as unknown as TeacherRow;
  const applicationId = typedTeacherRow.application_id;
  const applicationQuery = admin
    .from("teacher_applications")
    .select("full_name, date_of_birth, phone, address, facebook_messenger_id, bank_account");
  const { data: application, error: applicationError } = applicationId
    ? await applicationQuery.eq("id", applicationId).maybeSingle()
    : await applicationQuery.eq("teacher_id", teacherId).maybeSingle();
  if (applicationError) {
    throw new Error(`teacher_application_settings_fetch_failed: ${applicationError.message}`);
  }

  const profile = normalizeProfile(typedTeacherRow);
  return {
    teacher: rowToTeacher(typedTeacherRow),
    email,
    legalName: application?.full_name?.trim() || profile?.full_name?.trim() || email,
    dateOfBirth: application?.date_of_birth ?? "",
    phone: application?.phone?.trim() || "",
    address: application?.address?.trim() || "",
    messengerId: application?.facebook_messenger_id?.trim() || "",
    bankAccount: application?.bank_account?.trim() || "",
  };
}

export async function updateTeacherSelfSettingsInDb(
  teacherId: string,
  email: string,
  input: TeacherSelfSettingsUpdate
): Promise<TeacherSelfSettings | null> {
  const current = await getTeacherSelfSettingsInDb(teacherId, email);
  if (!current) return null;

  const admin = createPrivilegedClient();
  const { error: teacherError } = await admin
    .from("teachers")
    .update({
      display_name: input.displayName.trim(),
      bio: input.bio.trim(),
      specialties: normalizeSpecialties(input.specialties),
      experience_years: Math.max(0, input.experienceYears),
      video_platforms: input.videoPlatforms,
    })
    .eq("id", teacherId);
  if (teacherError) throw new Error(`teacher_self_update_failed: ${teacherError.message}`);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ phone: input.phone.trim(), ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}) })
    .eq("id", teacherId);
  if (profileError) throw new Error(`teacher_contact_update_failed: ${profileError.message}`);

  if (current.teacher.applicationId) {
    const { error: applicationError } = await admin
      .from("teacher_applications")
      .update({
        phone: input.phone.trim(),
        address: input.address.trim(),
        facebook_messenger_id: input.messengerId.trim(),
      })
      .eq("id", current.teacher.applicationId);
    if (applicationError) {
      throw new Error(`teacher_application_contact_update_failed: ${applicationError.message}`);
    }
  }

  const updated = await getTeacherSelfSettingsInDb(teacherId, email);
  if (updated) patchTeacherProfileCache(updated.teacher);
  return updated;
}

export async function createTeacherProfileFromApplicationInDb(
  applicationId: string,
  teacherUserId: string,
  input: TeacherProfileInput & { avatarUrl?: string }
): Promise<Teacher> {
  if (!teacherUserId.trim()) {
    throw new Error("teacher_user_id_required");
  }

  // The route verifies the authenticated applicant and pending application
  // before entering this server-only persistence boundary. Direct clients do
  // not receive access to hourly_rate_php/application_id columns.
  const supabase = createPrivilegedClient();
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
    video_platforms: input.videoPlatforms ?? ["ZOOM"],
  };

  const { data, error } = await supabase
    .from("teachers")
    .upsert(payload)
    .select(
      "id, display_name, bio, specialties, experience_years, status, hourly_rate_php, application_id, created_at, video_platforms, profiles(avatar_url, full_name)"
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
