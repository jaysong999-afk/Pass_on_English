"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LessonStatusBadge } from "@/components/shared/LessonStatusBadge";
import { RescheduleRequestForm } from "@/components/shared/RescheduleRequestForm";
import { formatDate, formatTime } from "@/lib/utils";
import type { Lesson } from "@/types";

interface LessonDetailDialogProps {
  lesson: Lesson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  makeupRemaining: number;
  onRescheduleSubmitted?: () => void;
}

export function LessonDetailDialog({
  lesson,
  open,
  onOpenChange,
  makeupRemaining,
  onRescheduleSubmitted,
}: LessonDetailDialogProps) {
  const t = useTranslations("studentPortal.lessonDialog");
  const tCommon = useTranslations("studentPortal.common");
  const [showReschedule, setShowReschedule] = useState(false);

  const handleClose = (next: boolean) => {
    if (!next) setShowReschedule(false);
    onOpenChange(next);
  };

  if (!lesson) return null;

  const canReschedule =
    lesson.status === "scheduled" || lesson.status === "reschedule_pending";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-8">
            <span>{t("detail")}</span>
            <LessonStatusBadge status={lesson.status} />
          </DialogTitle>
          <DialogDescription>
            {formatDate(lesson.scheduledAt)} {formatTime(lesson.scheduledAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 space-y-3">
            <Row label={t("teacher")} value={lesson.teacherName} />
            <Row label={t("time")} value={t("minutes", { count: lesson.durationMinutes })} />
            {lesson.isTrial && (
              <p className="rounded-lg bg-mint-100 px-3 py-2 text-sm font-medium text-brand-800">
                {t("trialLesson")}
              </p>
            )}
          </div>

          {lesson.status === "reschedule_pending" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {t("reschedulePendingNotice")}
            </p>
          ) : showReschedule ? (
            <RescheduleRequestForm
              lesson={lesson}
              initiator="student"
              makeupRemaining={makeupRemaining}
              onCancel={() => setShowReschedule(false)}
              onSubmitted={() => {
                setShowReschedule(false);
                onRescheduleSubmitted?.();
                handleClose(false);
              }}
              labels={{
                title: t("rescheduleTitle"),
                proposedTime: t("preferredTime"),
                reason: t("reason"),
                reasonPlaceholder: t("reasonPlaceholder"),
                submit: t("submitReschedule"),
                cancel: tCommon("cancel"),
                submitting: tCommon("loading"),
                success: t("rescheduleSubmitted"),
                makeupRemaining: t("makeupRemaining"),
                limitReached: t("makeupLimitReached"),
                pendingExists: t("pendingRequestExists"),
              }}
            />
          ) : (
            canReschedule && (
              <Button
                variant="secondary"
                className="w-full gap-2 rounded-xl"
                onClick={() => setShowReschedule(true)}
              >
                {t("rescheduleTitle")}
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

interface GlobalRescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessons: Lesson[];
  makeupRemaining: number;
  onSelectLesson: (lesson: Lesson) => void;
}

export function GlobalRescheduleDialog({
  open,
  onOpenChange,
  lessons,
  makeupRemaining,
  onSelectLesson,
}: GlobalRescheduleDialogProps) {
  const t = useTranslations("studentPortal.lessonDialog");

  const upcoming = lessons
    .filter((l) => l.status === "scheduled" || l.status === "reschedule_pending")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("globalRescheduleTitle")}</DialogTitle>
          <DialogDescription>
            {t("globalRescheduleDesc", { count: makeupRemaining })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("noLessonsToReschedule")}</p>
          ) : (
            upcoming.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onSelectLesson(lesson);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-brand-100 p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {formatDate(lesson.scheduledAt)} {formatTime(lesson.scheduledAt)}
                  </p>
                  <p className="text-sm text-ink-muted">{lesson.teacherName}</p>
                </div>
                <LessonStatusBadge status={lesson.status} />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
