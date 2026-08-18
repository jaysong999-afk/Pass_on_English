import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBand({ locale }: { locale: string }) {
  const t = useTranslations("ctaBand");

  return (
    <section className="landing-section py-16 md:py-20">
      <div className="landing-container">
        <div className="relative overflow-hidden rounded-[2rem] landing-gradient-brand px-8 py-14 text-center text-white shadow-2xl shadow-brand-900/25 md:px-16 md:py-16">
          <div className="landing-grid-pattern absolute inset-0 opacity-20" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="landing-display text-3xl text-white sm:text-4xl">{t("title")}</h2>
            <p className="mt-4 text-lg leading-relaxed text-mint-100">{t("subtitle")}</p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 gap-2 rounded-2xl bg-white px-10 text-base font-bold text-brand-700 hover:bg-brand-50"
            >
              <Link href={`/${locale}/signup`}>
                {t("button")}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
