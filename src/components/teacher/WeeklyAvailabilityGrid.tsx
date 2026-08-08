"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DAY_LABELS,
  SLOT_BLOCK_MINUTES,
} from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime, WeeklySlotMap } from "@/lib/availability/types";
import {
  formatGridTimeLabel,
  getTimezoneShortLabel,
} from "@/lib/availability/timezone";
import { generateGridStartTimes, slotKey } from "@/lib/availability/time-utils";

const DAY_SHORT: Record<DayLabel, string> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

interface WeeklyAvailabilityGridProps {
  slots: WeeklySlotMap;
  onChange: (slots: WeeklySlotMap) => void;
  onCopyRequest: (sourceDay: DayLabel) => void;
  readOnly?: boolean;
  /** Display row labels in this timezone (slots stored in KST). */
  displayTimeZone?: string;
  /** Booked cells (schedule view) */
  bookedKeys?: Set<string>;
  bookedLabels?: Map<string, string>;
}

export function WeeklyAvailabilityGrid({
  slots,
  onChange,
  onCopyRequest,
  readOnly = false,
  displayTimeZone,
  bookedKeys,
  bookedLabels,
}: WeeklyAvailabilityGridProps) {
  const [copySourceDay, setCopySourceDay] = useState<DayLabel>("Mon");
  const gridTimes = useMemo(() => generateGridStartTimes(), []);
  const tzLabel = displayTimeZone ? getTimezoneShortLabel(displayTimeZone) : null;

  const toggle = useCallback(
    (day: DayLabel, time: SlotStartTime) => {
      if (readOnly) return;
      const set = new Set(slots[day]);
      if (set.has(time)) set.delete(time);
      else set.add(time);
      onChange({
        ...slots,
        [day]: [...set].sort((a, b) => a.localeCompare(b)),
      });
    },
    [onChange, slots]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Tap cells to toggle · {SLOT_BLOCK_MINUTES}-min slots (:00 / :20 / :40) · turn slots off for
          breaks between lessons
          {displayTimeZone && (
            <>
              {" "}
              · Times shown in {tzLabel} (stored in KST 06:00–24:00)
            </>
          )}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Copy from
              <select
                value={copySourceDay}
                onChange={(e) => setCopySourceDay(e.target.value as DayLabel)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium"
              >
                {DAY_LABELS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_SHORT[d]}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => onCopyRequest(copySourceDay)}
            >
              <Copy className="h-4 w-4" />
              Copy to other days
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <div className="inline-block min-w-full">
          <div
            className="grid border-b bg-gray-50"
            style={{ gridTemplateColumns: `4.5rem repeat(${DAY_LABELS.length}, minmax(3rem, 1fr))` }}
          >
            <div className="px-2 py-3 text-xs font-semibold text-gray-400">
              {displayTimeZone ? tzLabel : "Time"}
            </div>
            {DAY_LABELS.map((day) => (
              <div
                key={day}
                className="border-l px-1 py-3 text-center text-xs font-bold uppercase tracking-wide text-emerald-800"
              >
                {DAY_SHORT[day]}
              </div>
            ))}
          </div>

          {gridTimes.map((time) => (
            <div
              key={time}
              className="grid border-b last:border-b-0"
              style={{ gridTemplateColumns: `4.5rem repeat(${DAY_LABELS.length}, minmax(3rem, 1fr))` }}
            >
              <div className="flex items-center px-2 py-1 text-[11px] font-mono text-gray-500">
                {displayTimeZone ? formatGridTimeLabel(time, displayTimeZone) : time}
              </div>
              {DAY_LABELS.map((day) => {
                const key = slotKey(day, time);
                const enabled = slots[day].includes(time);
                const booked = bookedKeys?.has(key);
                const label = bookedLabels?.get(key);

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readOnly && !enabled && !booked}
                    onClick={() => toggle(day, time)}
                    title={
                      booked
                        ? label ?? "Booked"
                        : enabled
                          ? "Available — tap to remove"
                          : "Tap to mark available"
                    }
                    className={cn(
                      "min-h-9 border-l transition-colors touch-manipulation",
                      readOnly && "cursor-default",
                      !readOnly && "active:scale-95",
                      booked && "bg-red-100 hover:bg-red-100",
                      !booked && enabled && "bg-emerald-400 hover:bg-emerald-500",
                      !booked && !enabled && !readOnly && "bg-gray-50 hover:bg-emerald-100",
                      !booked && !enabled && readOnly && "bg-gray-50"
                    )}
                  >
                    {booked && label && (
                      <span className="block truncate px-0.5 text-[9px] font-semibold leading-tight text-red-800">
                        {label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded bg-emerald-400" /> Available
        </span>
        {bookedKeys && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded bg-red-100 ring-1 ring-red-200" /> Booked /
            closed
          </span>
        )}
        {!readOnly && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded bg-gray-50 ring-1 ring-gray-200" /> Off
          </span>
        )}
      </div>
    </div>
  );
}

export function SaveAvailabilityBar({
  dirty,
  saving,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-10 flex justify-end">
      <Button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="gap-2 rounded-xl bg-emerald-600 shadow-lg hover:bg-emerald-700"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving…" : "Save availability"}
      </Button>
    </div>
  );
}
