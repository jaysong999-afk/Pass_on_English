"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n/config";
import { SLOT_BLOCK_MINUTES } from "@/lib/availability/constants";
import type { SlotStartTime } from "@/lib/availability/types";
import {
  generateGridStartTimes,
  occupiedSlotStarts,
  sessionEndTime,
  slotsForSessionMinutes,
} from "@/lib/availability/time-utils";
import {
  formatGridTimeLabel,
  getStudentTimezone,
  getTimezoneShortLabel,
} from "@/lib/availability/timezone";
import { formatUnifiedSlotTimeRange } from "@/lib/teacher-availability";
import type { TeacherScheduleSlot } from "@/lib/teacher-availability";

interface TeacherSlotPickerProps {
  sessionMinutes: number;
  openSlots: TeacherScheduleSlot[];
  selectedSlotId: string | null;
  onSelect: (slotId: string) => void;
  /** Optional subset of grid times to display (defaults to full daily grid). */
  gridTimes?: SlotStartTime[];
}

export function TeacherSlotPicker({
  sessionMinutes,
  openSlots,
  selectedSlotId,
  onSelect,
  gridTimes: gridTimesProp,
}: TeacherSlotPickerProps) {
  const locale = useLocale() as Locale;
  const tz = getStudentTimezone(locale);
  const blockCount = slotsForSessionMinutes(sessionMinutes);

  const gridTimes = gridTimesProp ?? generateGridStartTimes();
  const validStarts = useMemo(
    () => new Set(openSlots.map((s) => s.startTime)),
    [openSlots]
  );

  const selectedStart = openSlots.find((s) => s.id === selectedSlotId)?.startTime as
    | SlotStartTime
    | undefined;

  const highlightedBlocks = useMemo(() => {
    if (!selectedStart) return new Set<string>();
    return new Set(occupiedSlotStarts(selectedStart, sessionMinutes));
  }, [selectedStart, sessionMinutes]);

  const hoverBlocks = selectedStart
    ? occupiedSlotStarts(selectedStart, sessionMinutes)
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>
          {sessionMinutes}
          {locale === "zh-CN" ? "分钟" : "분"} · {blockCount}×{SLOT_BLOCK_MINUTES}
          {locale === "zh-CN" ? "分钟块" : "분 블록"}
        </span>
        <span className="text-ink-muted/50">·</span>
        <span>{getTimezoneShortLabel(tz, locale)}</span>
      </div>

      <div
        className="grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(4.25rem, 1fr))" }}
      >
        {gridTimes.map((time) => {
          const isValidStart = validStarts.has(time);
          const isHighlighted = highlightedBlocks.has(time);
          const isSessionStart = selectedStart === time;
          const slot = openSlots.find((s) => s.startTime === time);

          return (
            <button
              key={time}
              type="button"
              disabled={!isValidStart}
              onClick={() => slot && onSelect(slot.id)}
              title={
                isValidStart
                  ? formatUnifiedSlotTimeRange(time, locale, sessionMinutes)
                  : undefined
              }
              className={`relative flex min-h-10 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center text-xs font-medium transition-colors ${
                isSessionStart
                  ? "z-10 border-brand-600 bg-brand-600 text-white shadow-sm"
                  : isHighlighted
                    ? "border-brand-300 bg-brand-100 text-brand-800"
                    : isValidStart
                      ? "border-brand-100 bg-white text-ink-muted hover:border-brand-300 hover:bg-brand-50"
                      : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
              }`}
            >
              <span className="font-mono text-[11px] leading-none">
                {formatGridTimeLabel(time, tz)}
              </span>
              {isValidStart && blockCount > 1 && (
                <span
                  className={`mt-0.5 text-[9px] leading-none ${
                    isSessionStart ? "text-brand-100" : "text-ink-muted/70"
                  }`}
                >
                  → {formatGridTimeLabel(sessionEndTime(time, sessionMinutes) as SlotStartTime, tz)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedStart && blockCount > 1 && (
        <p className="text-xs text-ink-muted">
          {formatUnifiedSlotTimeRange(selectedStart, locale, sessionMinutes)}
          {" · "}
          {hoverBlocks.map((b) => formatGridTimeLabel(b, tz)).join(" + ")}
        </p>
      )}
    </div>
  );
}
