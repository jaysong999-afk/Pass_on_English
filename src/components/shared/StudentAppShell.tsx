"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  ClipboardList,
  HelpCircle,
  MessageCircle,
  UserRound,
  TrendingUp,
} from "lucide-react";
import { ChatNotificationBell } from "@/components/shared/ChatNotificationBell";
import { useActiveLearner, useActiveLearnerDisplayName } from "@/contexts/ActiveLearnerContext";
import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { StudentSwitcher } from "@/components/student/StudentSwitcher";
import { studentBasePath } from "@/lib/student-paths";
import type { Locale } from "@/lib/i18n/config";
import { PortalNavigation, type PortalNavItem } from "@/components/shared/PortalNavigation";

export function StudentAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const tShell = useTranslations("studentPortal.shell");
  const tChat = useTranslations("studentPortal.chat");
  const displayName = useActiveLearnerDisplayName();
  const { activeLearnerId, loading: accountLoading } = useActiveLearner();

  const studentBase = studentBasePath(locale);

  const items: PortalNavItem[] = useMemo(
    () => [
      {
        href: studentBase,
        matchPath: studentBase,
        label: tShell("myLessons"),
        icon: CalendarDays,
      },
      {
        href: `${studentBase}/enrollment`,
        matchPath: `${studentBase}/enrollment`,
        label: tShell("enrollment"),
        shortLabel: tShell("enrollmentShort"),
        icon: ClipboardList,
      },
      {
        href: `${studentBase}/learning`,
        matchPath: `${studentBase}/learning`,
        label: tShell("learning"),
        shortLabel: tShell("learningShort"),
        icon: TrendingUp,
      },
      {
        href: `${studentBase}/chat`,
        matchPath: `${studentBase}/chat`,
        label: tShell("chat"),
        icon: MessageCircle,
      },
    {
      href: `${studentBase}/settings`,
        matchPath: `${studentBase}/settings`,
        label: tShell("settings"),
      shortLabel: tShell("settingsShort"),
      icon: UserRound,
    },
    {
      href: `${studentBase}/faq`,
      matchPath: `${studentBase}/faq`,
      label: tShell("faq"),
      shortLabel: tShell("faqShort"),
      icon: HelpCircle,
    },
    ],
    [studentBase, tShell]
  );

  const subtitle = displayName ? tShell("greeting", { name: displayName }) : "";

  const headerActions = (
    <>
      <StudentSwitcher />
      <LocaleSwitcher className="bg-white/10 p-0.5 [&_button]:text-white/90 [&_button.bg-white]:text-brand-700" />
      <LogoutButton
        redirectTo={`/${locale}/login`}
        label={tShell("logout")}
        className="hidden text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex"
      />
      <ChatNotificationBell
        role="student"
        locale={locale}
        studentId={activeLearnerId ?? undefined}
        enabled={!accountLoading && Boolean(activeLearnerId)}
        copy={{
          title: tChat("bellTitle"),
          viewAll: tChat("viewAll"),
          empty: tChat("empty"),
          unreadLabel: (count) => tChat("unreadLabel", { count }),
        }}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-600 pt-[env(safe-area-inset-top)] text-white">
        {/* Desktop / tablet: single row */}
        <div className="mx-auto hidden max-w-6xl items-center justify-between gap-4 px-4 py-4 md:flex">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">Pass on English</p>
            <h1 className="text-lg font-bold">{tShell("portalTitle")}</h1>
            {subtitle && <p className="truncate text-sm text-white/80">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </div>

        {/* Mobile: title row + learner row (prevents control overlap) */}
        <div className="mx-auto max-w-6xl space-y-2.5 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">
                Pass on English
              </p>
              <h1 className="truncate text-base font-bold leading-tight">{tShell("portalTitle")}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <LogoutButton
                redirectTo={`/${locale}/login`}
                label={tShell("logout")}
                variant="ghost"
                className="text-white/90 hover:bg-white/10 hover:text-white"
              />
              <LocaleSwitcher
                compact
                className="bg-white/10 p-0.5 [&_button]:text-white/90 [&_button.bg-white]:text-brand-700"
              />
              <ChatNotificationBell
                role="student"
                locale={locale}
                studentId={activeLearnerId ?? undefined}
                enabled={!accountLoading && Boolean(activeLearnerId)}
                enableInboxSync={false}
                copy={{
                  title: tChat("bellTitle"),
                  viewAll: tChat("viewAll"),
                  empty: tChat("empty"),
                  unreadLabel: (count) => tChat("unreadLabel", { count }),
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 pt-2.5">
            <StudentSwitcher variant="bar" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5 md:py-6">
        <PortalNavigation
          items={items}
          pathname={pathname}
          rootPath={studentBase}
          mobileLayout="spread"
          mobileAriaLabel={tShell("mobileNav")}
        />

        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>

    </div>
  );
}
