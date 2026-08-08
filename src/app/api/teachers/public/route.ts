import { NextResponse } from "next/server";
import { getPublicTeachers } from "@/lib/teacher-profile-store";

export async function GET() {
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
