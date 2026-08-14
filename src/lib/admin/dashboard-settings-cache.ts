const DEFAULT_SLOGAN = "배워서 남주자!!!";

export const DASHBOARD_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000002";

let dashboardSlogan = DEFAULT_SLOGAN;

export function getCachedDashboardSlogan() {
  return dashboardSlogan;
}

export function setCachedDashboardSlogan(value: string) {
  dashboardSlogan = value.trim() || DEFAULT_SLOGAN;
}

export function clearDashboardSettingsCache() {
  dashboardSlogan = DEFAULT_SLOGAN;
}
