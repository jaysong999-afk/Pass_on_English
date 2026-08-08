"use client";

import { useTranslations } from "next-intl";
import { GraduationCap, CalendarDays, Gift, Smartphone } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";

const icons = [GraduationCap, CalendarDays, Gift, Smartphone];
const keys = ["native", "flexible", "trial", "pwa"] as const;
const accents = [
  "from-brand-600 to-brand-500",
  "from-brand-500 to-brand-400",
  "from-mint-300 to-mint-200",
  "from-brand-700 to-brand-600",
];

export function FeaturesSection() {
  const t = useTranslations("features");

  return (
    <section className="landing-section bg-white">
      <div className="landing-container">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {keys.map((key, i) => {
            const Icon = icons[i];
            return (
              <article
                key={key}
                className="group relative overflow-hidden rounded-3xl border border-brand-100/80 bg-surface p-8 transition-all hover:border-mint-200 hover:shadow-xl hover:shadow-brand-900/5 md:p-10"
              >
                <div
                  className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[i]} text-white shadow-lg`}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-ink md:text-[1.375rem] md:leading-snug">
                  {t(`${key}.title`)}
                </h3>
                <p className="landing-prose-narrow mt-3 max-w-none">{t(`${key}.desc`)}</p>
                <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-brand-100/40 transition-transform group-hover:scale-110" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
