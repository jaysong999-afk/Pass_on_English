"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  Megaphone,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudentAnnouncements } from "@/contexts/StudentAnnouncementsContext";
import { useStudentBasePath } from "@/lib/student-paths";
import { cn } from "@/lib/utils";
import type { StudentAnnouncement, StudentAnnouncementPriority } from "@/lib/announcements/types";
import type { Locale } from "@/lib/i18n/config";

const PRIORITY_STYLES: Record<StudentAnnouncementPriority, string> = {
  normal: "border-brand-100 bg-white text-ink",
  important: "border-amber-200 bg-amber-50 text-amber-950",
  urgent: "border-red-200 bg-red-50 text-red-950",
};

function AnnouncementIcon({ priority, className }: { priority: StudentAnnouncementPriority; className?: string }) {
  const Icon = priority === "urgent" ? TriangleAlert : priority === "important" ? BellRing : Megaphone;
  return <Icon className={cn("h-5 w-5", className)} aria-hidden="true" />;
}

function formatAnnouncementDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function localizedInternalPath(path: string, locale: Locale) {
  if (/^\/(ko|zh-CN)\/student(?:\/|$)/.test(path)) {
    return path.replace(/^\/(ko|zh-CN)/, `/${locale}`);
  }
  if (/^\/student(?:\/|$)/.test(path)) return `/${locale}${path}`;
  return path;
}

function PriorityBadge({ priority }: { priority: StudentAnnouncementPriority }) {
  const t = useTranslations("studentPortal.announcements");
  return (
    <Badge variant={priority === "urgent" ? "destructive" : priority === "important" ? "warning" : "secondary"}>
      {t(`priority.${priority}`)}
    </Badge>
  );
}

export function StudentAnnouncementBell({ className }: { className?: string }) {
  const t = useTranslations("studentPortal.announcements");
  const { announcements } = useStudentAnnouncements();
  const base = useStudentBasePath();

  return (
    <Link
      href={`${base}/notices`}
      aria-label={t("bellLabel", { count: announcements.length })}
      title={t("title")}
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 hover:text-white",
        className
      )}
    >
      <Megaphone className="h-5 w-5" aria-hidden="true" />
      {announcements.length > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[10px] font-bold leading-4 text-amber-950 ring-2 ring-brand-600">
          {announcements.length > 9 ? "9+" : announcements.length}
        </span>
      )}
    </Link>
  );
}

export function StudentAnnouncementStrip() {
  const t = useTranslations("studentPortal.announcements");
  const locale = useLocale() as Locale;
  const base = useStudentBasePath();
  const { announcements } = useStudentAnnouncements();
  const [expanded, setExpanded] = useState(false);
  const portalWide = announcements.filter((item) => item.portalWide);
  const announcement = portalWide[0];
  if (!announcement) return null;

  return (
    <section
      aria-label={t("importantNotice")}
      className={cn(
        "mb-4 rounded-2xl border px-4 py-3 shadow-sm",
        PRIORITY_STYLES[announcement.priority]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-white/80 p-2 shadow-sm">
          <AnnouncementIcon priority={announcement.priority} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={announcement.priority} />
            <p className="font-bold leading-snug">{announcement.title}</p>
            {portalWide.length > 1 && (
              <Link href={`${base}/notices`} className="text-xs font-semibold underline underline-offset-2">
                {t("moreCount", { count: portalWide.length - 1 })}
              </Link>
            )}
          </div>
          <p className={cn("mt-1 whitespace-pre-line text-sm leading-relaxed", !expanded && "line-clamp-1 md:line-clamp-2")}>
            {announcement.body}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
            <button
              type="button"
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? t("collapse") : t("expand")}
              <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
            </button>
            {announcement.linkPath && (
              <Link
                href={localizedInternalPath(announcement.linkPath, locale)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 shadow-sm transition hover:bg-white"
              >
                {announcement.linkLabel || t("viewDetails")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StudentAnnouncementCard() {
  const t = useTranslations("studentPortal.announcements");
  const locale = useLocale() as Locale;
  const base = useStudentBasePath();
  const { announcements, loading } = useStudentAnnouncements();
  const visible = announcements.slice(0, 3);
  if (!loading && visible.length === 0) return null;

  return (
    <Card className="overflow-hidden border-brand-100">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-brand-50 bg-brand-50/50 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-brand-600" />
          {t("title")}
        </CardTitle>
        {!loading && (
          <Link href={`${base}/notices`} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline">
            {t("viewAll")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 py-5 text-sm text-ink-muted">{t("loading")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((announcement) => (
              <li key={announcement.id}>
                <Link href={`${base}/notices#notice-${announcement.id}`} className="flex items-start gap-3 px-4 py-3 transition hover:bg-gray-50">
                  <AnnouncementIcon priority={announcement.priority} className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{announcement.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {formatAnnouncementDate(announcement.startsAt, locale)}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AnnouncementArticle({ announcement }: { announcement: StudentAnnouncement }) {
  const t = useTranslations("studentPortal.announcements");
  const locale = useLocale() as Locale;
  return (
    <article id={`notice-${announcement.id}`} className={cn("scroll-mt-24 rounded-2xl border p-5 shadow-sm", PRIORITY_STYLES[announcement.priority])}>
      <div className="flex items-start gap-3">
        <AnnouncementIcon priority={announcement.priority} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={announcement.priority} />
            <time className="text-xs text-ink-muted" dateTime={announcement.startsAt}>
              {formatAnnouncementDate(announcement.startsAt, locale)}
            </time>
          </div>
          <h3 className="mt-2 text-base font-bold leading-snug md:text-lg">{announcement.title}</h3>
          <p className="mt-3 whitespace-pre-line text-sm leading-7">{announcement.body}</p>
          {announcement.linkPath && (
            <Link
              href={localizedInternalPath(announcement.linkPath, locale)}
              className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50"
            >
              {announcement.linkLabel || t("viewDetails")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function StudentNoticesPage() {
  const t = useTranslations("studentPortal.announcements");
  const { announcements, loading, error, refresh } = useStudentAnnouncements();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink md:text-2xl">{t("title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("subtitle")}</p>
      </div>
      {loading ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-ink-muted">{t("loading")}</p>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p>{t("loadError")}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => void refresh()}>
            {t("retry")}
          </button>
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm text-ink-muted">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <AnnouncementArticle key={announcement.id} announcement={announcement} />
          ))}
        </div>
      )}
    </div>
  );
}
