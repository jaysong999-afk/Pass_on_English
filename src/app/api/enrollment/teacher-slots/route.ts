import { NextResponse } from "next/server";
import {
  getOpenSlotsForTeacher,
  sortTeachersByPlanAvailability,
} from "@/lib/teacher-availability";
import {
  ensurePublicContentBootstrapped,
  ensureSchedulesBootstrapped,
} from "@/lib/lesson-scheduler-bootstrap";
import { getPublicTeachers } from "@/lib/teacher-profile-store-sync";
import { ensureTeacherAvailabilityLoaded } from "@/lib/teacher-availability/repository";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { generateGridStartTimes, slotEndTime } from "@/lib/availability/time-utils";
import { getDayLabelInTimezone, formatSlotTimeInTimezone } from "@/lib/availability/timezone";
import { isSlotEnabled } from "@/lib/teacher-availability-store-sync";
import { isTeacherSlotFree } from "@/lib/lessons/schedule-service";
import { getLessonById } from "@/lib/teacher-lesson-store-sync";

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
    const date = searchParams.get("date")?.trim() ?? "";
    const timeZone = searchParams.get("timeZone")?.trim() || CANONICAL_TIMEZONE;
    const lessonId = searchParams.get("lessonId")?.trim() ?? "";

    if (scheduleDays.length === 0 && !date) {
      return NextResponse.json({ error: "schedule_days_required" }, { status: 400 });
    }

    const minutes = sessionMinutes > 0 ? sessionMinutes : 20;

    if (teacherId) {
      await ensureTeacherAvailabilityLoaded(teacherId);

      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return NextResponse.json({ error: "invalid_date" }, { status: 400 });
        }

        await ensureSchedulesBootstrapped();
        const lesson = lessonId ? getLessonById(lessonId) : undefined;
        const day = getDayLabelInTimezone(new Date(`${date}T12:00:00Z`), CANONICAL_TIMEZONE);
        const openSlots = generateGridStartTimes()
          .filter((start) => isSlotEnabled(teacherId, day, start))
          .filter((start) => {
            const scheduledAt = new Date(`${date}T${start}:00+09:00`).toISOString();
            if (new Date(scheduledAt).getTime() <= Date.now()) return false;
            return isTeacherSlotFree(
              teacherId,
              scheduledAt,
              lessonId || undefined,
              lesson?.durationMinutes ?? minutes,
              lesson?.studentId ? { studentId: lesson.studentId } : undefined
            );
          })
          .map((start) => ({
            id: `${teacherId}-${date}-${start}`,
            teacherId,
            dayLabel: day,
            startTime: formatSlotTimeInTimezone(day, start, timeZone),
            endTime: formatSlotTimeInTimezone(day, slotEndTime(start), timeZone),
            isOpen: true,
          }));

        return NextResponse.json({ date, timeZone, openSlots });
      }

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
