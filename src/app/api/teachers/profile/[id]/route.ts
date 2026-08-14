import { NextResponse } from "next/server";
import { getTeacherById } from "@/lib/teacher-profile-store";
import { updateTeacherProfileInDb } from "@/lib/teachers/repository";
import type { TeacherProfileInput } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

function validateProfile(body: TeacherProfileInput) {
  if (!body.displayName?.trim()) return "display_name_required";
  if (!body.bio?.trim()) return "bio_required";
  if (!Array.isArray(body.specialties) || body.specialties.length === 0) {
    return "specialties_required";
  }
  if (!body.specialties.every(isTeacherSpecialty)) return "invalid_specialties";
  if (body.experienceYears == null || body.experienceYears < 0) return "invalid_experience";
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const teacher = getTeacherById(id);
  if (!teacher) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ teacher });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const body = (await request.json()) as TeacherProfileInput;
  const error = validateProfile(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const teacher = await updateTeacherProfileInDb(id, body);
  if (!teacher) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ teacher });
}
