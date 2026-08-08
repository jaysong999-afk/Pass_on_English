import { NextResponse } from "next/server";
import {
  copyTeacherDaySlots,
  getTeacherWeeklyAvailability,
  setTeacherWeeklyAvailability,
  toggleTeacherSlot,
} from "@/lib/teacher-availability-store";
import type { DayLabel, WeeklySlotMap } from "@/lib/availability/types";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import { reserveTeacherWeeklySlot, reserveTeacherWeeklySlotsForPlan } from "@/lib/teacher-booked-slots";
import { buildScheduleSlotViews, getOpenSlotsForTeacher } from "@/lib/teacher-availability";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId") ?? CURRENT_TEACHER_ID;
  const planDays = searchParams.get("planDays");

  if (planDays) {
    const days = planDays.split(",").filter(Boolean);
    const sessionMinutes = searchParams.get("sessionMinutes");
    const minutes = sessionMinutes ? Number(sessionMinutes) : undefined;
    const openSlots = getOpenSlotsForTeacher(
      teacherId,
      days,
      minutes && minutes > 0 ? minutes : undefined
    );
    return NextResponse.json({ openSlots });
  }

  const availability = getTeacherWeeklyAvailability(teacherId);
  const scheduleViews = buildScheduleSlotViews(teacherId);

  return NextResponse.json({ availability, scheduleViews });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const teacherId = (body.teacherId as string) ?? CURRENT_TEACHER_ID;
  const action = body.action as string | undefined;

  if (action === "toggle") {
    const day = body.day as DayLabel;
    const startTime = body.startTime as string;
    const availability = toggleTeacherSlot(teacherId, day, startTime);
    return NextResponse.json({ availability });
  }

  if (action === "copy") {
    const sourceDay = body.sourceDay as DayLabel;
    const targetDays = (body.targetDays as DayLabel[]) ?? [];
    const availability = copyTeacherDaySlots(teacherId, sourceDay, targetDays);
    return NextResponse.json({ availability });
  }

  if (action === "reserve") {
    const day = body.day as DayLabel | undefined;
    const startTime = body.startTime as string;
    const studentName = body.studentName as string | undefined;
    const planDays = (body.planDays as DayLabel[]) ?? [];
    const sessionMinutes =
      body.sessionMinutes != null ? Number(body.sessionMinutes) : 20;

    if (planDays.length > 0 && !day) {
      reserveTeacherWeeklySlotsForPlan(
        teacherId,
        planDays,
        startTime,
        studentName,
        sessionMinutes > 0 ? sessionMinutes : 20
      );
    } else if (day) {
      reserveTeacherWeeklySlot(teacherId, day, startTime, studentName, sessionMinutes);
    } else {
      return NextResponse.json({ error: "day_or_plan_days_required" }, { status: 400 });
    }

    const openSlots = planDays.length
      ? getOpenSlotsForTeacher(
          teacherId,
          planDays,
          sessionMinutes > 0 ? sessionMinutes : undefined
        )
      : [];
    return NextResponse.json({ ok: true, openSlots });
  }

  const slots = body.slots as WeeklySlotMap | undefined;
  if (!slots) {
    return NextResponse.json({ error: "slots_required" }, { status: 400 });
  }

  const availability = setTeacherWeeklyAvailability(teacherId, slots);
  return NextResponse.json({ availability });
}
