import { NextResponse } from "next/server";
import type { DayLabel, WeeklySlotMap } from "@/lib/availability/types";
import { emptyWeeklySlotMap } from "@/lib/availability/time-utils";
import {
  authorizeAvailabilityRead,
  authorizeAvailabilityWrite,
} from "@/lib/auth/availability-access";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { requireTeacherAuth } from "@/lib/auth/session";
import { buildScheduleSlotViews, getOpenSlotsForTeacher } from "@/lib/teacher-availability";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  copyTeacherDaySlotsInDb,
  ensureTeacherAvailabilityLoaded,
  getTeacherWeeklyAvailabilityFromDb,
  restoreOccupiedWeeklyAvailabilityInDb,
  reserveTeacherWeeklySlotsInDb,
  setTeacherWeeklyAvailabilityInDb,
  toggleTeacherSlotInDb,
} from "@/lib/teacher-availability/repository";

function emptyAvailabilityResponse(teacherId: string) {
  return NextResponse.json({
    availability: {
      teacherId,
      slots: emptyWeeklySlotMap(),
      updatedAt: new Date().toISOString(),
    },
    scheduleViews: [],
  });
}

async function resolveRawTeacherId(explicitId: string | null): Promise<string> {
  if (explicitId) return explicitId;
  const { teacherId } = await requireTeacherAuth();
  return teacherId;
}

export async function GET(request: Request) {
  try {
    await ensureSchedulesBootstrapped();

    const { searchParams } = new URL(request.url);
    const planDays = searchParams.get("planDays");
    const explicitTeacherId = searchParams.get("teacherId");

    let rawTeacherId: string;
    try {
      rawTeacherId = explicitTeacherId ?? (await resolveRawTeacherId(null));
    } catch (error) {
      if (!explicitTeacherId) {
        return NextResponse.json({ error: "teacherId required" }, { status: 400 });
      }
      rawTeacherId = explicitTeacherId;
    }

    let teacherId: string;
    try {
      ({ teacherId } = await authorizeAvailabilityRead(rawTeacherId));
    } catch (error) {
      return authErrorResponse(error);
    }

    if (!teacherId) {
      return emptyAvailabilityResponse(rawTeacherId);
    }

    await ensureTeacherAvailabilityLoaded(teacherId);
    await restoreOccupiedWeeklyAvailabilityInDb(teacherId);

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

    const availability = await getTeacherWeeklyAvailabilityFromDb(teacherId);
    const scheduleViews = buildScheduleSlotViews(teacherId);

    return NextResponse.json({ availability, scheduleViews });
  } catch (error) {
    console.error("[teacher/availability GET]", error);
    return NextResponse.json({ error: "availability_fetch_failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureSchedulesBootstrapped();

    const body = await request.json();
    const action = body.action as string | undefined;

    let rawTeacherId: string;
    try {
      rawTeacherId = (body.teacherId as string) ?? (await resolveRawTeacherId(null));
    } catch (error) {
      return authErrorResponse(error);
    }

    let teacherId: string;
    try {
      ({ teacherId } = await authorizeAvailabilityWrite(rawTeacherId, action));
    } catch (error) {
      return authErrorResponse(error);
    }

    if (!teacherId) {
      return NextResponse.json({ error: "teacher_not_found" }, { status: 404 });
    }

    if (action === "toggle") {
      const day = body.day as DayLabel;
      const startTime = body.startTime as string;
      const availability = await toggleTeacherSlotInDb(teacherId, day, startTime);
      return NextResponse.json({ availability });
    }

    if (action === "copy") {
      const sourceDay = body.sourceDay as DayLabel;
      const targetDays = (body.targetDays as DayLabel[]) ?? [];
      const availability = await copyTeacherDaySlotsInDb(teacherId, sourceDay, targetDays);
      return NextResponse.json({ availability });
    }

    if (action === "reserve") {
      const day = body.day as DayLabel | undefined;
      const startTime = body.startTime as string;
      const studentName = body.studentName as string | undefined;
      const planDays = (body.planDays as DayLabel[]) ?? [];
      const sessionMinutes =
        body.sessionMinutes != null ? Number(body.sessionMinutes) : 20;

      if (planDays.length === 0 && !day) {
        return NextResponse.json({ error: "day_or_plan_days_required" }, { status: 400 });
      }

      await reserveTeacherWeeklySlotsInDb(teacherId, {
        day,
        planDays,
        startTime,
        sessionMinutes,
        studentName,
      });

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

    const availability = await setTeacherWeeklyAvailabilityInDb(teacherId, slots);
    return NextResponse.json({ availability });
  } catch (error) {
    console.error("[teacher/availability PUT]", error);
    const message = error instanceof Error ? error.message : "availability_update_failed";
    if (message.includes("day_or_plan_days_required")) {
      return NextResponse.json({ error: "day_or_plan_days_required" }, { status: 400 });
    }
    if (message.includes("row-level security")) {
      return NextResponse.json(
        {
          error: "availability_rls_blocked",
          hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local or apply migration 015_teacher_availability_rls.sql",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "availability_update_failed" }, { status: 500 });
  }
}
