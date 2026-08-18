import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/landing/SectionHeading";

const stepKeys = ["step1", "step2", "step3", "step4"] as const;

export function HowItWorksSection() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how-it-works" className="landing-section overflow-hidden bg-brand-800 text-white">
      <div className="landing-container">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          className="[&_h2]:text-white [&_p]:text-brand-100"
        />

        <div className="relative mt-16">
          {/* Connector line — desktop */}
          <div className="absolute left-0 right-0 top-8 hidden h-0.5 bg-mint-300/40 lg:block" />

          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {stepKeys.map((key, i) => (
              <li key={key} className="relative">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-200 text-2xl font-black text-brand-800 shadow-lg">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="text-lg font-bold leading-snug md:text-xl">
                  {t(`${key}Title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-100 md:text-[0.9375rem] md:leading-[1.7]">
                  {t(`${key}Desc`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
