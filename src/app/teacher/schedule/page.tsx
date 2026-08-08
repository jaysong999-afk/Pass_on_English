"use client";

import { TeacherScheduleOverview } from "@/components/teacher/TeacherScheduleOverview";

export default function TeacherSchedulePage() {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-xl font-bold">My Schedule</h2>
        <p className="hidden text-sm text-gray-500 sm:block">
          Weekly calendar — use arrows to change weeks
        </p>
      </div>
      <TeacherScheduleOverview />
    </div>
  );
}
