"use client";

import Link from "next/link";
import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { studentPath } from "@/lib/student-paths";
import { cn } from "@/lib/utils";

export function StudentSwitcher({
  className,
  variant = "inline",
}: {
  className?: string;
  /** inline: header action cluster. bar: full-width row under title on mobile. */
  variant?: "inline" | "bar";
}) {
  const locale = useLocale();
  const t = useTranslations("studentPortal.shell");
  const selectId = useId();
  const { account, learners, activeLearner, loading, switchLearner } = useActiveLearner();

  if (loading || !activeLearner) {
    return null;
  }

  const canAddLearner = account?.accountType === "guardian";
  const showSwitcher = canAddLearner || learners.length > 1;
  const isBar = variant === "bar";

  if (!showSwitcher) {
    return (
      <div
        className={cn(
          isBar
            ? "min-w-0 flex-1 truncate text-sm font-medium text-white/95"
            : "hidden text-right text-xs sm:block",
          className
        )}
      >
        <p className={cn(isBar ? "truncate" : "font-medium text-white/90")}>
          {getStudentDisplayName(activeLearner)}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", isBar && "min-w-0 flex-1", className)}>
      <label className="sr-only" htmlFor={selectId}>
        {t("switchLearner")}
      </label>
      <select
        id={selectId}
        value={activeLearner.id}
        onChange={(e) => void switchLearner(e.target.value)}
        className={cn(
          "truncate rounded-xl border-0 bg-white/15 px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/40",
          isBar ? "min-w-0 flex-1" : "max-w-[10rem]"
        )}
      >
        {learners.map((learner) => (
          <option key={learner.id} value={learner.id} className="text-gray-900">
            {getStudentDisplayName(learner)}
          </option>
        ))}
      </select>
      {canAddLearner && (
        <Link
          href={studentPath(locale, "learners/new")}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/60 bg-white px-3 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:translate-y-px"
          aria-label={t("addLearner")}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          <span>{t("addLearner")}</span>
        </Link>
      )}
    </div>
  );
}
