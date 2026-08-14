import { NextResponse } from "next/server";
import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET() {
  await ensurePublicContentBootstrapped();
  const publicTeachers = getPublicTeachers().map(
    ({ id, displayName, bio, specialties, experienceYears, avatarUrl }) => ({
      id,
      displayName,
      bio,
      specialties,
      experienceYears,
      avatarUrl,
    })
  );
  return NextResponse.json({ teachers: publicTeachers });
}
