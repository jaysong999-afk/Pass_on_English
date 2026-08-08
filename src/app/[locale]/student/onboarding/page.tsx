"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CefrLevel, CoursePurpose } from "@/types";
import { useStudentSurveyOptions } from "@/hooks/useStudentSurveyOptions";
import { studentPath } from "@/lib/student-paths";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function StudentOnboardingPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("studentPortal.survey");
  const { cefrLevels, coursePurposes } = useStudentSurveyOptions();

  const [englishLevel, setEnglishLevel] = useState<CefrLevel>("A1");
  const [selectedPurposes, setSelectedPurposes] = useState<CoursePurpose[]>([]);
  const [surveyNotes, setSurveyNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function togglePurpose(value: CoursePurpose) {
    setSelectedPurposes((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
  }

  async function handleComplete() {
    setError("");

    if (selectedPurposes.length === 0) {
      setError(t("errorPurposes"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/student/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          englishLevel,
          purposes: selectedPurposes,
          surveyNotes,
        }),
      });

      if (!res.ok) {
        setError(t("errorSave"));
        return;
      }

      router.push(studentPath(locale, "enrollment/new"));
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="englishLevel">{t("englishLevel")}</Label>
            <select
              id="englishLevel"
              className={selectClassName}
              value={englishLevel}
              onChange={(e) => setEnglishLevel(e.target.value as CefrLevel)}
            >
              {cefrLevels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t("purposes")}</Label>
            <div className="flex flex-wrap gap-2">
              {coursePurposes.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePurpose(p.value)}
                  className="min-h-11"
                >
                  <Badge variant={selectedPurposes.includes(p.value) ? "default" : "outline"}>
                    {p.label}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="surveyNotes">{t("notes")}</Label>
            <Textarea
              id="surveyNotes"
              value={surveyNotes}
              onChange={(e) => setSurveyNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button className="w-full" onClick={handleComplete} disabled={submitting}>
            {submitting ? t("saving") : t("complete")}
          </Button>

          <p className="text-center text-sm text-gray-500">{t("enrollmentNotice")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
