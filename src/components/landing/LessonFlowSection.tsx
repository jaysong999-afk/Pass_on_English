import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/landing/SectionHeading";

export function LessonFlowSection() {
  const t = useTranslations("lessonFlow");
  return <section id="lesson-flow" className="landing-section scroll-mt-20 bg-white">
    <div className="landing-container">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
      <ol className="relative mx-auto mt-12 grid max-w-4xl gap-4 before:absolute before:left-[16.66%] before:right-[16.66%] before:top-8 before:hidden before:h-px before:bg-brand-200 md:grid-cols-3 md:before:block">
        {[1, 2, 3].map((step) => <li key={step} className="landing-card-lift relative rounded-2xl border border-brand-100 bg-surface p-6">
          <p className="text-sm font-bold text-brand-600">{t(`time${step}`)}</p>
          <h3 className="mt-2 text-lg font-bold text-ink">{t(`step${step}`)}</h3>
        </li>)}
      </ol>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-7 text-ink-muted">{t("note")}</p>
    </div>
  </section>;
}
