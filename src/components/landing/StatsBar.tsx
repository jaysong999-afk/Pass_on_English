"use client";

import { useTranslations } from "next-intl";

export function StatsBar() {
  const t = useTranslations("stats");

  const items = [
    { value: t("teachersValue"), label: t("teachers") },
    { value: t("lessonsValue"), label: t("lessons") },
    { value: t("ratingValue"), label: t("rating") },
    { value: t("countriesValue"), label: t("countries") },
  ];

  return (
    <section className="border-y border-brand-100 bg-mint-50/40 backdrop-blur">
      <div className="landing-container py-10 md:py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-4">
          {items.map((item) => (
            <div key={item.label} className="text-center md:border-r md:border-brand-100/80 md:last:border-0">
              <p className="text-3xl font-extrabold tracking-tight text-brand-600 md:text-4xl">
                {item.value}
              </p>
              <p className="mt-1.5 text-sm font-medium leading-snug text-ink-muted md:text-[0.9375rem]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
