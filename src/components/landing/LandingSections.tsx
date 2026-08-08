"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";
import { cn } from "@/lib/utils";

export function LandingHeader({ locale }: { locale: string }) {
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const [open, setOpen] = useState(false);

  const links = [
    { href: `/${locale}/about`, label: nav("about") },
    { href: `/${locale}#curriculum`, label: nav("curriculum") },
    { href: `/${locale}#pricing`, label: nav("pricing") },
    { href: `/${locale}#teachers`, label: nav("teachers") },
    { href: `/${locale}#how-it-works`, label: nav("howItWorks") },
    { href: `/${locale}#faq`, label: nav("faq") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-brand-100/80 bg-surface/95 backdrop-blur-md">
      <div className="landing-container flex h-16 items-center justify-between md:h-[4.5rem]">
        <Link href={`/${locale}`} className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-brand-600 text-sm font-black text-white shadow-md shadow-brand-900/25">
            PE
          </div>
          <div className="leading-tight">
            <span className="block text-base font-extrabold text-ink">{t("brand")}</span>
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
          <LocaleSwitcher />
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

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-100 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-brand-100 bg-white lg:hidden",
          open ? "block" : "hidden"
        )}
      >
        <nav className="landing-container flex flex-col gap-1 py-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-4 py-3 text-base font-semibold text-ink hover:bg-brand-50"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-brand-100 pt-4">
            <LocaleSwitcher className="w-full justify-center" />
            <Link
              href={`/${locale}/login`}
              className="rounded-xl px-4 py-3 text-center font-semibold text-ink-muted"
            >
              {t("login")}
            </Link>
            <Link
              href={`/${locale}/signup`}
              className="rounded-xl bg-brand-600 px-4 py-3 text-center font-bold text-white"
            >
              {t("freeTrial")}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function LandingFooter() {
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
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-400/80">Legal</p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <Link href="#" className="text-brand-200/90 transition-colors hover:text-mint-200">
                {t("terms")}
              </Link>
              <Link href="#" className="text-brand-200/90 transition-colors hover:text-mint-200">
                {t("privacy")}
              </Link>
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
