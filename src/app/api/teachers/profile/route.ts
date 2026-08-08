import { NextResponse } from "next/server";
import {
  createTeacherProfileFromApplication,
  getAllTeachers,
} from "@/lib/teacher-profile-store";
import type { TeacherProfileInput } from "@/types";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";

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
  return NextResponse.json({ teachers: getAllTeachers() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const error = validateProfile(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const applicationId = body.applicationId as string | undefined;
  if (!applicationId) {
    return NextResponse.json({ error: "application_id_required" }, { status: 400 });
  }

  const teacher = createTeacherProfileFromApplication(applicationId, {
    displayName: body.displayName,
    bio: body.bio,
    specialties: body.specialties,
    experienceYears: body.experienceYears,
    avatarUrl: body.avatarUrl,
    email: body.email,
    fullName: body.fullName,
  });

  return NextResponse.json({ teacher }, { status: 201 });
}
