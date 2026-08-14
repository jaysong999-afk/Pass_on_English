import { NextResponse } from "next/server";
import { getAllTeachers } from "@/lib/teacher-profile-store";
import { createTeacherProfileFromApplicationInDb } from "@/lib/teachers/repository";
import { getTeacherApplicationForApplicantInDb } from "@/lib/teacher-applications/repository";
import type { TeacherProfileInput } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";

function validateProfile(body: TeacherProfileInput & { applicationId?: string }) {
  if (!body.displayName?.trim()) return "display_name_required";
  if (!body.bio?.trim()) return "bio_required";
  if (!Array.isArray(body.specialties) || body.specialties.length === 0) {
    return "specialties_required";
  }
  if (!body.specialties.every(isTeacherSpecialty)) return "invalid_specialties";
  if (body.experienceYears == null || body.experienceYears < 0) return "invalid_experience";
  return null;
}

export async function GET() {
  await ensureSchedulesBootstrapped();
  return NextResponse.json({ teachers: getAllTeachers() });
}

export async function POST(request: Request) {
  await ensureSchedulesBootstrapped();

  try {
    const context = await requireRole("teacher");
    const body = await request.json();
    const error = validateProfile(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const applicationId = String(body.applicationId ?? "").trim();
    if (!applicationId) {
      return NextResponse.json({ error: "application_id_required" }, { status: 400 });
    }

    const application = await getTeacherApplicationForApplicantInDb(
      applicationId,
      context.userId,
      context.email
    );
    if (!application) {
      return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    }
    if (application.status !== "pending") {
      return NextResponse.json({ error: "application_not_pending" }, { status: 409 });
    }

    const teacher = await createTeacherProfileFromApplicationInDb(applicationId, context.userId, {
      displayName: body.displayName,
      bio: body.bio,
      specialties: body.specialties,
      experienceYears: body.experienceYears,
      avatarUrl: body.avatarUrl,
      hourlyRatePhp: body.hourlyRatePhp,
    });

    return NextResponse.json({ teacher }, { status: 201 });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }

    console.error("[teachers/profile POST]", err);
    const message = err instanceof Error ? err.message : "profile_save_failed";
    if (message.includes("teacher_create_failed")) {
      return NextResponse.json({ error: "profile_save_failed" }, { status: 500 });
    }
    return NextResponse.json({ error: "profile_save_failed" }, { status: 500 });
  }
}
