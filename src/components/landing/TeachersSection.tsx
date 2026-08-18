"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/landing/SectionHeading";
import type { Teacher } from "@/types";

export function TeachersSection({
  teachers,
  locale,
  standalone = false,
}: {
  teachers: Teacher[];
  locale: string;
  standalone?: boolean;
}) {
  const t = useTranslations("teachers");
  const verifiedTeachers = teachers.filter((teacher) => {
    const internalCopy = `${teacher.displayName} ${teacher.bio}`.toLowerCase();
    return Boolean(teacher.avatarUrl) && !internalCopy.includes("demo") && !internalCopy.includes("e2e");
  });

  return (
    <section id="teachers" className="landing-section bg-surface">
      <div className="landing-container">
        <SectionHeading level={standalone ? "h1" : "h2"} eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {verifiedTeachers.map((teacher) => {
            const initials = teacher.displayName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);

            return (
              <article
                key={teacher.id}
                className="flex flex-col rounded-3xl border border-brand-100/80 bg-white p-6 transition-all hover:border-mint-200 hover:shadow-lg md:p-8"
              >
                <div className="flex items-start gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-md">
                    {teacher.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={teacher.avatarUrl}
                        alt={teacher.displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-ink">{teacher.displayName}</h3>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {teacher.experienceYears} {t("yearsExp")}
                    </p>
                  </div>
                </div>

                <p className="landing-prose-narrow mt-4 flex-1 line-clamp-3">{teacher.bio}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {teacher.specialties.slice(0, 3).map((s) => (
                    <Badge key={s} variant="secondary" className="font-medium">
                      {s}
                    </Badge>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {verifiedTeachers.length === 0 && <p className="mx-auto mt-12 max-w-xl rounded-2xl border border-brand-100 bg-white p-6 text-center leading-7 text-ink-muted">{t("verifiedSoon")}</p>}

        <div className="mt-10 text-center">
          <Button asChild variant="secondary" size="lg" className="rounded-2xl gap-2">
            <Link href={`/${locale}/teachers`}>
              {t("cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
