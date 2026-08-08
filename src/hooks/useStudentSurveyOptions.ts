"use client";

import { useTranslations } from "next-intl";
import type { CefrLevel, CoursePurpose } from "@/types";
import { VALID_CEFR_LEVELS, VALID_COURSE_PURPOSES } from "@/lib/student-survey-labels";

export function useStudentSurveyOptions() {
  const t = useTranslations("studentPortal.survey");

  const cefrLevels = VALID_CEFR_LEVELS.map((value) => ({
    value: value as CefrLevel,
    label: t(`cefr.${value}`),
  }));

  const coursePurposes = VALID_COURSE_PURPOSES.map((value) => ({
    value: value as CoursePurpose,
    label: t(`purposesLabels.${value}`),
  }));

  return { cefrLevels, coursePurposes };
}

export function useFormatSurveyLabels() {
  const t = useTranslations("studentPortal.survey");

  return {
    formatCefrLevel: (level: CefrLevel) => t(`cefr.${level}`),
    formatCoursePurposes: (purposes: CoursePurpose[]) =>
      purposes.map((p) => t(`purposesLabels.${p}`)).join(", "),
  };
}
