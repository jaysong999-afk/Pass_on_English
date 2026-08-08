"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Globe2,
  Heart,
  MessageCircle,
  Sparkles,
  Target,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/landing/SectionHeading";

export function AboutPageContent({ locale }: { locale: string }) {
  const t = useTranslations("about");

  const services = [
    { icon: Video, key: "s1" as const },
    { icon: Users, key: "s2" as const },
    { icon: Globe2, key: "s3" as const },
    { icon: Sparkles, key: "s4" as const },
    { icon: Target, key: "s5" as const },
    { icon: MessageCircle, key: "s6" as const },
  ];

  const values = [
    { key: "v1" as const },
    { key: "v2" as const },
    { key: "v3" as const },
  ];

  return (
    <>
      {/* Hero */}
      <section className="landing-gradient-hero relative overflow-hidden">
        <div className="landing-grid-pattern absolute inset-0 opacity-30" />
        <div className="landing-container relative py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
              {t("eyebrow")}
            </p>
            <h1 className="landing-display mt-4 text-[2rem] sm:text-5xl lg:text-[3rem]">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 text-lg font-semibold text-brand-700">{t("brandSub")}</p>
            <p className="landing-prose mx-auto mt-6 max-w-2xl">{t("heroSubtitle")}</p>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="landing-section bg-brand-800 text-white">
        <div className="landing-container">
          <div className="mx-auto max-w-3xl text-center">
            <Heart className="mx-auto h-10 w-10 text-mint-200" />
            <p className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
              &ldquo;{t("philosophyQuote")}&rdquo;
            </p>
            <p className="mt-6 text-lg leading-relaxed text-brand-100">{t("philosophyDesc")}</p>
            <p className="mt-4 text-sm text-brand-200/80">{t("philosophyEn")}</p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="landing-section bg-white">
        <div className="landing-container">
          <SectionHeading title={t("missionTitle")} subtitle={t("missionSubtitle")} />
          <div className="mx-auto mt-12 max-w-3xl rounded-3xl border border-brand-100 bg-mint-50/40 p-8 md:p-12">
            <p className="text-lg leading-[1.85] text-ink md:text-xl">{t("missionBody")}</p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="landing-section bg-surface">
        <div className="landing-container">
          <SectionHeading
            eyebrow={t("serviceEyebrow")}
            title={t("serviceTitle")}
            subtitle={t("serviceSubtitle")}
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(({ icon: Icon, key }) => (
              <article
                key={key}
                className="rounded-3xl border border-brand-100/80 bg-white p-8 shadow-sm transition-shadow hover:border-mint-200 hover:shadow-md"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-50 text-brand-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-ink">{t(`${key}Title`)}</h3>
                <p className="landing-prose-narrow mt-3 max-w-none">{t(`${key}Desc`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Differentiation */}
      <section className="landing-section bg-white">
        <div className="landing-container">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHeading
                align="left"
                eyebrow={t("diffEyebrow")}
                title={t("diffTitle")}
                subtitle={t("diffSubtitle")}
              />
            </div>
            <div className="space-y-4">
              {values.map(({ key }) => (
                <div
                  key={key}
                  className="flex gap-4 rounded-2xl border border-brand-100/80 bg-surface p-5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {key.slice(1)}
                  </span>
                  <div>
                    <p className="font-bold text-ink">{t(`${key}Title`)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t(`${key}Desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="landing-section bg-gradient-to-b from-mint-50/60 to-surface">
        <div className="landing-container">
          <SectionHeading title={t("audienceTitle")} subtitle={t("audienceSubtitle")} />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-brand-100/80 bg-white p-8 md:p-10">
              <p className="text-3xl">🇰🇷</p>
              <h3 className="mt-4 text-xl font-bold">{t("audienceKrTitle")}</h3>
              <p className="landing-prose-narrow mt-3 max-w-none">{t("audienceKrDesc")}</p>
            </div>
            <div className="rounded-3xl border border-brand-100/80 bg-white p-8 md:p-10">
              <p className="text-3xl">🇨🇳</p>
              <h3 className="mt-4 text-xl font-bold">{t("audienceCnTitle")}</h3>
              <p className="landing-prose-narrow mt-3 max-w-none">{t("audienceCnDesc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section py-16">
        <div className="landing-container">
          <div className="rounded-[2rem] landing-gradient-brand px-8 py-14 text-center text-white md:px-16">
            <h2 className="landing-display text-3xl text-white sm:text-4xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-mint-100">{t("ctaSubtitle")}</p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 gap-2 rounded-2xl bg-white px-8 text-base font-bold text-brand-700 hover:bg-mint-50"
            >
              <Link href={`/${locale}/signup`}>
                {t("ctaButton")}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
