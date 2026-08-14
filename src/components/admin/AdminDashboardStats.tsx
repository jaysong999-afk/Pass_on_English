"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckSquare,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminDashboardStats } from "@/lib/admin/dashboard-stats-store";
import { formatCurrency } from "@/lib/utils";

const EMPTY_STATS: AdminDashboardStats = {
  todayLessonTotal: 0,
  todayLessonCompleted: 0,
  approvalPending: 0,
  activeStudentCount: 0,
  activeTeacherCount: 0,
  totalRevenueKrw: 0,
};

export function AdminDashboardStats() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard-stats");
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { stats?: AdminDashboardStats };
      if (data.stats) {
        setStats(data.stats);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const display = stats ?? EMPTY_STATS;
  const ready = stats !== null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard
        href="/admin/operations"
        icon={CalendarClock}
        label="오늘 수업"
        value={ready ? `${display.todayLessonTotal}회` : "…"}
        detail={ready ? `완료 ${display.todayLessonCompleted}회` : undefined}
      />
      <StatCard
        href="/admin/reschedule"
        icon={CheckSquare}
        label="승인 필요"
        value={ready ? `${display.approvalPending}건` : "…"}
        highlight={ready && display.approvalPending > 0}
      />
      <StatCard
        href="/admin/students"
        icon={GraduationCap}
        label="수강 학생"
        value={ready ? `${display.activeStudentCount}명` : "…"}
      />
      <StatCard
        href="/admin/teachers"
        icon={Users}
        label="활성 선생님"
        value={ready ? `${display.activeTeacherCount}명` : "…"}
      />
      <StatCard
        href="/admin/finance"
        icon={Wallet}
        label="총 매출"
        value={ready ? formatCurrency(display.totalRevenueKrw, "KRW") : "…"}
      />
      {error && (
        <p className="col-span-2 text-sm text-red-600 lg:col-span-5">
          대시보드 수치를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  detail,
  highlight,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card
        className={`h-full transition-colors hover:border-violet-300 hover:bg-violet-50/30 ${
          highlight ? "border-amber-300 bg-amber-50/50" : ""
        }`}
      >
        <CardContent className="p-5">
          <Icon className={`h-5 w-5 ${highlight ? "text-amber-600" : "text-violet-600"}`} />
          <p className="mt-3 text-2xl font-bold">{value}</p>
          {detail && <p className="text-sm font-medium text-gray-600">{detail}</p>}
          <p className="mt-1 text-sm text-gray-500">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
