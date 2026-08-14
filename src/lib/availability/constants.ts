import type { DayLabel } from "./types";

/** Minimum bookable grid block (KST). All slots align to :00, :20, :40. */
export const SLOT_BLOCK_MINUTES = 20;

/** Default session length for the primary 20-minute plan. */
export const LESSON_MINUTES = 20;

/**
 * @deprecated No system-enforced break between lessons. Teachers leave slots Off for rest.
 * Kept at 0 for backward-compatible imports; do not use in scheduling math.
 */
export const BREAK_MINUTES = 0;

/** Weekly slots are stored in Korea Standard Time (KST). */
export const CANONICAL_TIMEZONE = "Asia/Seoul";

/** KST grid range: 06:00 through 23:40 (24:00 exclusive). */
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 24;

/** Valid minute offsets within each hour on the grid. */
export const GRID_MINUTE_OFFSETS = [0, 20, 40] as const;

export const DAY_LABELS: DayLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const DAY_LABEL_TO_DOW: Record<DayLabel, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

export const DOW_TO_DAY_LABEL: Record<number, DayLabel> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** @deprecated Demo alias — prefer session teacher UUID from `/api/auth/session`. */
export const CURRENT_TEACHER_ID = "teacher-1";
