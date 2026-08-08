"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fromDatetimeLocalValue } from "@/lib/reschedule-labels";
import { snapIsoToSlotGrid } from "@/lib/availability/time-utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import type { Lesson } from "@/types";

interface RescheduleRequestFormProps {
  lesson: Lesson;
  initiator: "teacher" | "student";
  makeupRemaining?: number;
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
  };
}

export function RescheduleRequestForm({
  lesson,
  initiator,
  makeupRemaining,
  onSubmitted,
  onCancel,
  labels,
}: RescheduleRequestFormProps) {
  const [proposedTime, setProposedTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!proposedTime.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          proposedScheduledAt: snapIsoToSlotGrid(
            fromDatetimeLocalValue(proposedTime),
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
        else setError(data.error ?? "Request failed");
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {labels.success}
      </div>
    );
  }

  const disabledByLimit =
    initiator === "student" && makeupRemaining !== undefined && makeupRemaining <= 0;

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
        <Input
          type="datetime-local"
          step={1200}
          value={proposedTime}
          onChange={(e) => setProposedTime(e.target.value)}
          className="rounded-xl"
          disabled={disabledByLimit}
        />
        <p className="text-xs text-gray-500">:00 · :20 · :40 (20-minute slots, KST)</p>
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
          disabled={!proposedTime.trim() || submitting || disabledByLimit}
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
