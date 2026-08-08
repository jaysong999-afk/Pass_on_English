"use client";

import { useTranslations } from "next-intl";
import { Video, Calendar, MessageCircle } from "lucide-react";

export function HeroVisual() {
  const t = useTranslations("heroVisual");

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      {/* Glow */}
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-400/15 to-mint-200/25 blur-2xl" />

      {/* Main video card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-brand-900/10">
        <div className="flex items-center justify-between bg-gradient-to-r from-brand-700 to-brand-600 px-5 py-3 text-white">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("lessonTitle")}</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-0.5 text-xs font-bold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {t("live")}
          </span>
        </div>

        <div className="relative aspect-[4/3] bg-gradient-to-br from-brand-50 via-white to-mint-50 p-6">
          <div className="landing-grid-pattern absolute inset-0 opacity-60" />

          {/* Teacher avatar area */}
          <div className="relative flex h-full flex-col items-center justify-center">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-3xl font-bold text-white shadow-lg ring-4 ring-white">
                SM
              </div>
            </div>
            <p className="mt-4 text-lg font-bold text-ink">{t("teacherName")}</p>
            <p className="mt-1 text-sm text-ink-muted">{t("topic")}</p>

            {/* Fake video UI bars */}
            <div className="mt-6 flex gap-1">
              {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-mint-300/70"
                  style={{ height: `${h * 0.3}px` }}
                />
              ))}
            </div>
          </div>

          {/* Student pip */}
          <div className="absolute bottom-4 right-4 flex h-14 w-20 items-center justify-center rounded-xl border-2 border-white bg-brand-900 text-xs font-medium text-white shadow-lg">
            You
          </div>
        </div>
      </div>

      {/* Floating: free badge */}
      <div className="absolute -left-2 top-8 z-10 rounded-2xl border border-mint-200 bg-white px-4 py-2.5 shadow-lg sm:-left-6">
        <p className="text-xs font-bold text-brand-600">{t("freeBadge")}</p>
        <p className="text-lg font-black text-ink">Trial</p>
      </div>

      {/* Floating: next lesson */}
      <div className="absolute -bottom-4 left-4 right-4 z-10 rounded-2xl border border-brand-100 bg-white p-4 shadow-xl sm:left-8 sm:right-auto sm:w-64">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-brand-700">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-600">{t("nextLesson")}</p>
            <p className="font-bold text-ink">{t("nextTime")}</p>
          </div>
          <MessageCircle className="ml-auto h-5 w-5 text-brand-200" />
        </div>
      </div>
    </div>
  );
}
