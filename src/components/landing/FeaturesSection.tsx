import { useTranslations } from "next-intl";
import { GraduationCap, CalendarDays, Clock3, ClipboardCheck } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";

const icons = [GraduationCap, CalendarDays, Clock3, ClipboardCheck];
const keys = ["native", "consistent", "short", "feedback"] as const;
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
                className="landing-card-lift group relative overflow-hidden rounded-2xl border border-brand-100/80 bg-surface p-7 md:p-8"
              >
                <div
                  className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-100 bg-white text-brand-700 shadow-sm"
                >
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h3 className="text-xl font-bold text-ink md:text-[1.375rem] md:leading-snug">
                  {t(`${key}.title`)}
                </h3>
                <p className="landing-prose-narrow mt-3 max-w-none">{t(`${key}.desc`)}</p>
                <div className="absolute -bottom-8 -right-8 h-28 w-28 rounded-full bg-brand-100/35 transition-transform duration-500 group-hover:scale-110" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
