import { AdminDashboardSlogan } from "@/components/admin/AdminDashboardSlogan";
import { AdminDashboardStats } from "@/components/admin/AdminDashboardStats";
import { AdminTodayLessons } from "@/components/admin/AdminTodayLessons";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <AdminDashboardSlogan />

      <AdminDashboardStats />

      <AdminTodayLessons />
    </div>
  );
}
