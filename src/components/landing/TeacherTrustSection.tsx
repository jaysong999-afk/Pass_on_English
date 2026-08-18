import { useTranslations } from "next-intl";
import { BadgeCheck, MessageSquareText, Presentation, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";

const icons = [BadgeCheck, MessageSquareText, Presentation, ShieldCheck];

export function TeacherTrustSection() {
  const t = useTranslations("teacherTrust");
  return (
    <section className="landing-section bg-surface">
      <div className="landing-container">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((step, index) => {
            const Icon = icons[index];
            return <li key={step} className="landing-card-lift rounded-2xl border border-brand-100 bg-white p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50"><Icon className="h-5 w-5 text-brand-700" strokeWidth={1.8} aria-hidden="true" /></div>
              <p className="mt-4 text-sm font-bold text-brand-700">{String(step).padStart(2, "0")}</p>
              <h3 className="mt-1 text-lg font-bold text-ink">{t(`step${step}`)}</h3>
            </li>;
          })}
        </ol>
      </div>
    </section>
  );
}
