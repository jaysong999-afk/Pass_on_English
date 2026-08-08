"use client";

import { useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildLessonDisplayContext } from "@/lib/teacher-lesson-context";
import { AdminLessonDetailCard } from "./AdminLessonDetailCard";
import { AdminLessonActionsPanel } from "./AdminLessonActionsPanel";
import { useAdminLessonModal } from "./useAdminLessonModal";
import type { Lesson } from "@/types";

interface AdminLessonDualModalProps {
  lesson: Lesson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: ReturnType<typeof useAdminLessonModal>["available"];
  substituteId: string;
  onSubstituteIdChange: (value: string) => void;
  newTime: string;
  onNewTimeChange: (value: string) => void;
  makeupTime: string;
  onMakeupTimeChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  message: string;
  onAction: (action: string, payload: Record<string, unknown>) => void;
}

export function AdminLessonDualModal({
  lesson,
  open,
  onOpenChange,
  available,
  substituteId,
  onSubstituteIdChange,
  newTime,
  onNewTimeChange,
  makeupTime,
  onMakeupTimeChange,
  note,
  onNoteChange,
  busy,
  message,
  onAction,
}: AdminLessonDualModalProps) {
  const display = useMemo(
    () => (lesson ? buildLessonDisplayContext(lesson) : null),
    [lesson]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden p-0 lg:flex-row lg:items-stretch lg:gap-5 lg:bg-transparent lg:shadow-none"
          )}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">수업 상세 및 조치</DialogPrimitive.Title>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white shadow-xl lg:max-w-[calc(50%-0.625rem)]">
            <div className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
              <span className="text-sm font-semibold text-ink">수업 정보</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {display ? (
                <AdminLessonDetailCard display={display} />
              ) : (
                <p className="p-4 text-sm text-gray-500">수업 정보를 불러올 수 없습니다.</p>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white shadow-xl lg:max-w-[calc(50%-0.625rem)]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold text-ink lg:sr-only">수업 조치</span>
              <DialogPrimitive.Close className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
                <span className="sr-only">닫기</span>
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {lesson ? (
                <AdminLessonActionsPanel
                  lesson={lesson}
                  available={available}
                  substituteId={substituteId}
                  onSubstituteIdChange={onSubstituteIdChange}
                  newTime={newTime}
                  onNewTimeChange={onNewTimeChange}
                  makeupTime={makeupTime}
                  onMakeupTimeChange={onMakeupTimeChange}
                  note={note}
                  onNoteChange={onNoteChange}
                  busy={busy}
                  message={message}
                  onAction={onAction}
                />
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { useAdminLessonModal };
