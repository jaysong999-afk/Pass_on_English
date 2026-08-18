import { useTranslations } from "next-intl";
import {
  BookMarked,
  BookOpen,
  Briefcase,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  UserRound,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";

const curriculumKeys = [
  "daily",
  "phonics",
  "reading",
  "debate",
  "adult",
  "business",
  "news",
] as const;

const icons = [
  MessageCircle,
  BookOpen,
  BookMarked,
  MessagesSquare,
  UserRound,
  Briefcase,
  Newspaper,
];

const accents = [
  "from-brand-600 to-brand-500",
  "from-brand-500 to-brand-400",
  "from-mint-300 to-mint-200",
  "from-brand-700 to-brand-600",
  "from-mint-400 to-mint-300",
  "from-brand-600 to-mint-300",
  "from-brand-500 to-mint-200",
];

export function CurriculumSection() {
  const t = useTranslations("curriculum");

  return (
    <section id="curriculum" className="landing-section bg-surface">
      <div className="landing-container">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {curriculumKeys.map((key, i) => {
            const Icon = icons[i];
            return (
              <article
                key={key}
                className="group relative overflow-hidden rounded-3xl border border-brand-100/80 bg-white p-7 shadow-sm transition-all hover:border-mint-200 hover:shadow-lg hover:shadow-brand-900/5 md:p-8"
              >
                <div
                  className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[i]} text-white shadow-md`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-ink md:text-xl">{t(`${key}.title`)}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {t(`${key}.tag`)}
                </p>
                <p className="landing-prose-narrow mt-3 max-w-none text-sm md:text-base">
                  {t(`${key}.desc`)}
                </p>
                <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-brand-50/80 transition-transform group-hover:scale-110" />
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-ink-muted">
          {t("note")}
        </p>
      </div>
    </section>
  );
}
