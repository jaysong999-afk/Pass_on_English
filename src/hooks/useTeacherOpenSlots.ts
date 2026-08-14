"use client";

import { useEffect, useMemo, useState } from "react";
import type { SortedTeachersForPlan, TeacherScheduleSlot } from "@/lib/teacher-availability";
import type { Teacher } from "@/types";

const EMPTY_SORTED: SortedTeachersForPlan = { available: [], closed: [] };

interface TeacherSlotSummaryResponse {
  teacherId: string;
  openSlotCount: number;
}

function mergeSortedTeachers(
  teachers: Teacher[],
  data: { available: TeacherSlotSummaryResponse[]; closed: TeacherSlotSummaryResponse[] }
): SortedTeachersForPlan {
  const byId = new Map(teachers.map((teacher) => [teacher.id, teacher]));

  const mapEntry = (entry: TeacherSlotSummaryResponse) => {
    const teacher = byId.get(entry.teacherId);
    if (!teacher) return null;
    return { teacher, openSlotCount: entry.openSlotCount };
  };

  return {
    available: data.available.map(mapEntry).filter((entry) => entry != null),
    closed: data.closed.map(mapEntry).filter((entry) => entry != null),
  };
}

export function useTeacherOpenSlots(
  teachers: Teacher[],
  scheduleDays: string[] | undefined,
  sessionMinutes: number,
  selectedTeacherId: string | null
) {
  const [sortedTeachers, setSortedTeachers] = useState<SortedTeachersForPlan>(EMPTY_SORTED);
  const [openSlots, setOpenSlots] = useState<TeacherScheduleSlot[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const scheduleKey = useMemo(
    () => (scheduleDays?.length ? scheduleDays.join(",") : ""),
    [scheduleDays]
  );

  useEffect(() => {
    if (!scheduleKey) {
      setSortedTeachers(EMPTY_SORTED);
      return;
    }

    let cancelled = false;
    setLoadingTeachers(true);

    const params = new URLSearchParams({
      scheduleDays: scheduleKey,
      sessionMinutes: String(sessionMinutes > 0 ? sessionMinutes : 20),
    });

    fetch(`/api/enrollment/teacher-slots?${params}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          available: TeacherSlotSummaryResponse[];
          closed: TeacherSlotSummaryResponse[];
        }>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setSortedTeachers(mergeSortedTeachers(teachers, data));
      })
      .catch(() => {
        if (!cancelled) setSortedTeachers(EMPTY_SORTED);
      })
      .finally(() => {
        if (!cancelled) setLoadingTeachers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scheduleKey, sessionMinutes, teachers]);

  useEffect(() => {
    if (!selectedTeacherId || !scheduleKey) {
      setOpenSlots([]);
      return;
    }

    let cancelled = false;
    setLoadingSlots(true);

    const params = new URLSearchParams({
      scheduleDays: scheduleKey,
      sessionMinutes: String(sessionMinutes > 0 ? sessionMinutes : 20),
      teacherId: selectedTeacherId,
    });

    fetch(`/api/enrollment/teacher-slots?${params}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ openSlots?: TeacherScheduleSlot[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setOpenSlots(data?.openSlots ?? []);
      })
      .catch(() => {
        if (!cancelled) setOpenSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeacherId, scheduleKey, sessionMinutes]);

  return {
    sortedTeachers,
    openSlots,
    loading: loadingTeachers || loadingSlots,
    loadingTeachers,
    loadingSlots,
  };
}
