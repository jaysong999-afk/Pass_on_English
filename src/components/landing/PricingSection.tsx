"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { formatPlanLabel, getPlanDisplayName } from "@/lib/pricing-plan-display";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import { formatScheduleDays } from "@/lib/teacher-availability";
import type { Locale } from "@/lib/i18n/config";

export function PricingSection({ locale }: { locale: string }) {
  const t = useTranslations("pricing");
  const tp = useTranslations("studentPortal.pricing");
  const isZh = locale === "zh-CN";
  const planLocale = locale as Locale;
  const { plans, loading, error } = usePricingPlans(true);

  return (
    <section id="pricing" className="landing-section bg-white">
      <div className="landing-container">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        {loading && (
          <p className="mt-14 text-center text-ink-muted">{tp("loading")}</p>
        )}

        {error && (
          <p className="mt-14 text-center text-red-600">{tp("loadError")}</p>
        )}

        {!loading && !error && (
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {plans.map((plan) => {
              const popular = plan.isPopular;
              const price = isZh ? plan.priceCny : plan.priceKrw;
              const formattedPrice = price.toLocaleString();

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl border bg-white p-8 transition-shadow md:p-10 ${
                    popular
                      ? "border-mint-200 shadow-xl shadow-brand-900/10 ring-2 ring-mint-200/50 lg:scale-[1.03]"
                      : "border-brand-100/80 shadow-md hover:border-mint-200/60 hover:shadow-lg"
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold text-white shadow-md">
                      {t("popular")}
                    </span>
                  )}

                  <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
                    {formatScheduleDays(plan.scheduleDays, planLocale)} · {LESSON_MINUTES}
                    {tp("minutesUnit")}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-ink md:text-2xl">
                    {getPlanDisplayName(plan, planLocale)}
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    {plan.sessionsCount}
                    {tp("sessionsUnit")}
                  </p>

                  <div className="mt-6 border-b border-brand-100 pb-6">
                    <p className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight text-ink">
                        {formattedPrice}
                      </span>
                      <span className="text-lg font-medium text-ink-muted">
                        {isZh ? t("cny") : t("krw")}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">/ {t("perMonth")}</p>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    <li className="flex items-start gap-2.5 text-sm text-ink-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      {formatPlanLabel(plan, planLocale)}
                    </li>
                    <li className="flex items-start gap-2.5 text-sm text-ink-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      1:1 {tp("nativeTeacher")}
                    </li>
                    <li className="flex items-start gap-2.5 text-sm text-ink-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      {tp("firstLessonFree")}
                    </li>
                  </ul>

                  <Button
                    asChild
                    className={`mt-8 h-12 w-full rounded-2xl text-base ${
                      popular ? "bg-brand-600 hover:bg-brand-700" : ""
                    }`}
                    variant={popular ? "default" : "secondary"}
                  >
                    <Link href={`/${locale}/signup`}>{t("cta")}</Link>
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
