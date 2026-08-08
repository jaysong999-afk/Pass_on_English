"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lesson } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { formatDate, formatTime } from "@/lib/utils";
import { AdminLessonDualModal } from "@/components/admin/operations/AdminLessonDualModal";
import { useAdminLessonModal } from "@/components/admin/operations/useAdminLessonModal";
import {
  adminLessonStatusLabel,
  isActiveUpcomingLesson,
  isLessonTodayKst,
  sortLessonsBySchedule,
} from "@/components/admin/operations/admin-lesson-utils";

export function AdminTodayLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/lessons");
      const data = await res.json();
      setLessons(data.lessons ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modal = useAdminLessonModal(load);

  const todayLessons = useMemo(
    () =>
      lessons
        .filter(isActiveUpcomingLesson)
        .filter((l) => isLessonTodayKst(l))
        .sort(sortLessonsBySchedule),
    [lessons]
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-violet-600" />
            오늘의 수업
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/operations">운영 센터</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
          {!loading && todayLessons.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">오늘 예정된 수업이 없습니다.</p>
          )}
          {todayLessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => modal.openLesson(lesson)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/40"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {formatTime(lesson.scheduledAt, "ko", CANONICAL_TIMEZONE)}{" "}
                  <span className="font-normal text-gray-500">KST</span>
                </p>
                <p className="mt-0.5 truncate text-sm text-gray-600">
                  {lesson.studentName ?? "—"} · {lesson.teacherName}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {adminLessonStatusLabel(lesson)}
              </Badge>
            </button>
          ))}
          {!loading && todayLessons.length > 0 && (
            <p className="pt-1 text-xs text-gray-400">
              {formatDate(new Date().toISOString(), "ko")} 기준 · 클릭하면 수업 정보·조치 창이
              열립니다.
            </p>
          )}
        </CardContent>
      </Card>

      <AdminLessonDualModal
        lesson={modal.selected}
        open={modal.selected !== null}
        onOpenChange={(open) => {
          if (!open) modal.closeLesson();
        }}
        available={modal.available}
        substituteId={modal.substituteId}
        onSubstituteIdChange={modal.setSubstituteId}
        newTime={modal.newTime}
        onNewTimeChange={modal.setNewTime}
        makeupTime={modal.makeupTime}
        onMakeupTimeChange={modal.setMakeupTime}
        note={modal.note}
        onNoteChange={modal.setNote}
        busy={modal.busy}
        message={modal.message}
        onAction={modal.runAction}
      />
    </>
  );
}
