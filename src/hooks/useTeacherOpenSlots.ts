"use client";

import { useMemo } from "react";
import {
  getOpenSlotsForTeacher,
  sortTeachersByPlanAvailability,
  type TeacherScheduleSlot,
} from "@/lib/teacher-availability";
import type { Teacher } from "@/types";

export function useTeacherOpenSlots(
  teachers: Teacher[],
  scheduleDays: string[] | undefined,
  sessionMinutes: number,
  selectedTeacherId: string | null
) {
  const sortedTeachers = useMemo(() => {
    if (!scheduleDays?.length) return { available: [], closed: [] };
    return sortTeachersByPlanAvailability(teachers, scheduleDays, sessionMinutes);
  }, [teachers, scheduleDays, sessionMinutes]);

  const openSlots: TeacherScheduleSlot[] = useMemo(() => {
    if (!selectedTeacherId || !scheduleDays?.length) return [];
    return getOpenSlotsForTeacher(selectedTeacherId, scheduleDays, sessionMinutes);
  }, [selectedTeacherId, scheduleDays, sessionMinutes]);

  return { sortedTeachers, openSlots };
}
