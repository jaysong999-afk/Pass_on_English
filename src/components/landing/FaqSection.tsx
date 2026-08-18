"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { SectionHeading } from "@/components/landing/SectionHeading";

export function FaqSection() {
  const t = useTranslations("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const items = [
    { q: t("q1"), a: t("a1") },
    { q: t("q2"), a: t("a2") },
    { q: t("q3"), a: t("a3") },
    { q: t("q4"), a: t("a4") },
    { q: t("q5"), a: t("a5") },
    { q: t("q6"), a: t("a6") },
    { q: t("q7"), a: t("a7") },
    { q: t("q8"), a: t("a8") },
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
          {items.map((item, index) => (
            <div key={item.q} className="rounded-2xl border border-brand-100/80 bg-surface has-[button[aria-expanded=true]]:border-mint-200 has-[button[aria-expanded=true]]:bg-white">
              <h3><button type="button" aria-expanded={openIndex === index} aria-controls={`faq-panel-${index}`} id={`faq-button-${index}`} onClick={() => setOpenIndex(openIndex === index ? null : index)} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-6 py-5 text-left text-base font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 md:text-lg">
                {item.q}<span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">{openIndex === index ? "−" : "+"}</span>
              </button></h3>
              {openIndex === index && <div id={`faq-panel-${index}`} role="region" aria-labelledby={`faq-button-${index}`}><p className="landing-prose-narrow max-w-none px-6 pb-5 pt-0">{item.a}</p></div>}
            </div>
          ))}
        </div>
        <div className="mt-10 text-center"><p className="text-sm text-ink-muted">{t("contactPrompt")}</p><Link href="mailto:support@passonenglish.com" className="mt-3 inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4">{t("contactCta")}</Link></div>
      </div>
    </section>
  );
}
