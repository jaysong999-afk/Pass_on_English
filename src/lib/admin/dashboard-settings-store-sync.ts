import { getCachedDashboardSlogan } from "@/lib/admin/dashboard-settings-cache";

export function getDashboardSlogan(): string {
  return getCachedDashboardSlogan();
}
