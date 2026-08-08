"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel } from "@/lib/availability/types";

const DAY_NAMES: Record<DayLabel, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

interface CopyAvailabilityDialogProps {
  open: boolean;
  sourceDay: DayLabel;
  onClose: () => void;
  onApply: (targetDays: DayLabel[]) => void;
}

export function CopyAvailabilityDialog({
  open,
  sourceDay,
  onClose,
  onApply,
}: CopyAvailabilityDialogProps) {
  const [selected, setSelected] = useState<DayLabel[]>([]);

  function toggle(day: DayLabel) {
    if (day === sourceDay) return;
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleApply() {
    onApply(selected);
    setSelected([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy {DAY_NAMES[sourceDay]} schedule</DialogTitle>
          <DialogDescription>
            Apply the same available time blocks to the days you select below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 py-2">
          {DAY_LABELS.map((day) => {
            const isSource = day === sourceDay;
            const checked = isSource || selected.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={isSource}
                onClick={() => toggle(day)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  isSource
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : checked
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-emerald-200"
                }`}
              >
                {DAY_NAMES[day]}
                {isSource && <span className="ml-1 text-xs opacity-70">(source)</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={selected.length === 0}>
            Apply to {selected.length} day{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
