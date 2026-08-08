"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LessonStatusBadge } from "@/components/shared/LessonStatusBadge";
import { getStudentTimezone } from "@/lib/availability/timezone";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatTime } from "@/lib/utils";
import type { Lesson } from "@/types";

interface ScheduleCalendarProps {
  lessons: Lesson[];
  locale?: Locale;
  onLessonClick?: (lesson: Lesson) => void;
}

export function ScheduleCalendar({ lessons, locale = "ko", onLessonClick }: ScheduleCalendarProps) {
  const studentTz = getStudentTimezone(locale);
  const weekStart = useMemo(() => {
    const d = new Date("2026-07-28");
    return d;
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const title =
    locale === "zh-CN" ? "每周课程表" : locale === "ko" ? "주간 스케줄" : "Weekly Schedule";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-1">
          <Button variant="outline" size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => {
            const dayLessons = lessons.filter(
              (l) => new Date(l.scheduledAt).toDateString() === day.toDateString()
            );
            const dayLabel = day.toLocaleDateString(locale, {
              weekday: "short",
              month: "numeric",
              day: "numeric",
            });

            return (
              <div key={day.toISOString()} className="rounded-xl border bg-gray-50 p-3 min-h-32">
                <p className="text-xs font-semibold text-gray-500 mb-2">{dayLabel}</p>
                <div className="space-y-2">
                  {dayLessons.length === 0 ? (
                    <p className="text-xs text-gray-400">—</p>
                  ) : (
                    dayLessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => onLessonClick?.(lesson)}
                        className="w-full rounded-lg bg-white p-2 text-left text-xs shadow-sm hover:ring-2 hover:ring-brand-200 transition-all"
                      >
                        <p className="font-semibold">{formatTime(lesson.scheduledAt, locale, studentTz)}</p>
                        <p className="text-gray-500 truncate">
                          {lesson.teacherName || lesson.studentName}
                        </p>
                        <div className="mt-1">
                          <LessonStatusBadge status={lesson.status} locale={locale} />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">
            {locale === "zh-CN" ? "即将开始的课程" : locale === "ko" ? "예정된 수업" : "Upcoming Lessons"}
          </h4>
          {lessons
            .filter((l) => l.status === "scheduled" || l.status === "reschedule_pending")
            .map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between rounded-xl border bg-white p-4"
              >
                <div>
                  <p className="font-medium">
                    {formatDate(lesson.scheduledAt, locale)} {formatTime(lesson.scheduledAt, locale, studentTz)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {lesson.teacherName || lesson.studentName} · {lesson.durationMinutes}min
                  </p>
                </div>
                <LessonStatusBadge status={lesson.status} locale={locale} />
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
