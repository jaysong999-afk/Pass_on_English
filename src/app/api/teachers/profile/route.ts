import { NextResponse } from "next/server";
import { getAllTeachers } from "@/lib/teacher-profile-store-sync";
import { createTeacherProfileFromApplicationInDb } from "@/lib/teachers/repository";
import { getTeacherApplicationForApplicantInDb } from "@/lib/teacher-applications/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { parseTeacherSignupProfileDto } from "@/lib/teachers/profile-dto";

export async function GET() {
  try {
    await requireRole("admin");
    await ensureSchedulesBootstrapped();
    return NextResponse.json({ teachers: getAllTeachers() });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[teachers/profile GET]", err);
    return NextResponse.json({ error: "profile_fetch_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole("teacher");
    const parsed = parseTeacherSignupProfileDto(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const body = parsed.data;

    await ensureSchedulesBootstrapped();

    const application = await getTeacherApplicationForApplicantInDb(
      body.applicationId,
      context.userId,
      context.email
    );
    if (!application) {
      return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    }
    if (application.status !== "pending") {
      return NextResponse.json({ error: "application_not_pending" }, { status: 409 });
    }

    const teacher = await createTeacherProfileFromApplicationInDb(body.applicationId, context.userId, {
      displayName: body.displayName,
      bio: body.bio,
      specialties: body.specialties,
      experienceYears: body.experienceYears,
      avatarUrl: body.avatarUrl,
      videoPlatforms: application.videoPlatforms,
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
