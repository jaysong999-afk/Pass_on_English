import type { TeacherApplication } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import {
  getTeacherApplicationCache,
  patchTeacherApplicationCache,
  setTeacherApplicationCache,
} from "@/lib/teacher-applications/application-cache";

interface TeacherApplicationRow {
  id: string;
  full_name: string;
  date_of_birth: string;
  phone: string;
  bank_account: string;
  facebook_messenger_id: string;
  address: string;
  email: string;
  status: TeacherApplication["status"];
  submitted_at: string;
  reviewed_at: string | null;
  teacher_id: string | null;
  video_platforms: TeacherApplication["videoPlatforms"] | null;
}

function rowToApplication(row: TeacherApplicationRow): TeacherApplication {
  return {
    id: row.id,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    phone: row.phone,
    bankAccount: row.bank_account,
    facebookMessengerId: row.facebook_messenger_id,
    address: row.address,
    email: row.email,
    status: row.status,
    submittedAt: row.submitted_at,
    teacherId: row.teacher_id,
    videoPlatforms: row.video_platforms?.length ? row.video_platforms : ["ZOOM"],
  };
}

async function fetchApplicationRows(): Promise<TeacherApplicationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .select(
      "id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id, address, email, status, submitted_at, reviewed_at, teacher_id, video_platforms"
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`teacher_applications_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as TeacherApplicationRow[];
}

async function refreshApplicationCache() {
  const rows = await fetchApplicationRows();
  const applications = rows.map(rowToApplication);
  setTeacherApplicationCache(applications);
  return applications;
}

export async function warmTeacherApplicationCache() {
  return refreshApplicationCache();
}

export async function listTeacherApplicationsInDb() {
  return refreshApplicationCache();
}

export function getPendingTeacherApplicationsSync() {
  return getTeacherApplicationCache()
    .filter((a) => a.status === "pending")
    .map((a) => ({ ...a }));
}

export async function getTeacherApplicationByIdInDb(id: string) {
  const cached = getTeacherApplicationCache().find((a) => a.id === id);
  if (cached) return { ...cached };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .select(
      "id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id, address, email, status, submitted_at, reviewed_at, teacher_id, video_platforms"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_application_fetch_failed: ${error.message}`);
  }
  if (!data) return null;

  const application = rowToApplication(data as TeacherApplicationRow);
  patchTeacherApplicationCache(application);
  return { ...application };
}

export async function getTeacherApplicationForApplicantInDb(
  applicationId: string,
  userId: string,
  email: string
): Promise<TeacherApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .select(
      "id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id, address, email, status, submitted_at, reviewed_at, teacher_id, video_platforms"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_application_fetch_failed: ${error.message}`);
  }
  if (!data) return null;

  const row = data as TeacherApplicationRow;
  const emailMatch = row.email.trim().toLowerCase() === email.trim().toLowerCase();
  const ownerMatch = row.teacher_id === userId;
  if (!emailMatch && !ownerMatch) {
    return null;
  }

  const application = rowToApplication(row);
  patchTeacherApplicationCache(application);
  return { ...application };
}

export async function saveTeacherApplicationInDb(
  input: Omit<TeacherApplication, "id" | "status" | "submittedAt">
): Promise<TeacherApplication> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .insert({
      full_name: input.fullName.trim(),
      date_of_birth: input.dateOfBirth,
      phone: input.phone.trim(),
      bank_account: input.bankAccount.trim(),
      facebook_messenger_id: input.facebookMessengerId.trim(),
      address: input.address.trim(),
      email: input.email.trim(),
      status: "pending",
      video_platforms: input.videoPlatforms,
    })
    .select(
      "id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id, address, email, status, submitted_at, reviewed_at, teacher_id, video_platforms"
    )
    .single();

  if (error) {
    throw new Error(`teacher_application_create_failed: ${error.message}`);
  }

  const application = rowToApplication(data as TeacherApplicationRow);
  patchTeacherApplicationCache(application);
  return { ...application };
}

export async function updateTeacherApplicationStatusInDb(
  id: string,
  status: TeacherApplication["status"],
  reviewedBy?: string
): Promise<TeacherApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      ...(reviewedBy ? { reviewed_by: reviewedBy } : {}),
    })
    .eq("id", id)
    .select(
      "id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id, address, email, status, submitted_at, reviewed_at, teacher_id, video_platforms"
    )
    .single();

  if (error) {
    throw new Error(`teacher_application_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const application = rowToApplication(data as TeacherApplicationRow);
  patchTeacherApplicationCache(application);
  return { ...application };
}

export async function getTeacherApplicationTeacherIdInDb(
  applicationId: string
): Promise<string | null> {
  const cached = getTeacherApplicationCache().find((a) => a.id === applicationId);
  if (cached?.teacherId) {
    return cached.teacherId;
  }

  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("teacher_applications")
    .select("teacher_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(`teacher_application_teacher_id_fetch_failed: ${error.message}`);
  }

  return data?.teacher_id ?? null;
}

export async function linkTeacherApplicationToTeacherInDb(
  applicationId: string,
  teacherId: string
) {
  const supabase = createPrivilegedClient();
  const { error: appError } = await supabase
    .from("teacher_applications")
    .update({ teacher_id: teacherId })
    .eq("id", applicationId);

  if (appError) {
    throw new Error(`teacher_application_link_failed: ${appError.message}`);
  }

  const { error: teacherError } = await supabase
    .from("teachers")
    .update({ application_id: applicationId })
    .eq("id", teacherId);

  if (teacherError) {
    throw new Error(`teacher_application_id_update_failed: ${teacherError.message}`);
  }

  const cached = getTeacherApplicationCache().find((a) => a.id === applicationId);
  if (cached) {
    patchTeacherApplicationCache({ ...cached, teacherId });
  }
}
