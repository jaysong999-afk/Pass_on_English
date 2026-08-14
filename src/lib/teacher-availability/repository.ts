import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime, TeacherWeeklyAvailability, WeeklySlotMap } from "@/lib/availability/types";
import {
  emptyWeeklySlotMap,
  normalizeSlotStart,
  occupiedSlotStarts,
  sortSlotTimes,
} from "@/lib/availability/time-utils";
import { createBootstrapDbClient, createRequestDbClient } from "@/lib/supabase/db-client";
import {
  getOccupiedWeeklySlots,
  isSlotBooked,
  reserveTeacherSessionOnDay,
  reserveTeacherWeeklySlotsForPlan,
  releaseTeacherWeeklySlot,
  releaseTeacherWeeklySlotsForPlan,
} from "@/lib/teacher-booked-slots";
import {
  getCachedWeeklySlots,
  setCachedWeeklySlots,
} from "@/lib/teacher-availability/availability-cache";

interface AvailabilityRow {
  teacher_id: string;
  day: DayLabel;
  start_time: string;
  updated_at?: string;
}

function formatTimeFromDb(value: string): SlotStartTime {
  return normalizeSlotStart(value.slice(0, 5));
}

function formatTimeForDb(value: SlotStartTime): string {
  const normalized = normalizeSlotStart(value);
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function rowsToMap(rows: AvailabilityRow[]): WeeklySlotMap {
  const map = emptyWeeklySlotMap();
  for (const row of rows) {
    if (!DAY_LABELS.includes(row.day)) continue;
    const start = formatTimeFromDb(row.start_time);
    if (!map[row.day].includes(start)) {
      map[row.day].push(start);
    }
  }
  for (const day of DAY_LABELS) {
    map[day] = sortSlotTimes(map[day]);
  }
  return map;
}

function mapToRows(teacherId: string, slots: WeeklySlotMap): AvailabilityRow[] {
  const rows: AvailabilityRow[] = [];
  for (const day of DAY_LABELS) {
    for (const start of sortSlotTimes(slots[day] ?? [])) {
      rows.push({
        teacher_id: teacherId,
        day,
        start_time: formatTimeForDb(start),
      });
    }
  }
  return rows;
}

function normalizeMap(map: WeeklySlotMap): WeeklySlotMap {
  const next = emptyWeeklySlotMap();
  for (const day of DAY_LABELS) {
    next[day] = sortSlotTimes(
      (map[day] ?? []).map((t) => normalizeSlotStart(t))
    );
  }
  return next;
}

function latestUpdatedAt(rows: AvailabilityRow[]): string {
  const timestamps = rows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort();
  return timestamps.at(-1) ?? new Date().toISOString();
}

async function fetchAvailabilityRows(teacherId: string): Promise<AvailabilityRow[]> {
  const supabase = await createRequestDbClient();
  const { data, error } = await supabase
    .from("teachers_weekly_availability")
    .select("teacher_id, day, start_time, updated_at")
    .eq("teacher_id", teacherId);

  if (error) {
    throw new Error(`teacher_availability_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as AvailabilityRow[];
}

export async function warmTeacherAvailabilityCache(teacherId: string): Promise<WeeklySlotMap> {
  const rows = await fetchAvailabilityRows(teacherId);
  const map = rowsToMap(rows);
  setCachedWeeklySlots(teacherId, map);
  return map;
}

/** Load every teacher row into cache (scheduler / enrollment open-slot checks). */
export async function warmAllTeacherAvailabilityCache(): Promise<void> {
  const supabase = await createRequestDbClient();
  const { data, error } = await supabase
    .from("teachers_weekly_availability")
    .select("teacher_id, day, start_time, updated_at");

  if (error) {
    throw new Error(`teacher_availability_fetch_all_failed: ${error.message}`);
  }

  const grouped = new Map<string, AvailabilityRow[]>();
  for (const row of (data ?? []) as AvailabilityRow[]) {
    const list = grouped.get(row.teacher_id) ?? [];
    list.push(row);
    grouped.set(row.teacher_id, list);
  }

  for (const [teacherId, rows] of grouped) {
    setCachedWeeklySlots(teacherId, rowsToMap(rows));
  }
}

export async function ensureTeacherAvailabilityLoaded(teacherId: string): Promise<WeeklySlotMap> {
  const cached = getCachedWeeklySlots(teacherId);
  if (cached) return cached;
  return warmTeacherAvailabilityCache(teacherId);
}

export async function getTeacherWeeklyAvailabilityFromDb(
  teacherId: string
): Promise<TeacherWeeklyAvailability> {
  const rows = await fetchAvailabilityRows(teacherId);
  const slots = rowsToMap(rows);
  setCachedWeeklySlots(teacherId, slots);
  return {
    teacherId,
    slots,
    updatedAt: latestUpdatedAt(rows),
  };
}

async function replaceTeacherWeeklySlots(
  teacherId: string,
  slots: WeeklySlotMap
): Promise<TeacherWeeklyAvailability> {
  const supabase = await createRequestDbClient();
  const normalized = normalizeMap(slots);
  for (const occupied of getOccupiedWeeklySlots()) {
    if (occupied.teacherId !== teacherId) continue;
    if (!normalized[occupied.day].includes(occupied.start)) {
      normalized[occupied.day].push(occupied.start);
    }
  }
  for (const day of DAY_LABELS) {
    normalized[day] = sortSlotTimes(normalized[day]);
  }
  const rows = mapToRows(teacherId, normalized);

  const { error: deleteError } = await supabase
    .from("teachers_weekly_availability")
    .delete()
    .eq("teacher_id", teacherId);

  if (deleteError) {
    throw new Error(`teacher_availability_delete_failed: ${deleteError.message}`);
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("teachers_weekly_availability")
      .insert(rows.map(({ teacher_id, day, start_time }) => ({ teacher_id, day, start_time })));

    if (insertError) {
      throw new Error(`teacher_availability_insert_failed: ${insertError.message}`);
    }
  }

  setCachedWeeklySlots(teacherId, normalized);
  return getTeacherWeeklyAvailabilityFromDb(teacherId);
}

export async function setTeacherWeeklyAvailabilityInDb(
  teacherId: string,
  slots: WeeklySlotMap
): Promise<TeacherWeeklyAvailability> {
  return replaceTeacherWeeklySlots(teacherId, slots);
}

export async function toggleTeacherSlotInDb(
  teacherId: string,
  day: DayLabel,
  startTime: SlotStartTime
): Promise<TeacherWeeklyAvailability> {
  const supabase = await createRequestDbClient();
  const normalized = normalizeSlotStart(startTime);
  const dbTime = formatTimeForDb(normalized);

  const { data: existing, error: lookupError } = await supabase
    .from("teachers_weekly_availability")
    .select("teacher_id")
    .eq("teacher_id", teacherId)
    .eq("day", day)
    .eq("start_time", dbTime)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`teacher_availability_lookup_failed: ${lookupError.message}`);
  }

  if (existing) {
    if (isSlotBooked(teacherId, day, normalized)) {
      return getTeacherWeeklyAvailabilityFromDb(teacherId);
    }
    const { error: deleteError } = await supabase
      .from("teachers_weekly_availability")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("day", day)
      .eq("start_time", dbTime);

    if (deleteError) {
      throw new Error(`teacher_availability_delete_failed: ${deleteError.message}`);
    }
  } else {
    const { error: insertError } = await supabase.from("teachers_weekly_availability").insert({
      teacher_id: teacherId,
      day,
      start_time: dbTime,
    });

    if (insertError) {
      throw new Error(`teacher_availability_insert_failed: ${insertError.message}`);
    }
  }

  await warmTeacherAvailabilityCache(teacherId);
  return getTeacherWeeklyAvailabilityFromDb(teacherId);
}

export async function copyTeacherDaySlotsInDb(
  teacherId: string,
  sourceDay: DayLabel,
  targetDays: DayLabel[]
): Promise<TeacherWeeklyAvailability> {
  await ensureTeacherAvailabilityLoaded(teacherId);
  const current = getCachedWeeklySlots(teacherId) ?? emptyWeeklySlotMap();
  const sourceTimes = [...current[sourceDay]];
  const next = normalizeMap(current);

  for (const day of targetDays) {
    if (day === sourceDay) continue;
    next[day] = sortSlotTimes([...sourceTimes]);
  }

  return replaceTeacherWeeklySlots(teacherId, next);
}

export async function restoreOccupiedWeeklyAvailabilityInDb(
  teacherId?: string
): Promise<void> {
  const occupied = getOccupiedWeeklySlots().filter(
    (slot) => !teacherId || slot.teacherId === teacherId
  );
  if (occupied.length === 0) return;

  const rows = occupied.map((slot) => ({
    teacher_id: slot.teacherId,
    day: slot.day,
    start_time: formatTimeForDb(slot.start),
  }));

  const supabase = createBootstrapDbClient();
  const { error } = await supabase
    .from("teachers_weekly_availability")
    .upsert(rows, { onConflict: "teacher_id,day,start_time", ignoreDuplicates: true });

  if (error) {
    throw new Error(`teacher_availability_restore_failed: ${error.message}`);
  }

  const teacherIds = teacherId
    ? [teacherId]
    : [...new Set(occupied.map((slot) => slot.teacherId))];
  for (const id of teacherIds) {
    await warmTeacherAvailabilityCache(id);
  }
}

/**
 * Mark a weekly session as occupied for enrollment. Teacher working hours stay
 * in teachers_weekly_availability — occupancy comes from lessons/enrollments.
 */
export async function reserveTeacherWeeklySlotsInDb(
  teacherId: string,
  input: {
    day?: DayLabel;
    planDays?: DayLabel[];
    startTime: SlotStartTime;
    sessionMinutes: number;
    studentName?: string;
    studentId?: string;
  }
): Promise<void> {
  const sessionMinutes = input.sessionMinutes > 0 ? input.sessionMinutes : 20;
  const days =
    input.planDays && input.planDays.length > 0
      ? input.planDays
      : input.day
        ? [input.day]
        : [];

  if (days.length === 0) {
    throw new Error("day_or_plan_days_required");
  }

  if (input.planDays && input.planDays.length > 0) {
    reserveTeacherWeeklySlotsForPlan(
      teacherId,
      input.planDays,
      input.startTime,
      input.studentName,
      sessionMinutes,
      input.studentId
    );
  } else if (input.day) {
    reserveTeacherSessionOnDay(
      teacherId,
      input.day,
      input.startTime,
      sessionMinutes,
      input.studentName,
      input.studentId
    );
  }
}

export async function releaseTeacherWeeklySlotsInDb(
  teacherId: string,
  input: {
    day?: DayLabel;
    planDays?: DayLabel[];
    startTime: SlotStartTime;
    sessionMinutes: number;
  }
): Promise<void> {
  const supabase = createBootstrapDbClient();
  const sessionMinutes = input.sessionMinutes > 0 ? input.sessionMinutes : 20;
  const blocks = occupiedSlotStarts(normalizeSlotStart(input.startTime), sessionMinutes);
  const days =
    input.planDays && input.planDays.length > 0
      ? input.planDays
      : input.day
        ? [input.day]
        : [];

  if (days.length === 0) {
    throw new Error("day_or_plan_days_required");
  }

  const rows = [];
  for (const day of days) {
    for (const block of blocks) {
      rows.push({
        teacher_id: teacherId,
        day,
        start_time: formatTimeForDb(block),
      });
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("teachers_weekly_availability")
    .upsert(rows, { onConflict: "teacher_id,day,start_time", ignoreDuplicates: true });

  if (error) {
    throw new Error(`teacher_availability_release_failed: ${error.message}`);
  }

  if (input.planDays && input.planDays.length > 0) {
    releaseTeacherWeeklySlotsForPlan(
      teacherId,
      input.planDays,
      input.startTime,
      sessionMinutes
    );
  } else if (input.day) {
    for (const block of blocks) {
      releaseTeacherWeeklySlot(teacherId, input.day, block);
    }
  }

  await warmTeacherAvailabilityCache(teacherId);
}
