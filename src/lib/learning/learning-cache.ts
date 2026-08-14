import type { LessonFeedback, MonthlyGrowthReport } from "@/types";

let feedbackCache: LessonFeedback[] = [];
let reportCache: MonthlyGrowthReport[] = [];

export function getFeedbackCache(): LessonFeedback[] {
  return feedbackCache;
}

export function setFeedbackCache(items: LessonFeedback[]) {
  feedbackCache = items;
}

export function patchFeedbackInCache(feedback: LessonFeedback) {
  const index = feedbackCache.findIndex((f) => f.id === feedback.id);
  if (index === -1) {
    feedbackCache.unshift(feedback);
  } else {
    feedbackCache[index] = feedback;
  }
}

export function getReportCache(): MonthlyGrowthReport[] {
  return reportCache;
}

export function setReportCache(items: MonthlyGrowthReport[]) {
  reportCache = items;
}

export function patchReportInCache(report: MonthlyGrowthReport) {
  const index = reportCache.findIndex((r) => r.id === report.id);
  if (index === -1) {
    reportCache.unshift(report);
  } else {
    reportCache[index] = report;
  }
}
