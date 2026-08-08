"use client";

import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Teacher } from "@/types";

interface TeacherProfileModalProps {
  teacher: Teacher | null;
  openSlotCount?: number;
  closed?: boolean;
  selected?: boolean;
  onClose: () => void;
  onSelect?: () => void;
}

export function TeacherProfileModal({
  teacher,
  openSlotCount,
  closed = false,
  selected = false,
  onClose,
  onSelect,
}: TeacherProfileModalProps) {
  const t = useTranslations("studentPortal.teacherProfile");
  const tEnrollment = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const tDays = useTranslations("studentPortal.days");

  if (!teacher) return null;

  const initials = teacher.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <Dialog open={!!teacher} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 pr-8">
            <Avatar className="h-12 w-12 shrink-0 rounded-xl">
              {teacher.avatarUrl ? (
                <AvatarImage src={teacher.avatarUrl} alt={teacher.displayName} className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-sm font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span>{teacher.displayName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{t("srDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-ink-muted">
              <User className="h-4 w-4" />
              {t("experience", { years: teacher.experienceYears })}
            </span>
            {closed ? (
              <Badge variant="secondary" className="bg-gray-200 text-gray-600">
                {tEnrollment("closed")}
              </Badge>
            ) : openSlotCount != null ? (
              <Badge variant="secondary">{tEnrollment("openSlots", { count: openSlotCount })}</Badge>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{t("intro")}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{teacher.bio}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{t("specialties")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teacher.specialties.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{t("availableDays")}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {teacher.availableDays.map((d) => tDays(d as "Mon")).join("·")}
            </p>
          </div>

          {!closed && onSelect && (
            <div className="flex gap-3 border-t border-brand-50 pt-4">
              <Button variant="secondary" className="flex-1 rounded-xl" onClick={onClose}>
                {tCommon("close")}
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={() => {
                  onSelect();
                  onClose();
                }}
              >
                {selected ? t("selected") : t("selectTeacher")}
              </Button>
            </div>
          )}

          {(closed || !onSelect) && (
            <Button variant="secondary" className="w-full rounded-xl" onClick={onClose}>
              {tCommon("close")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
