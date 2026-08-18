import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "@/components/landing/HeroVisual";

export function HeroSection({ locale }: { locale: string }) {
  const t = useTranslations("hero");

  const trustItems = [t("trust1"), t("trust2"), t("trust3")];

  return (
    <section className="landing-gradient-hero relative overflow-hidden">
      <div className="landing-grid-pattern absolute inset-0 opacity-20" />
      <div className="landing-container relative pb-16 pt-12 md:pb-24 md:pt-16 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
          {/* Copy */}
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-full border border-brand-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-brand-800 shadow-sm backdrop-blur">
              {t("badge")}
            </span>

            <h1 className="landing-display mt-6 max-w-[650px] text-[2.25rem] sm:text-5xl lg:text-[3.5rem]">
              {t("titleLine1")}{" "}
              <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">
                {t("titleHighlight")}
              </span>
              <br />
              {t("titleLine2")}
            </h1>

            <p className="landing-prose mt-6 max-w-lg">{t("subtitle")}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 rounded-2xl bg-brand-600 px-8 text-base shadow-lg shadow-brand-600/25 hover:bg-brand-700"
              >
                <Link href={`/${locale}/signup`}>
                  {t("ctaPrimary")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="h-12 rounded-2xl border-brand-100 bg-white px-8 text-base hover:bg-mint-50"
              >
                <Link href={`/${locale}#lesson-flow`}>{t("ctaSecondary")}</Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {trustItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual */}
          <div className="relative pb-12 lg:pb-0">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
