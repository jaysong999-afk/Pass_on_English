import Link from "next/link";
import {
  CalendarClock,
  CheckSquare,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AdminDashboardSlogan } from "@/components/admin/AdminDashboardSlogan";
import { AdminTodayLessons } from "@/components/admin/AdminTodayLessons";
import { getAdminDashboardStats } from "@/lib/admin/dashboard-stats-store";
import { getDashboardSlogan } from "@/lib/admin/dashboard-settings-store";
import { formatCurrency } from "@/lib/utils";

export default function AdminDashboard() {
  const stats = getAdminDashboardStats();
  const slogan = getDashboardSlogan();

  return (
    <div className="space-y-6">
      <AdminDashboardSlogan initialSlogan={slogan} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          href="/admin/operations"
          icon={CalendarClock}
          label="오늘 수업"
          value={`${stats.todayLessonTotal}회`}
          detail={`완료 ${stats.todayLessonCompleted}회`}
        />
        <StatCard
          href="/admin/reschedule"
          icon={CheckSquare}
          label="승인 필요"
          value={`${stats.approvalPending}건`}
          highlight={stats.approvalPending > 0}
        />
        <StatCard
          href="/admin/students"
          icon={GraduationCap}
          label="수강 학생"
          value={`${stats.activeStudentCount}명`}
        />
        <StatCard
          href="/admin/teachers"
          icon={Users}
          label="활성 선생님"
          value={`${stats.activeTeacherCount}명`}
        />
        <StatCard
          href="/admin/finance"
          icon={Wallet}
          label="총 매출"
          value={formatCurrency(stats.totalRevenueKrw, "KRW")}
        />
      </div>

      <AdminTodayLessons />
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
