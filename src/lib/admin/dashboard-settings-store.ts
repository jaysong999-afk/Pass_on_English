import { clearDashboardSettingsCache } from "@/lib/admin/dashboard-settings-cache";

export { getDashboardSlogan } from "@/lib/admin/dashboard-settings-store-sync";

/** @internal */
export function resetDashboardSettingsStore() {
  clearDashboardSettingsCache();
}
