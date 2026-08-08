import {
  DAY_LABEL_TO_DOW,
  DOW_TO_DAY_LABEL,
  GRID_END_HOUR,
  GRID_MINUTE_OFFSETS,
  GRID_START_HOUR,
  SLOT_BLOCK_MINUTES,
} from "./constants";
import type { DayLabel, SlotStartTime } from "./types";

export function normalizeSlotStart(time: string): SlotStartTime {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m;
  const snapped = Math.floor(total / SLOT_BLOCK_MINUTES) * SLOT_BLOCK_MINUTES;
  const nh = Math.floor(snapped / 60);
  const nm = snapped % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function addMinutesToSlot(start: SlotStartTime, minutes: number): SlotStartTime {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function slotEndTime(start: SlotStartTime): SlotStartTime {
  return addMinutesToSlot(start, SLOT_BLOCK_MINUTES);
}

/** End time after a session of arbitrary length (may span multiple grid blocks). */
export function sessionEndTime(start: SlotStartTime, sessionMinutes: number): SlotStartTime {
  return addMinutesToSlot(start, sessionMinutes);
}

/** How many 20-min grid blocks a session occupies (ceil). */
export function slotsForSessionMinutes(sessionMinutes: number): number {
  return Math.max(1, Math.ceil(sessionMinutes / SLOT_BLOCK_MINUTES));
}

/** All grid start times occupied by a session beginning at `start`. */
export function occupiedSlotStarts(
  start: SlotStartTime,
  sessionMinutes: number
): SlotStartTime[] {
  const count = slotsForSessionMinutes(sessionMinutes);
  const slots: SlotStartTime[] = [];
  let cursor = normalizeSlotStart(start);
  for (let i = 0; i < count; i++) {
    slots.push(cursor);
    cursor = addMinutesToSlot(cursor, SLOT_BLOCK_MINUTES);
  }
  return slots;
}

export function generateGridStartTimes(): SlotStartTime[] {
  const times: SlotStartTime[] = [];
  for (let hour = GRID_START_HOUR; hour < GRID_END_HOUR; hour++) {
    for (const offset of GRID_MINUTE_OFFSETS) {
      times.push(`${String(hour).padStart(2, "0")}:${String(offset).padStart(2, "0")}`);
    }
  }
  return times;
}

export function slotKey(day: DayLabel, start: SlotStartTime): string {
  return `${day}|${start}`;
}

export function parseSlotKey(key: string): { day: DayLabel; start: SlotStartTime } {
  const [day, start] = key.split("|");
  return { day: day as DayLabel, start: start as SlotStartTime };
}

export function dateToDayLabel(date: Date): DayLabel {
  return DOW_TO_DAY_LABEL[date.getDay()];
}

export function timeFromDate(date: Date): SlotStartTime {
  return normalizeSlotStart(
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  );
}

export function dayLabelToDow(day: DayLabel): number {
  return DAY_LABEL_TO_DOW[day];
}

export function emptyWeeklySlotMap(): Record<DayLabel, SlotStartTime[]> {
  return {
    Mon: [],
    Tue: [],
    Wed: [],
    Thu: [],
    Fri: [],
    Sat: [],
    Sun: [],
  };
}

export function sortSlotTimes(times: SlotStartTime[]): SlotStartTime[] {
  return [...times].sort((a, b) => a.localeCompare(b));
}

export function toggleTimeInList(times: SlotStartTime[], time: SlotStartTime): SlotStartTime[] {
  const set = new Set(times);
  if (set.has(time)) {
    set.delete(time);
  } else {
    set.add(time);
  }
  return sortSlotTimes([...set]);
}

/** Snap an ISO datetime to the nearest valid 20-min KST grid start. */
export function snapIsoToSlotGrid(iso: string, timezone = "Asia/Seoul"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const snapped = normalizeSlotStart(`${hour}:${minute}`);

  return `${dateKey}T${snapped}:00+09:00`;
}
