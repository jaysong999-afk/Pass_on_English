"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fromDatetimeLocalInTimeZone } from "@/lib/reschedule-labels";
import { snapIsoToSlotGrid } from "@/lib/availability/time-utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getTimezoneShortLabel } from "@/lib/availability/timezone";
import type { Lesson } from "@/types";

interface RescheduleRequestFormProps {
  lesson: Lesson;
  initiator: "teacher" | "student";
  makeupRemaining?: number;
  /** Wall-clock zone for datetime-local (teachers: PHT, students: KST). */
  inputTimeZone?: string;
  /** Locale hint for the browser's native date/time control. */
  inputLocale?: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
  labels: {
    title: string;
    proposedTime: string;
    reason: string;
    reasonPlaceholder: string;
    submit: string;
    cancel: string;
    submitting: string;
    success: string;
    makeupRemaining?: string;
    limitReached?: string;
    pendingExists?: string;
    slotUnavailable?: string;
    date?: string;
    time?: string;
    loadingSlots?: string;
    noAvailableSlots?: string;
  };
}

export function RescheduleRequestForm({
  lesson,
  initiator,
  makeupRemaining,
  inputTimeZone = CANONICAL_TIMEZONE,
  inputLocale = "en",
  onSubmitted,
  onCancel,
  labels,
}: RescheduleRequestFormProps) {
  const [proposedTime, setProposedTime] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<Array<{ startTime: string; endTime: string }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!effectiveProposedTime.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          proposedScheduledAt: snapIsoToSlotGrid(
            fromDatetimeLocalInTimeZone(effectiveProposedTime, inputTimeZone),
            CANONICAL_TIMEZONE
          ),
          reason,
          initiator,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "monthly_limit_reached") setError(labels.limitReached ?? data.error);
        else if (data.error === "pending_request_exists") setError(labels.pendingExists ?? data.error);
        else if (data.error === "slot_unavailable") {
          setError(labels.slotUnavailable ?? "That time is already occupied by another class.");
        } else setError(data.error ?? "Request failed");
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  const disabledByLimit =
    initiator === "student" && makeupRemaining !== undefined && makeupRemaining <= 0;

  useEffect(() => {
    if (initiator !== "student" || !selectedDate || disabledByLimit) {
      setAvailableSlots([]);
      setSelectedSlot("");
      return;
    }

    let cancelled = false;
    setLoadingSlots(true);
    setSelectedSlot("");
    setError(null);
    void fetch(
      `/api/enrollment/teacher-slots?teacherId=${encodeURIComponent(lesson.teacherId)}&lessonId=${encodeURIComponent(lesson.id)}&date=${encodeURIComponent(selectedDate)}&timeZone=${encodeURIComponent(inputTimeZone)}&sessionMinutes=${lesson.durationMinutes}`
    )
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { openSlots?: Array<{ startTime: string; endTime: string }> })
          : { openSlots: [] }
      )
      .then((data) => {
        if (!cancelled) setAvailableSlots(data.openSlots ?? []);
      })
      .catch(() => {
        if (!cancelled) setAvailableSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [disabledByLimit, initiator, inputTimeZone, lesson.durationMinutes, lesson.id, lesson.teacherId, selectedDate]);

  const studentProposedTime =
    selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot}` : "";
  const effectiveProposedTime = initiator === "student" ? studentProposedTime : proposedTime;

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {labels.success}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <RotateCcw className="h-4 w-4 text-emerald-600" />
        {labels.title}
      </div>

      {initiator === "student" && labels.makeupRemaining && makeupRemaining !== undefined && (
        <p className="text-sm text-gray-600">
          {labels.makeupRemaining}{" "}
          <span className="font-semibold text-emerald-700">{makeupRemaining}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label>{labels.proposedTime}</Label>
        {initiator === "student" ? (
          <>
            <Input
              type="date"
              lang={inputLocale}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl"
              disabled={disabledByLimit}
            />
            <p className="text-xs text-gray-500">{labels.date ?? "Date"}</p>
            {loadingSlots ? (
              <p className="py-2 text-sm text-gray-500">
                {labels.loadingSlots ?? "Loading available times…"}
              </p>
            ) : selectedDate && availableSlots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2" aria-label={labels.time ?? "Available times"}>
                {availableSlots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => setSelectedSlot(slot.startTime)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      selectedSlot === slot.startTime
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                    }`}
                  >
                    {slot.startTime}–{slot.endTime}
                  </button>
                ))}
              </div>
            ) : selectedDate ? (
              <p className="py-2 text-sm text-gray-500">
                {labels.noAvailableSlots ?? "No available times."}
              </p>
            ) : null}
            <p className="text-xs text-gray-500">{getTimezoneShortLabel(inputTimeZone)}</p>
          </>
        ) : (
          <>
            <Input
              type="datetime-local"
              lang={inputLocale}
              step={1200}
              value={proposedTime}
              onChange={(e) => setProposedTime(e.target.value)}
              className="rounded-xl"
              disabled={disabledByLimit}
            />
            <p className="text-xs text-gray-500">
              :00 · :20 · :40 (20-minute slots, {getTimezoneShortLabel(inputTimeZone)})
            </p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>{labels.reason}</Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={labels.reasonPlaceholder}
          rows={3}
          disabled={disabledByLimit}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={!effectiveProposedTime.trim() || submitting || disabledByLimit}
          onClick={handleSubmit}
        >
          {submitting ? labels.submitting : labels.submit}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            {labels.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}
