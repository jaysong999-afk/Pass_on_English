import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { isTeacherSpecialty } from "@/lib/teacher-specialties";
import { getTeacherSelfSettingsInDb, updateTeacherSelfSettingsInDb } from "@/lib/teachers/repository";

export async function GET() {
  try {
    const auth = await requireRole("teacher");
    const settings = await getTeacherSelfSettingsInDb(auth.userId, auth.email);
    if (!settings) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ settings });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("[teacher/settings GET]", error);
    return NextResponse.json({ error: "settings_fetch_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole("teacher");
    const body = await request.json().catch(() => null);
    const displayName = String(body?.displayName ?? "").trim();
    const bio = String(body?.bio ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const address = String(body?.address ?? "").trim();
    const messengerId = String(body?.messengerId ?? "").trim();
    const experienceYears = Number(body?.experienceYears);
    const specialties = Array.isArray(body?.specialties) ? body.specialties : [];
    const avatarUrl = body?.avatarUrl == null ? undefined : String(body.avatarUrl);
    const videoPlatforms = Array.isArray(body?.videoPlatforms) ? body.videoPlatforms : [];

    if (!displayName || !bio || !phone || !address || !messengerId || specialties.length === 0 || videoPlatforms.length === 0) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    if (!videoPlatforms.every((item: unknown) => item === "ZOOM" || item === "VOOV")) return NextResponse.json({ error: "invalid_video_platforms" }, { status: 400 });
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 80) {
      return NextResponse.json({ error: "invalid_experience" }, { status: 400 });
    }
    if (!specialties.every((item: unknown) => typeof item === "string" && isTeacherSpecialty(item))) {
      return NextResponse.json({ error: "invalid_specialties" }, { status: 400 });
    }
    if (displayName.length > 80 || bio.length > 2000 || phone.length > 30 || address.length > 300 || messengerId.length > 200) {
      return NextResponse.json({ error: "invalid_length" }, { status: 400 });
    }

    const settings = await updateTeacherSelfSettingsInDb(auth.userId, auth.email, {
      displayName, bio, phone, address, messengerId, experienceYears,
      specialties: specialties as Parameters<typeof updateTeacherSelfSettingsInDb>[2]["specialties"], avatarUrl,
      videoPlatforms,
    });
    if (!settings) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ settings });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("[teacher/settings PATCH]", error);
    return NextResponse.json({ error: "settings_update_failed" }, { status: 500 });
  }
}
