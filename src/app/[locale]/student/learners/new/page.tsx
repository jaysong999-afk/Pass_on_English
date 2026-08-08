"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudentBasePath } from "@/lib/student-paths";

export default function AddLearnerPage() {
  const t = useTranslations("studentPortal.learners");
  const tCommon = useTranslations("studentPortal.common");
  const base = useStudentBasePath();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/student/learners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, englishName, dateOfBirth }),
      });
      if (!res.ok) {
        setError(t("addFailed"));
        return;
      }
      router.push(`${base}/onboarding`);
    } catch {
      setError(tCommon("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1 text-ink-muted">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          {tCommon("back")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-ink-muted">{t("addDesc")}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("fullName")}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="englishName">{t("englishName")}</Label>
              <Input
                id="englishName"
                value={englishName}
                onChange={(e) => setEnglishName(e.target.value)}
                placeholder="Minjun Kim"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">{t("birthDate")}</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
              {submitting ? t("adding") : t("addSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
