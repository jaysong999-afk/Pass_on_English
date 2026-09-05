"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Globe2, LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";
import { PwaInstallHelp } from "@/components/shared/PwaInstallHelp";

export function LandingHeader({ locale }: { locale: string }) {
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const [open, setOpen] = useState(false);

  const links = [
    { href: `/${locale}/about`, label: nav("about") },
    { href: `/${locale}#how-it-works`, label: nav("howItWorks") },
    { href: `/${locale}#curriculum`, label: nav("curriculum") },
    { href: `/${locale}#teachers`, label: nav("teachers") },
    { href: `/${locale}#pricing`, label: nav("pricing") },
    { href: `/${locale}#faq`, label: nav("faq") },
  ];

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-brand-100/80 bg-surface/95 backdrop-blur-md">
      <div className="landing-container flex h-16 items-center justify-between md:h-[4.5rem]">
        <Link href={`/${locale}`} className="flex min-w-0 shrink items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-brand-600 text-sm font-black text-white shadow-md shadow-brand-900/25">
            PE
          </div>
          <div className="min-w-0 leading-tight">
            <span className="block truncate text-base font-extrabold text-ink">{t("brand")}</span>
            <span className="hidden text-[11px] font-medium text-ink-muted sm:block">
              {t("tagline")}
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-ink-muted transition-colors hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="flex items-center gap-1"><Globe2 className="h-4 w-4 text-ink-muted" /><LocaleSwitcher /></div>
          <PwaInstallHelp locale={locale} compact />
          <Link
            href={`/${locale}/login`}
            className="px-3 py-2 text-sm font-semibold text-ink-muted hover:text-brand-700"
          >
            {t("login")}
          </Link>
          <Link
            href={`/${locale}/signup`}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 min-h-11 flex items-center"
          >
            {t("freeTrial")}
          </Link>
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <LocaleSwitcher compact />
          <Link
            href={`/${locale}/login`}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-brand-200 px-2.5 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-50 min-[390px]:px-3"
            aria-label={t("login")}
          >
            <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden min-[390px]:inline">{t("login")}</span>
          </Link>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
            onClick={() => setOpen(!open)}
            aria-label={open ? t("menuClose") : t("menuOpen")}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="landing-mobile-menu"
          className="fixed inset-x-0 bottom-0 top-16 z-[60] lg:hidden md:top-[4.5rem]"
          role="dialog"
          aria-modal="true"
          aria-label={t("menuOpen")}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label={t("menuClose")}
          />
          <div className="absolute inset-x-0 top-0 max-h-[calc(100dvh-4rem)] overflow-hidden rounded-b-3xl border-b border-brand-100 bg-white shadow-[0_24px_50px_-24px_rgba(18,47,22,0.45)] md:max-h-[calc(100dvh-4.5rem)]">
            <nav className="landing-container flex max-h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto overscroll-contain py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:max-h-[calc(100dvh-4.5rem)]">
              <p className="px-4 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted/70">
                {t("menuLabel")}
              </p>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl px-4 py-3 text-base font-semibold text-ink transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 border-t border-brand-100 pt-3">
                <PwaInstallHelp locale={locale} compact className="w-full justify-center" />
              </div>
              <div className="mt-4 border-t border-brand-100 pt-4">
                <Link
                  href={`/${locale}/signup`}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-center font-bold text-white shadow-md shadow-brand-600/20 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                  onClick={() => setOpen(false)}
                >
                  {t("freeTrial")}
                </Link>
              </div>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function LandingFooter({ locale = "ko" }: { locale?: string }) {
  const t = useTranslations("footer");
  const common = useTranslations("common");

  return (
    <footer className="border-t border-brand-800 bg-brand-900 text-brand-100">
      <div className="landing-container py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="text-xl font-extrabold text-white">{common("brand")}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-brand-200/80">
              {t("tagline")}
            </p>
            <p className="mt-4 text-sm text-brand-300/70">{t("contact")}</p>
            <p className="mt-2 text-xs leading-relaxed text-brand-300/70">{t("businessNotice")}</p>
          </div>
          <div>
            <p className="text-sm font-bold text-brand-400/80">{t("legal")}</p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <Link href={`/${locale}/terms`} className="text-brand-200/90 transition-colors hover:text-mint-200">
                {t("terms")}
              </Link>
              <Link href={`/${locale}/privacy`} className="text-brand-200/90 transition-colors hover:text-mint-200">
                {t("privacy")}
              </Link>
              <Link href={`/${locale}/refund-policy`} className="text-brand-200/90 transition-colors hover:text-mint-200">{t("refund")}</Link>
            </div>
          </div>
        </div>
        <p className="mt-12 border-t border-brand-800 pt-8 text-xs text-brand-400/70">
          {t("copyright")}
        </p>
      </div>
    </footer>
  );
}

// Backward compat for subpages
export { PricingSection as PricingCards } from "@/components/landing/PricingSection";
