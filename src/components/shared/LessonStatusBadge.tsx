import type { LessonStatus } from "@/types";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  LessonStatus,
  { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }
> = {
  pending_payment: { label: "결제 대기", variant: "warning" },
  scheduled: { label: "예정", variant: "default" },
  completed: { label: "완료", variant: "success" },
  cancelled: { label: "취소", variant: "secondary" },
  reschedule_pending: { label: "변경 요청 중", variant: "warning" },
};

interface LessonStatusBadgeProps {
  status: LessonStatus;
  locale?: Locale | "en";
  studentAbsent?: boolean;
}

const enLabels: Record<LessonStatus, string> = {
  pending_payment: "Pending Payment",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  reschedule_pending: "Reschedule Pending",
};

const zhLabels: Record<LessonStatus, string> = {
  pending_payment: "待付款",
  scheduled: "已安排",
  completed: "已完成",
  cancelled: "已取消",
  reschedule_pending: "改期申请中",
};

export function LessonStatusBadge({ status, locale = "ko", studentAbsent }: LessonStatusBadgeProps) {
  const config = statusConfig[status];
  const label =
    status === "completed" && studentAbsent
      ? locale === "en"
        ? "Student Absent"
        : locale === "zh-CN"
          ? "学生缺席"
          : "학생 결석"
      : locale === "en"
        ? enLabels[status]
        : locale === "zh-CN"
          ? zhLabels[status]
          : config.label;
  const variant =
    status === "completed" && studentAbsent ? "warning" : config.variant;
  return <Badge variant={variant}>{label}</Badge>;
}
