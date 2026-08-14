import { NextResponse } from "next/server";
import {
  getOpenSlotsForTeacher,
  sortTeachersByPlanAvailability,
} from "@/lib/teacher-availability";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { ensureTeacherAvailabilityLoaded } from "@/lib/teacher-availability/repository";

function parseScheduleDays(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    await ensurePublicContentBootstrapped();

    const { searchParams } = new URL(request.url);
    const scheduleDays = parseScheduleDays(searchParams.get("scheduleDays"));
    const sessionMinutes = Number(searchParams.get("sessionMinutes") ?? 20);
    const teacherId = searchParams.get("teacherId")?.trim() ?? "";

    if (scheduleDays.length === 0) {
      return NextResponse.json({ error: "schedule_days_required" }, { status: 400 });
    }

    const minutes = sessionMinutes > 0 ? sessionMinutes : 20;

    if (teacherId) {
      await ensureTeacherAvailabilityLoaded(teacherId);
      const openSlots = getOpenSlotsForTeacher(teacherId, scheduleDays, minutes);
      return NextResponse.json({ openSlots });
    }

    const teachers = getPublicTeachers();
    const sorted = sortTeachersByPlanAvailability(teachers, scheduleDays, minutes);

    return NextResponse.json({
      available: sorted.available.map(({ teacher, openSlotCount }) => ({
        teacherId: teacher.id,
        openSlotCount,
      })),
      closed: sorted.closed.map(({ teacher, openSlotCount }) => ({
        teacherId: teacher.id,
        openSlotCount,
      })),
    });
  } catch (error) {
    console.error("[GET /api/enrollment/teacher-slots]", error);
    return NextResponse.json({ error: "teacher_slots_fetch_failed" }, { status: 500 });
  }
}
