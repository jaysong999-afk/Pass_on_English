const DEFAULT_SLOGAN = "배워서 남주자!!!";

let dashboardSlogan = DEFAULT_SLOGAN;

export function getDashboardSlogan(): string {
  return dashboardSlogan;
}

export function setDashboardSlogan(value: string): string {
  const trimmed = value.trim();
  dashboardSlogan = trimmed || DEFAULT_SLOGAN;
  return dashboardSlogan;
}

/** @internal */
export function resetDashboardSettingsStore() {
  dashboardSlogan = DEFAULT_SLOGAN;
}
