"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LessonFeedback, MonthlyGrowthReport } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { useActiveLearnerId } from "@/contexts/ActiveLearnerContext";

function formatMonthLabel(month: string, locale: string) {
  const [y, m] = month.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
  }).format(date);
}

function FeedbackCard({
  item,
  onOpen,
}: {
  item: LessonFeedback;
  onOpen: () => void;
}) {
  const t = useTranslations("studentPortal.learning");
  const isNew = !item.readAt;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-brand-100/80 bg-white p-4 text-left shadow-sm transition-all hover:border-mint-200 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-ink">{item.teacherName}</p>
            {isNew && (
              <Badge className="bg-brand-600 text-white hover:bg-brand-600">{t("newBadge")}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDate(item.lessonDate)} · {formatTime(item.lessonDate)}
          </p>
          {item.topic && (
            <p className="mt-1 text-xs font-medium text-brand-600">{item.topic}</p>
          )}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{item.feedback}</p>
      {item.homework && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-700">
          <BookOpen className="h-3.5 w-3.5" />
          {t("homework")}
        </p>
      )}
    </button>
  );
}

function ReportCard({
  report,
  onOpen,
  featured,
}: {
  report: MonthlyGrowthReport;
  onOpen: () => void;
  featured?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("studentPortal.learning");
  const isNew = !report.readAt;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-2xl border p-5 text-left transition-all hover:shadow-md",
        featured
          ? "border-brand-300 bg-gradient-to-br from-brand-50 to-mint-50/50 shadow-sm"
          : "border-brand-100/80 bg-white shadow-sm hover:border-mint-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-brand-800">{formatMonthLabel(report.month, locale)}</p>
          <p className="text-sm text-ink-muted">{t("teacherSuffix", { name: report.teacherName })}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isNew && (
            <Badge className="bg-brand-600 text-white hover:bg-brand-600">{t("newBadge")}</Badge>
          )}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">
        {report.lessonsCovered}
      </p>
    </button>
  );
}

export function LearningResultsHub() {
  const locale = useLocale();
  const learnerId = useActiveLearnerId();
  const t = useTranslations("studentPortal.learning");
  const [feedbacks, setFeedbacks] = useState<LessonFeedback[]>([]);
  const [reports, setReports] = useState<MonthlyGrowthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<LessonFeedback | null>(null);
  const [selectedReport, setSelectedReport] = useState<MonthlyGrowthReport | null>(null);

  const load = useCallback(async () => {
    if (!learnerId) return;
    setLoading(true);
    try {
      const [fbRes, rptRes] = await Promise.all([
        fetch(`/api/learning/feedback?studentId=${learnerId}`),
        fetch(`/api/learning/reports?studentId=${learnerId}`),
      ]);
      const fbData = await fbRes.json();
      const rptData = await rptRes.json();
      setFeedbacks(fbData.feedbacks ?? []);
      setReports(rptData.reports ?? []);
    } finally {
      setLoading(false);
    }
  }, [learnerId]);

  useEffect(() => {
    if (learnerId) void load();
  }, [load, learnerId]);

  const unreadCount =
    feedbacks.filter((f) => !f.readAt).length + reports.filter((r) => !r.readAt).length;

  const openFeedback = async (item: LessonFeedback) => {
    setSelectedFeedback(item);
    if (!item.readAt) {
      await fetch(`/api/learning/feedback?id=${item.id}&action=read`, { method: "PATCH" });
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, readAt: new Date().toISOString() } : f))
      );
    }
  };

  const openReport = async (report: MonthlyGrowthReport) => {
    setSelectedReport(report);
    if (!report.readAt) {
      await fetch(`/api/learning/reports?id=${report.id}&action=read`, { method: "PATCH" });
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, readAt: new Date().toISOString() } : r))
      );
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-ink-muted">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink md:text-2xl">{t("title")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t("subtitle")}</p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="warning" className="text-sm">
            {t("newCount", { count: unreadCount })}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="feedback" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-brand-50/80">
          <TabsTrigger value="feedback" className="gap-2">
            <BookOpen className="h-4 w-4" />
            {t("tabFeedback")}
            {feedbacks.filter((f) => !f.readAt).length > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {feedbacks.filter((f) => !f.readAt).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            {t("tabReports")}
            {reports.filter((r) => !r.readAt).length > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {reports.filter((r) => !r.readAt).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="mt-6 space-y-3">
          {feedbacks.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t("noFeedback")}
              desc={t("noFeedbackHint")}
            />
          ) : (
            feedbacks.map((item) => (
              <FeedbackCard key={item.id} item={item} onOpen={() => openFeedback(item)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-6 space-y-4">
          {reports.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={t("noReports")}
              desc={t("noReportsHint")}
            />
          ) : (
            <>
              <ReportCard report={reports[0]} onOpen={() => openReport(reports[0])} featured />
              {reports.length > 1 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink-muted">{t("previousReports")}</p>
                  {reports.slice(1).map((r) => (
                    <ReportCard key={r.id} report={r} onOpen={() => openReport(r)} />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedFeedback} onOpenChange={(o) => !o && setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{t("feedbackDetail")}</DialogTitle>
                <p className="text-sm text-ink-muted">
                  {formatDate(selectedFeedback.lessonDate)}{" "}
                  {formatTime(selectedFeedback.lessonDate)} · {selectedFeedback.teacherName}
                </p>
              </DialogHeader>
              <div className="space-y-4">
                {selectedFeedback.topic && (
                  <Badge variant="secondary">{selectedFeedback.topic}</Badge>
                )}
                <div className="rounded-xl bg-brand-50/60 p-4">
                  <p className="text-sm font-semibold text-brand-800">{t("teacherComment")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{selectedFeedback.feedback}</p>
                </div>
                {selectedFeedback.homework && (
                  <div className="rounded-xl border border-mint-200 bg-mint-50/40 p-4">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800">
                      <BookOpen className="h-4 w-4" />
                      {t("homeworkLabel")}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {selectedFeedback.homework}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedReport} onOpenChange={(o) => !o && setSelectedReport(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-8">
                  <Sparkles className="h-5 w-5 text-brand-600" />
                  {t("monthReport", { month: formatMonthLabel(selectedReport.month, locale) })}
                </DialogTitle>
                <p className="text-sm text-ink-muted">{selectedReport.teacherName}</p>
              </DialogHeader>
              <div className="space-y-4">
                <ReportSection
                  title={t("lessonsCovered")}
                  content={selectedReport.lessonsCovered}
                />
                <ReportSection
                  title={t("progressMade")}
                  content={selectedReport.progressMade}
                  variant="mint"
                />
                <ReportSection
                  title={t("areasToWorkOn")}
                  content={selectedReport.areasToWorkOn}
                />
                <ReportSection
                  title={t("nextGoals")}
                  content={selectedReport.nextMonthGoals}
                  variant="brand"
                />
                <div className="rounded-xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
                  <p className="text-sm font-bold text-brand-800">{t("teacherNote")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">
                    {selectedReport.overallComment}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportSection({
  title,
  content,
  variant,
}: {
  title: string;
  content: string;
  variant?: "mint" | "brand";
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        variant === "mint" && "bg-mint-50/50 border border-mint-100",
        variant === "brand" && "bg-brand-50/40 border border-brand-100",
        !variant && "bg-surface border border-brand-100/60"
      )}
    >
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted whitespace-pre-line">{content}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Card className="border-dashed border-brand-200 bg-brand-50/20">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Icon className="h-6 w-6" />
        </div>
        <p className="font-bold text-ink">{title}</p>
        <p className="max-w-xs text-sm text-ink-muted">{desc}</p>
      </CardContent>
    </Card>
  );
}
