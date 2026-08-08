"use client";

import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/landing/SectionHeading";

export function FaqSection() {
  const t = useTranslations("faq");

  const items = [
    { q: t("q1"), a: t("a1") },
    { q: t("q2"), a: t("a2") },
    { q: t("q3"), a: t("a3") },
    { q: t("q4"), a: t("a4") },
  ];

  return (
    <section id="faq" className="landing-section bg-white">
      <div className="landing-container">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-brand-100/80 bg-surface open:border-mint-200 open:bg-white open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-base font-bold text-ink md:text-lg">
                {item.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="landing-prose-narrow max-w-none px-6 pb-5 pt-0">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
