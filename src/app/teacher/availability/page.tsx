"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyAvailabilityDialog } from "@/components/teacher/CopyAvailabilityDialog";
import {
  SaveAvailabilityBar,
  WeeklyAvailabilityGrid,
} from "@/components/teacher/WeeklyAvailabilityGrid";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import type { DayLabel, WeeklySlotMap } from "@/lib/availability/types";
import { emptyWeeklySlotMap } from "@/lib/availability/time-utils";

function cloneSlots(slots: WeeklySlotMap): WeeklySlotMap {
  const base = emptyWeeklySlotMap();
  for (const day of Object.keys(base) as DayLabel[]) {
    base[day] = [...slots[day]];
  }
  return base;
}

export default function TeacherAvailabilityPage() {
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const [slots, setSlots] = useState<WeeklySlotMap>(() => emptyWeeklySlotMap());
  const [savedSlots, setSavedSlots] = useState<WeeklySlotMap>(() => emptyWeeklySlotMap());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceDay, setCopySourceDay] = useState<DayLabel>("Mon");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/availability?teacherId=${teacherId}`);
      const data = await res.json();
      const next = cloneSlots(data.availability.slots);
      setSlots(next);
      setSavedSlots(cloneSlots(next));
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (teacherId) load();
  }, [load, teacherId]);

  const dirty = useMemo(
    () => JSON.stringify(slots) !== JSON.stringify(savedSlots),
    [slots, savedSlots]
  );

  async function handleSave() {
    if (!teacherId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, slots }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        if (data.error === "availability_rls_blocked") {
          setError(
            "Save blocked by database permissions. Configure SUPABASE_SERVICE_ROLE_KEY or apply the latest Supabase migration."
          );
        } else {
          setError("Failed to save. Please try again.");
        }
        return;
      }
      const data = await res.json();
      const next = cloneSlots(data.availability.slots);
      setSlots(next);
      setSavedSlots(cloneSlots(next));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function openCopy(sourceDay: DayLabel) {
    setCopySourceDay(sourceDay);
    setCopyOpen(true);
  }

  function applyCopy(targetDays: DayLabel[]) {
    setSlots((prev) => {
      const next = cloneSlots(prev);
      const sourceTimes = [...prev[copySourceDay]];
      for (const day of targetDays) {
        next[day] = [...sourceTimes].sort((a, b) => a.localeCompare(b));
      }
      return next;
    });
  }

  if (sessionLoading || loading || !teacherId) {
    return <p className="py-12 text-center text-sm text-gray-500">Loading availability…</p>;
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-xl font-bold">Availability</h2>
        <p className="text-sm text-gray-500">
          Weekly teaching hours — times shown in Philippines (PHT). Slots are saved in Korea
          Standard Time (KST 06:00–24:00) so Korean and Chinese students see the correct local
          time when booking.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly grid</CardTitle>
          <CardDescription>
            Lessons run on 20-minute slots starting at :00, :20, or :40. Turn slots off when you
            need a break — the system does not add automatic gaps between classes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyAvailabilityGrid
            slots={slots}
            onChange={setSlots}
            onCopyRequest={openCopy}
            displayTimeZone={TEACHER_TIMEZONE}
          />
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <SaveAvailabilityBar dirty={dirty} saving={saving} onSave={handleSave} />

      <CopyAvailabilityDialog
        open={copyOpen}
        sourceDay={copySourceDay}
        onClose={() => setCopyOpen(false)}
        onApply={applyCopy}
      />
    </div>
  );
}
