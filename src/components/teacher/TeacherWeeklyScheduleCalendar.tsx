"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import type { WeeklySlotMap } from "@/lib/availability/types";
import {
  TEACHER_TIMEZONE,
  addDays,
  formatCalendarDayHeader,
  formatGridTimeLabel,
  formatWeekRange,
  getDateKeyInTimezone,
  getDayLabelInTimezone,
  getTimezoneShortLabel,
  kstSlotCellKey,
  lessonScheduledAtToKstSlot,
  startOfWeekMonday,
} from "@/lib/availability/timezone";
import { generateGridStartTimes, occupiedSlotStarts, sessionEndTime } from "@/lib/availability/time-utils";
import type { Lesson, LessonStatus } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeacherLessonDetailCard } from "@/components/teacher/TeacherLessonDetailCard";
import { RescheduleRequestForm } from "@/components/shared/RescheduleRequestForm";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";

const ACTIVE_LESSON: LessonStatus[] = ["scheduled", "reschedule_pending", "pending_payment"];
const PAST_LESSON: LessonStatus[] = ["completed", "cancelled"];

type CalendarCellVariant = "active" | "teacher_no_show" | "past";

interface WeekCellBooking {
  lesson: Lesson;
  variant: CalendarCellVariant;
  isStart: boolean;
  rowSpan: number;
}

function calendarCellVariant(lesson: Lesson): CalendarCellVariant | null {
  if (lesson.teacherNoShow && lesson.status === "cancelled") {
    return "teacher_no_show";
  }
  if (ACTIVE_LESSON.includes(lesson.status)) {
    return "active";
  }
  if (PAST_LESSON.includes(lesson.status)) {
    return "past";
  }
  return null;
}

/** Hue-separated fills: sky = upcoming, slate = past, amber = no-show. */
const CELL_VARIANT_CLASS: Record<
  CalendarCellVariant,
  { cell: string; label: string; meta: string; swatch: string; stat: string }
> = {
  active: {
    cell: "cursor-pointer bg-sky-600 hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-800",
    label: "text-white",
    meta: "text-sky-100",
    swatch: "bg-sky-600",
    stat: "text-sky-700",
  },
  past: {
    cell: "cursor-pointer bg-slate-100 ring-1 ring-inset ring-slate-300 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-500",
    label: "text-slate-500",
    meta: "text-slate-400",
    swatch: "bg-slate-100 ring-1 ring-slate-300",
    stat: "text-slate-600",
  },
  teacher_no_show: {
    cell: "cursor-pointer bg-amber-400 hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700",
    label: "text-amber-950 line-through decoration-amber-800/80",
    meta: "text-amber-900",
    swatch: "bg-amber-400",
    stat: "text-amber-700",
  },
};

interface TeacherWeeklyScheduleCalendarProps {
  slots: WeeklySlotMap;
  lessons: Lesson[];
  teacherId: string;
  onLessonsChange?: () => void;
  /** Parent handles lesson click (e.g. admin dual modal) */
  onLessonClick?: (lesson: Lesson) => void;
  /** Timezone for row time labels (slot columns / weekday headers stay KST) */
  displayTimezone?: string;
  showAvailabilityFooter?: boolean;
  /** Controlled week start (Monday) — syncs with parent e.g. operation logs */
  weekStart?: Date;
  onWeekStartChange?: (weekStart: Date) => void;
}

export function TeacherWeeklyScheduleCalendar({
  slots,
  lessons,
  teacherId,
  onLessonsChange,
  onLessonClick,
  displayTimezone = TEACHER_TIMEZONE,
  showAvailabilityFooter = true,
  weekStart: controlledWeekStart,
  onWeekStartChange,
}: TeacherWeeklyScheduleCalendarProps) {
  const [internalWeekStart, setInternalWeekStart] = useState(() =>
    startOfWeekMonday(new Date())
  );
  const weekStart = controlledWeekStart ?? internalWeekStart;

  const setWeekStart = (next: Date | ((prev: Date) => Date)) => {
    const resolved =
      typeof next === "function" ? next(weekStart) : next;
    if (onWeekStartChange) {
      onWeekStartChange(resolved);
    } else {
      setInternalWeekStart(resolved);
    }
  };
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<LessonDisplayContext | null>(null);
  const [displayLoading, setDisplayLoading] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const gridTimes = useMemo(() => generateGridStartTimes(), []);
  const tzLabel = getTimezoneShortLabel(displayTimezone);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weekBookings = useMemo(() => {
    const map = new Map<string, WeekCellBooking>();
    for (const lesson of lessons) {
      if (lesson.teacherId !== teacherId) continue;
      const variant = calendarCellVariant(lesson);
      if (!variant) continue;

      const dateKey = getDateKeyInTimezone(new Date(lesson.scheduledAt), CANONICAL_TIMEZONE);
      const weekKeys = weekDays.map((d) => getDateKeyInTimezone(d, CANONICAL_TIMEZONE));
      if (!weekKeys.includes(dateKey)) continue;

      const { start } = lessonScheduledAtToKstSlot(lesson.scheduledAt);
      const blocks = occupiedSlotStarts(start, lesson.durationMinutes);
      blocks.forEach((blockStart, index) => {
        map.set(kstSlotCellKey(dateKey, blockStart), {
          lesson,
          variant,
          isStart: index === 0,
          rowSpan: blocks.length,
        });
      });
    }
    return map;
  }, [lessons, teacherId, weekDays]);

  useEffect(() => {
    if (!selectedLesson) {
      setSelectedDisplay(null);
      setDisplayLoading(false);
      return;
    }

    let cancelled = false;
    setDisplayLoading(true);
    setSelectedDisplay(null);

    fetch(`/api/teacher/lessons/${selectedLesson.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { display?: LessonDisplayContext | null } | null) => {
        if (cancelled) return;
        setSelectedDisplay(json?.display ?? null);
      })
      .catch(() => {
        if (!cancelled) setSelectedDisplay(null);
      })
      .finally(() => {
        if (!cancelled) setDisplayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLesson]);

  const stats = useMemo(() => {
    let open = 0;
    let booked = 0;
    let noShow = 0;
    let past = 0;

    for (const dayDate of weekDays) {
      const dateKey = getDateKeyInTimezone(dayDate, CANONICAL_TIMEZONE);
      const dayLabel = getDayLabelInTimezone(dayDate, CANONICAL_TIMEZONE);

      for (const time of gridTimes) {
        const enabled = slots[dayLabel]?.includes(time);
        const cellKey = kstSlotCellKey(dateKey, time);
        const cell = weekBookings.get(cellKey);

        if (cell?.variant === "active") booked++;
        else if (cell?.variant === "teacher_no_show") noShow++;
        else if (cell?.variant === "past") past++;
        else if (enabled) open++;
      }
    }

    const weekLessonCount = lessons.filter((l) => {
      if (l.teacherId !== teacherId) return false;
      if (!calendarCellVariant(l)) return false;
      const dateKey = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE);
      const weekKeys = weekDays.map((d) => getDateKeyInTimezone(d, CANONICAL_TIMEZONE));
      return weekKeys.includes(dateKey);
    }).length;

    return { open, booked, noShow, past, upcoming: weekLessonCount };
  }, [weekDays, gridTimes, slots, weekBookings, lessons, teacherId]);

  function shiftWeek(delta: number) {
    setWeekStart((prev) => addDays(prev, delta * 7));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          aria-label="Previous week"
          className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border-2 border-emerald-500 bg-white text-emerald-700 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-50"
        >
          <ChevronLeft className="h-5 w-5 shrink-0 stroke-[2.5]" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-ink">
            {formatWeekRange(weekStart, CANONICAL_TIMEZONE)}
          </p>
          <p className="text-[10px] text-gray-500">{tzLabel} · stored in KST</p>
        </div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          aria-label="Next week"
          className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border-2 border-emerald-500 bg-white text-emerald-700 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-50"
        >
          <ChevronRight className="h-5 w-5 shrink-0 stroke-[2.5]" aria-hidden />
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex h-[calc(100dvh-20rem)] min-h-[200px] flex-col sm:h-[calc(100dvh-15rem)]">
          <div
            className="grid shrink-0 border-b bg-gray-50"
            style={{
              gridTemplateColumns: `2.5rem repeat(7, minmax(2.5rem, 1fr))`,
            }}
          >
            <div className="px-0.5 py-0.5 text-[8px] font-semibold leading-none text-gray-400">
              {tzLabel}
            </div>
            {weekDays.map((dayDate) => {
              const isToday =
                getDateKeyInTimezone(dayDate, CANONICAL_TIMEZONE) ===
                getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
              return (
                <div
                  key={dayDate.toISOString()}
                  className={cn(
                    "border-l px-0.5 py-0.5 text-center leading-none",
                    isToday && "bg-emerald-50"
                  )}
                >
                  <div className="text-[8px] font-bold uppercase text-emerald-800 sm:text-[9px]">
                    {formatCalendarDayHeader(dayDate, CANONICAL_TIMEZONE)}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="grid min-h-0 flex-1"
            style={{
              gridTemplateColumns: `2.5rem repeat(7, minmax(2.5rem, 1fr))`,
              gridTemplateRows: `repeat(${gridTimes.length}, minmax(0, 1fr))`,
            }}
          >
            {gridTimes.map((time, rowIndex) => (
              <div
                key={`label-${time}`}
                style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
                className="flex items-center border-b px-0.5 text-[8px] font-mono leading-none text-gray-500 last:border-b-0 sm:text-[9px]"
              >
                {formatGridTimeLabel(time, displayTimezone)}
              </div>
            ))}

            {weekDays.map((dayDate, dayIndex) => {
              const colIndex = dayIndex + 2;

              return gridTimes.map((time, rowIndex) => {
                const dateKey = getDateKeyInTimezone(dayDate, CANONICAL_TIMEZONE);
                const dayLabel = getDayLabelInTimezone(dayDate, CANONICAL_TIMEZONE);
                const cellKey = kstSlotCellKey(dateKey, time);
                const enabled = slots[dayLabel]?.includes(time);
                const cell = weekBookings.get(cellKey);

                if (cell && !cell.isStart) {
                  return null;
                }

                const bookedLesson = cell?.lesson;
                const cellVariant = cell?.variant;
                const booked = Boolean(bookedLesson);
                const label = bookedLesson?.studentName ?? bookedLesson?.studentId;
                const isToday =
                  getDateKeyInTimezone(dayDate, CANONICAL_TIMEZONE) ===
                  getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);

                const lessonStart = bookedLesson
                  ? lessonScheduledAtToKstSlot(bookedLesson.scheduledAt).start
                  : time;
                const lessonEnd = bookedLesson
                  ? sessionEndTime(lessonStart, bookedLesson.durationMinutes)
                  : null;

                return (
                  <button
                    key={cellKey}
                    type="button"
                    disabled={!booked}
                    style={{
                      gridColumn: colIndex,
                      gridRow:
                        cell?.isStart && cell.rowSpan > 1
                          ? `${rowIndex + 1} / span ${cell.rowSpan}`
                          : rowIndex + 1,
                    }}
                    onClick={() => {
                      if (!bookedLesson) return;
                      if (onLessonClick) {
                        onLessonClick(bookedLesson);
                      } else {
                        setSelectedLesson(bookedLesson);
                      }
                    }}
                    title={
                      booked
                        ? cellVariant === "teacher_no_show"
                          ? `${label} — teacher no-show`
                          : cellVariant === "past"
                            ? `${label} — completed / past`
                            : lessonEnd
                              ? `${label} · ${lessonStart}–${lessonEnd}`
                              : `${label} — click to view lesson`
                        : enabled
                          ? "Open for booking"
                          : "Not available"
                    }
                    className={cn(
                      "flex min-h-0 flex-col justify-start overflow-hidden border-b border-l px-px py-0.5 text-left",
                      isToday && !booked && !enabled && "bg-gray-50/80",
                      cellVariant && CELL_VARIANT_CLASS[cellVariant].cell,
                      !booked && enabled && "cursor-default bg-emerald-400",
                      !booked && !enabled && "cursor-default bg-white"
                    )}
                  >
                    {booked && label && (
                      <>
                        <span
                          className={cn(
                            "block w-full truncate text-[9px] font-semibold leading-tight sm:text-[10px]",
                            cellVariant
                              ? CELL_VARIANT_CLASS[cellVariant].label
                              : "text-red-900"
                          )}
                        >
                          {cellVariant === "teacher_no_show" ? `${label} · 노쇼` : label}
                        </span>
                        {cell?.isStart && lessonEnd && cell.rowSpan > 1 && (
                          <span
                            className={cn(
                              "mt-0.5 block text-[8px] leading-none",
                              cellVariant
                                ? CELL_VARIANT_CLASS[cellVariant].meta
                                : "text-red-800/80"
                            )}
                          >
                            {formatGridTimeLabel(lessonStart, displayTimezone)}–
                            {formatGridTimeLabel(lessonEnd, displayTimezone)}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              });
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            Open
          </span>
          <span className="flex items-center gap-1">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", CELL_VARIANT_CLASS.active.swatch)} />
            Upcoming
          </span>
          <span className="flex items-center gap-1">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", CELL_VARIANT_CLASS.past.swatch)} />
            Past
          </span>
          <span className="flex items-center gap-1">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", CELL_VARIANT_CLASS.teacher_no_show.swatch)} />
            No-show
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white ring-1 ring-gray-200" />
            Off
          </span>
        </div>
        {showAvailabilityFooter && (
          <p className="text-[10px] text-gray-400">
            Edit on{" "}
            <Link href="/teacher/availability" className="font-medium text-emerald-700 hover:underline">
              Availability
            </Link>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-1.5 text-[11px]">
        <span>
          <span className="text-gray-500">Open </span>
          <span className="font-semibold text-emerald-700">{stats.open}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="text-gray-500">Upcoming </span>
          <span className={cn("font-semibold", CELL_VARIANT_CLASS.active.stat)}>{stats.booked}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="text-gray-500">Past </span>
          <span className={cn("font-semibold", CELL_VARIANT_CLASS.past.stat)}>{stats.past}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="text-gray-500">No-show </span>
          <span className={cn("font-semibold", CELL_VARIANT_CLASS.teacher_no_show.stat)}>{stats.noShow}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="text-gray-500">Lessons </span>
          <span className="font-semibold text-ink">{stats.upcoming}</span>
        </span>
      </div>

      {!onLessonClick && (
      <Dialog
        open={selectedLesson !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLesson(null);
            setSelectedDisplay(null);
            setShowRescheduleForm(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Lesson Details</DialogTitle>
          </DialogHeader>
          {displayLoading ? (
            <p className="p-6 text-sm text-gray-500">Loading student details…</p>
          ) : selectedDisplay && selectedLesson ? (
            <>
              <TeacherLessonDetailCard
                key={selectedLesson.id}
                display={selectedDisplay}
                editableTextbook
              />
              <div className="border-t px-4 pb-4 pt-2">
                {selectedLesson.status === "reschedule_pending" ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    A reschedule request is pending approval.
                  </p>
                ) : selectedLesson.status === "scheduled" && !showRescheduleForm ? (
                  <Button
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={() => setShowRescheduleForm(true)}
                  >
                    Request Reschedule
                  </Button>
                ) : selectedLesson.status === "scheduled" && showRescheduleForm ? (
                  <RescheduleRequestForm
                    lesson={selectedLesson}
                    initiator="teacher"
                    inputTimeZone={TEACHER_TIMEZONE}
                    onCancel={() => setShowRescheduleForm(false)}
                    onSubmitted={() => {
                      setShowRescheduleForm(false);
                      setSelectedLesson(null);
                      onLessonsChange?.();
                    }}
                    labels={{
                      title: "Request Reschedule",
                      proposedTime: "Proposed Date & Time",
                      reason: "Reason",
                      reasonPlaceholder: "Reason for the schedule change",
                      submit: "Send Request",
                      cancel: "Cancel",
                      submitting: "Sending…",
                      success: "Request sent. Waiting for student approval.",
                      pendingExists: "A reschedule request is already pending for this lesson.",
                      slotUnavailable: "That time is already occupied by another class.",
                    }}
                  />
                ) : null}
              </div>
            </>
          ) : selectedLesson ? (
            <p className="p-6 text-sm text-gray-500">Student information unavailable.</p>
          ) : null}
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
