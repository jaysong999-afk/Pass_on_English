import Image from "next/image";
import { useTranslations } from "next-intl";
import { CalendarCheck2, MessageCircleHeart, Video } from "lucide-react";

export function HeroVisual() {
  const t = useTranslations("heroVisual");

  return (
    <div className="landing-reveal relative mx-auto w-full max-w-[38rem] lg:max-w-none">
      <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-mint-200/20 blur-3xl" />
      <figure className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white p-2 shadow-[0_28px_80px_-36px_rgba(18,47,22,0.45)] sm:p-3">
        <div className="relative aspect-[3/2] overflow-hidden rounded-[1.35rem] bg-brand-50">
          <Image
            src="/images/landing/hero-online-lesson-v1.webp"
            alt={t("imageAlt")}
            fill
            priority
            sizes="(max-width: 1024px) 92vw, 45vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-brand-900/35 to-transparent" />
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-bold text-brand-800 shadow-sm backdrop-blur sm:text-sm">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span>
            {t("live")}
          </div>
        </div>
        <figcaption className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 sm:px-3">
          <div className="flex items-center gap-2.5"><Video className="h-5 w-5 text-brand-600" aria-hidden="true" /><div><p className="text-sm font-bold text-ink">{t("lessonTitle")}</p><p className="text-xs text-ink-muted">{t("topic")}</p></div></div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{t("duration")}</span>
        </figcaption>
      </figure>

      <div className="landing-float absolute -left-2 top-8 hidden items-center gap-2 rounded-2xl border border-brand-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex lg:-left-8">
        <MessageCircleHeart className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <div><p className="text-[11px] text-ink-muted">{t("feedbackLabel")}</p><p className="text-sm font-bold text-ink">{t("feedbackValue")}</p></div>
      </div>
      <div className="landing-float-delayed absolute -bottom-5 right-3 flex items-center gap-2 rounded-2xl border border-brand-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:right-8">
        <CalendarCheck2 className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <div><p className="text-[11px] text-ink-muted">{t("nextLesson")}</p><p className="text-sm font-bold text-ink">{t("nextTime")}</p></div>
      </div>
    </div>
  );
}
