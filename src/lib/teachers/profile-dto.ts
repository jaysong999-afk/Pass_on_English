import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import type { Teacher, TeacherProfileInput, TeacherSpecialty } from "@/types";

type ProfileFields = Pick<
  TeacherProfileInput,
  "displayName" | "bio" | "specialties" | "experienceYears" | "avatarUrl"
>;

export type TeacherSignupProfileDto = ProfileFields & { applicationId: string };
export type AdminTeacherProfileDto = ProfileFields & {
  status?: Teacher["status"];
  hourlyRatePhp?: number;
};

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const TEACHER_STATUSES: Teacher["status"][] = [
  "pending",
  "active",
  "on_leave",
  "terminated",
];

function parseProfileFields(body: unknown): ParseResult<ProfileFields> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_request" };
  }

  const input = body as Record<string, unknown>;
  if (typeof input.displayName !== "string" || !input.displayName.trim()) {
    return { ok: false, error: "display_name_required" };
  }
  if (typeof input.bio !== "string" || !input.bio.trim()) {
    return { ok: false, error: "bio_required" };
  }
  if (!Array.isArray(input.specialties) || input.specialties.length === 0) {
    return { ok: false, error: "specialties_required" };
  }
  if (!input.specialties.every(isTeacherSpecialty)) {
    return { ok: false, error: "invalid_specialties" };
  }
  if (
    typeof input.experienceYears !== "number" ||
    !Number.isFinite(input.experienceYears) ||
    input.experienceYears < 0
  ) {
    return { ok: false, error: "invalid_experience" };
  }
  if (input.avatarUrl !== undefined && typeof input.avatarUrl !== "string") {
    return { ok: false, error: "invalid_avatar_url" };
  }

  return {
    ok: true,
    data: {
      displayName: input.displayName.trim(),
      bio: input.bio.trim(),
      specialties: input.specialties as TeacherSpecialty[],
      experienceYears: input.experienceYears,
      avatarUrl: input.avatarUrl as string | undefined,
    },
  };
}

export function parseTeacherSignupProfileDto(
  body: unknown
): ParseResult<TeacherSignupProfileDto> {
  const profile = parseProfileFields(body);
  if (!profile.ok) return profile;

  const applicationId = String((body as Record<string, unknown>).applicationId ?? "").trim();
  if (!applicationId) return { ok: false, error: "application_id_required" };

  return { ok: true, data: { ...profile.data, applicationId } };
}

export function parseAdminTeacherProfileDto(
  body: unknown
): ParseResult<AdminTeacherProfileDto> {
  const profile = parseProfileFields(body);
  if (!profile.ok) return profile;

  const input = body as Record<string, unknown>;
  if (
    input.status !== undefined &&
    (typeof input.status !== "string" ||
      !TEACHER_STATUSES.includes(input.status as Teacher["status"]))
  ) {
    return { ok: false, error: "invalid_status" };
  }
  if (
    input.hourlyRatePhp !== undefined &&
    (typeof input.hourlyRatePhp !== "number" ||
      !Number.isFinite(input.hourlyRatePhp) ||
      input.hourlyRatePhp < 0)
  ) {
    return { ok: false, error: "invalid_hourly_rate" };
  }

  return {
    ok: true,
    data: {
      ...profile.data,
      status: input.status as Teacher["status"] | undefined,
      hourlyRatePhp: input.hourlyRatePhp as number | undefined,
    },
  };
}
