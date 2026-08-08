"use client";

import { useCallback, useState } from "react";
import type { Lesson } from "@/types";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "./admin-lesson-utils";

interface AvailableTeacher {
  teacherId: string;
  teacherName: string;
  slotAvailable: boolean;
}

export function useAdminLessonModal(onComplete?: () => void) {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [available, setAvailable] = useState<AvailableTeacher[]>([]);
  const [substituteId, setSubstituteId] = useState("");
  const [newTime, setNewTime] = useState("");
  const [makeupTime, setMakeupTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const openLesson = useCallback(async (lesson: Lesson) => {
    setSelected(lesson);
    setSubstituteId("");
    setNote("");
    setNewTime(toDatetimeLocalValue(lesson.scheduledAt));
    setMakeupTime(toDatetimeLocalValue(lesson.scheduledAt));
    setMessage("");
    const res = await fetch(`/api/admin/lessons/${lesson.id}`);
    const data = await res.json();
    setAvailable(data.availableTeachers ?? []);
  }, []);

  const closeLesson = useCallback(() => {
    setSelected(null);
    setAvailable([]);
    setMessage("");
  }, []);

  const runAction = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      if (!selected) return;
      setBusy(true);
      setMessage("");
      try {
        const body: Record<string, unknown> = { action, ...payload };
        if (action === "teacher_no_show" && typeof payload.makeupScheduledAt === "undefined") {
          body.makeupScheduledAt = fromDatetimeLocalValue(makeupTime);
        }
        if (action === "reschedule" && typeof payload.scheduledAt === "undefined") {
          body.scheduledAt = fromDatetimeLocalValue(newTime);
        }

        const res = await fetch(`/api/admin/lessons/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.error ?? "처리 실패");
          return;
        }
        setMessage("처리되었습니다.");
        closeLesson();
        onComplete?.();
      } finally {
        setBusy(false);
      }
    },
    [selected, makeupTime, newTime, closeLesson, onComplete]
  );

  return {
    selected,
    openLesson,
    closeLesson,
    available,
    substituteId,
    setSubstituteId,
    newTime,
    setNewTime,
    makeupTime,
    setMakeupTime,
    note,
    setNote,
    busy,
    message,
    runAction,
  };
}
