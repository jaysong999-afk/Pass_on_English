"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherWeeklyScheduleCalendar } from "@/components/teacher/TeacherWeeklyScheduleCalendar";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import type { WeeklySlotMap } from "@/lib/availability/types";
import { formatDate, formatLessonTimeRange } from "@/lib/utils";
import type { Lesson } from "@/types";

export function TeacherScheduleOverview() {
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const [slots, setSlots] = useState<WeeklySlotMap | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`/api/teacher/availability?teacherId=${teacherId}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.availability.slots);
      });
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`/api/teacher/lessons?scope=all`)
      .then((r) => r.json())
      .then((data) => {
        setLessons(data.lessons ?? []);
      });
  }, [teacherId]);

  const teacherLessons = useMemo(
    () =>
      lessons
        .filter((l) => !teacherId || l.teacherId === teacherId)
        .filter((l) => l.status === "scheduled" || l.status === "reschedule_pending")
        .filter((l) => new Date(l.scheduledAt) >= new Date())
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [lessons, teacherId]
  );

  const reloadLessons = useCallback(() => {
    if (!teacherId) return;
    fetch(`/api/teacher/lessons?scope=all`)
      .then((r) => r.json())
      .then((data) => {
        setLessons(data.lessons ?? []);
      });
  }, [teacherId]);

  if (sessionLoading || !teacherId || !slots) {
    return <p className="py-8 text-center text-sm text-gray-500">Loading schedule…</p>;
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <CardContent className="p-2 sm:p-3">
          <TeacherWeeklyScheduleCalendar
            slots={slots}
            lessons={lessons}
            teacherId={teacherId}
            onLessonsChange={reloadLessons}
          />
        </CardContent>
      </Card>

      {teacherLessons.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Upcoming lessons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3 sm:px-4">
            {teacherLessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LessonRow({ lesson }: { lesson: Lesson }) {
  return (
    <Link
      href={`/teacher/lessons/${lesson.id}`}
      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors hover:bg-emerald-50/50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{lesson.studentName ?? "Student"}</p>
        <p className="truncate text-xs text-gray-500">
          {formatDate(lesson.scheduledAt, "en")} ·{" "}
          {formatLessonTimeRange(
            lesson.scheduledAt,
            lesson.durationMinutes,
            "en",
            TEACHER_TIMEZONE
          )}
        </p>
      </div>
      <Badge
        variant={lesson.status === "reschedule_pending" ? "warning" : "default"}
        className="shrink-0 text-[10px]"
      >
        {lesson.status === "reschedule_pending" ? "Change" : "Scheduled"}
      </Badge>
    </Link>
  );
}
