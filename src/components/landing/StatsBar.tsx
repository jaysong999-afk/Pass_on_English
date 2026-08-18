import { useTranslations } from "next-intl";

export function StatsBar() {
  const t = useTranslations("stats");

  const items = ["teachers", "schedule", "duration", "feedback"] as const;

  return (
    <section className="border-y border-brand-100 bg-mint-50/40 backdrop-blur">
      <div className="landing-container py-10 md:py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-4">
          {items.map((item) => (
            <div key={item} className="text-center md:border-r md:border-brand-100/80 md:last:border-0">
              <p className="text-base font-extrabold tracking-tight text-brand-700 md:text-lg">{t(item)}</p>
              <p className="mt-1.5 text-sm font-medium leading-snug text-ink-muted">{t(`${item}Desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
