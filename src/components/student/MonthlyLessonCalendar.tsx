"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/types";
import { getDateKeyInTimezone, getStudentTimezone } from "@/lib/availability/timezone";
import type { Locale } from "@/lib/i18n/config";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function formatTimeShort(iso: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

function isLessonPast(lesson: Lesson, now: Date) {
  if (lesson.status === "completed" || lesson.status === "cancelled") return true;
  return new Date(lesson.scheduledAt) < now;
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

interface MonthlyLessonCalendarProps {
  lessons: Lesson[];
  onLessonSelect: (lesson: Lesson) => void;
  initialMonth?: Date;
  timeZone?: string;
}

export function MonthlyLessonCalendar({
  lessons,
  onLessonSelect,
  initialMonth,
  timeZone,
}: MonthlyLessonCalendarProps) {
  const locale = useLocale();
  const t = useTranslations("studentPortal.calendar");
  const displayTz = timeZone ?? getStudentTimezone(locale as Locale);
  const [viewDate, setViewDate] = useState(() => initialMonth ?? new Date());
  const todayKey = getDateKeyInTimezone(new Date(), displayTz);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const monthLabel = viewDate.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });

  const weekdays = WEEKDAY_KEYS.map((key) => t(key));

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of lessons) {
      const key = getDateKeyInTimezone(new Date(lesson.scheduledAt), displayTz);
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [lessons, displayTz]);

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date());

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-100/80 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-brand-50 bg-brand-50/30 px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={goPrev}
          aria-label={t("prevMonth")}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-brand-400 bg-white px-2 text-brand-700 shadow-sm transition-colors hover:border-brand-600 hover:bg-brand-50 sm:h-11 sm:min-w-[4.5rem] sm:px-3"
        >
          <ChevronLeft className="h-6 w-6 shrink-0 stroke-[2.5]" aria-hidden />
          <span className="hidden text-sm font-bold sm:inline">{t("prev")}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-base font-bold text-ink sm:text-lg">{monthLabel}</p>
          <button
            type="button"
            onClick={goToday}
            className="mt-0.5 text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("goToday")}
          </button>
        </div>
        <button
          type="button"
          onClick={goNext}
          aria-label={t("nextMonth")}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-brand-400 bg-white px-2 text-brand-700 shadow-sm transition-colors hover:border-brand-600 hover:bg-brand-50 sm:h-11 sm:min-w-[4.5rem] sm:px-3"
        >
          <span className="hidden text-sm font-bold sm:inline">{t("next")}</span>
          <ChevronRight className="h-6 w-6 shrink-0 stroke-[2.5]" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-brand-50 bg-brand-50/40">
        {weekdays.map((wd, i) => (
          <div
            key={WEEKDAY_KEYS[i]}
            className={cn(
              "py-2 text-center text-xs font-semibold",
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-600" : "text-ink-muted"
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="min-h-[4.5rem] border-b border-r border-brand-50/80 bg-surface/30 sm:min-h-[5.25rem]" />;
          }

          const key = calendarDateKey(day);
          const dayLessons = (lessonsByDay.get(key) ?? []).slice(0, 2);
          const extra = (lessonsByDay.get(key)?.length ?? 0) - dayLessons.length;
          const isToday = key === todayKey;
          const isPastDay = key < todayKey;

          return (
            <div
              key={key}
              className={cn(
                "flex min-h-[4.5rem] flex-col border-b border-r border-brand-50/80 p-1 sm:min-h-[5.25rem] sm:p-1.5",
                isPastDay ? "bg-surface-muted/40" : "bg-white",
                isToday && "ring-2 ring-inset ring-brand-600 bg-brand-50/30 shadow-sm"
              )}
            >
              <span
                className={cn(
                  "mb-0.5 flex h-6 w-6 items-center justify-center self-end rounded-full text-xs font-bold tabular-nums",
                  isToday
                    ? "bg-brand-600 text-white"
                    : isPastDay
                      ? "text-ink-muted"
                      : "text-ink"
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayLessons.map((lesson) => {
                  const past = isLessonPast(lesson, new Date());
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => onLessonSelect(lesson)}
                      className={cn(
                        "w-full rounded px-1 py-0.5 text-left text-[10px] font-bold tabular-nums transition-opacity hover:opacity-80 sm:text-xs",
                        past
                          ? "bg-stone-200/80 text-stone-600"
                          : "bg-mint-200/90 text-brand-800"
                      )}
                    >
                      {formatTimeShort(lesson.scheduledAt, locale, displayTz)}
                    </button>
                  );
                })}
                {extra > 0 && (
                  <span className="px-1 text-[10px] font-medium text-ink-muted">+{extra}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-brand-50 px-4 py-2.5 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-mint-200/90" />
          {t("upcoming")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-stone-200/80" />
          {t("past")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-5 w-5 rounded-full ring-2 ring-brand-600" />
          {t("today")}
        </span>
      </div>
    </div>
  );
}
