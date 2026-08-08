"use client";

import Link from "next/link";
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
  const { account, learners, activeLearner, loading, switchLearner } = useActiveLearner();

  if (loading || !activeLearner) {
    return null;
  }

  const showSwitcher = account?.accountType === "guardian" || learners.length > 1;
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
      <label className="sr-only" htmlFor="learner-switcher">
        {t("switchLearner")}
      </label>
      <select
        id="learner-switcher"
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
      <Link
        href={studentPath(locale, "learners/new")}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
        title={t("addLearner")}
      >
        <Plus className="h-4 w-4" />
      </Link>
    </div>
  );
}
