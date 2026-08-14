import { createClient } from "@/lib/supabase/server";
import {
  DASHBOARD_SETTINGS_ROW_ID,
  getCachedDashboardSlogan,
  setCachedDashboardSlogan,
} from "@/lib/admin/dashboard-settings-cache";

interface DashboardSettingsRow {
  id: string;
  slogan: string;
  updated_at: string;
}

async function fetchDashboardSettingsRow(): Promise<DashboardSettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_settings")
    .select("id, slogan, updated_at")
    .eq("id", DASHBOARD_SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`dashboard_settings_fetch_failed: ${error.message}`);
  }

  return (data as DashboardSettingsRow | null) ?? null;
}

export async function warmDashboardSettingsCache() {
  const row = await fetchDashboardSettingsRow();
  if (row?.slogan) {
    setCachedDashboardSlogan(row.slogan);
  }
  return getCachedDashboardSlogan();
}

export async function getDashboardSloganInDb() {
  if (!getCachedDashboardSlogan()) {
    await warmDashboardSettingsCache();
  }
  const row = await fetchDashboardSettingsRow();
  if (row?.slogan) {
    setCachedDashboardSlogan(row.slogan);
  }
  return getCachedDashboardSlogan();
}

export async function setDashboardSloganInDb(value: string, updatedBy?: string) {
  const supabase = await createClient();
  const slogan = value.trim() || "배워서 남주자!!!";

  const { data, error } = await supabase
    .from("dashboard_settings")
    .upsert({
      id: DASHBOARD_SETTINGS_ROW_ID,
      slogan,
      ...(updatedBy ? { updated_by: updatedBy } : {}),
    })
    .select("id, slogan, updated_at")
    .single();

  if (error) {
    throw new Error(`dashboard_settings_update_failed: ${error.message}`);
  }

  setCachedDashboardSlogan((data as DashboardSettingsRow).slogan);
  return getCachedDashboardSlogan();
}
