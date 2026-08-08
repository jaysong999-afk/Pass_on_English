import { Badge } from "@/components/ui/badge";
import type { SalaryPayoutStatus } from "@/types";
import { cn } from "@/lib/utils";

const config: Record<
  SalaryPayoutStatus,
  { label: string; labelKo: string; variant: "secondary" | "warning" | "success" | "default" }
> = {
  estimated: {
    label: "Estimated",
    labelKo: "작성 중",
    variant: "secondary",
  },
  confirmed: {
    label: "Confirmed",
    labelKo: "확정",
    variant: "default",
  },
  processing: {
    label: "Processing",
    labelKo: "송금 진행 중",
    variant: "warning",
  },
  paid: {
    label: "Paid",
    labelKo: "입금 완료",
    variant: "success",
  },
  completed: {
    label: "Completed",
    labelKo: "종결",
    variant: "success",
  },
};

export function SalaryStatusBadge({
  status,
  locale = "en",
  className,
}: {
  status: SalaryPayoutStatus;
  locale?: "en" | "ko";
  className?: string;
}) {
  const c = config[status];
  return (
    <Badge variant={c.variant} className={cn("text-xs", className)}>
      {locale === "ko" ? c.labelKo : c.label}
    </Badge>
  );
}

export function formatSalaryMonth(month: string, locale = "en"): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}
