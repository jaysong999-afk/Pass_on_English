import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminMfaMode = "optional" | "required";

export interface AdminMfaAssurance {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
}

export function getAdminMfaMode(): AdminMfaMode {
  return process.env.ADMIN_MFA_MODE?.trim().toLowerCase() === "required"
    ? "required"
    : "optional";
}

export function isAdminMfaRequired(): boolean {
  return getAdminMfaMode() === "required";
}

export async function getAdminMfaAssurance(
  supabase: SupabaseClient,
  jwt?: string
): Promise<AdminMfaAssurance> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
  if (error) {
    throw new Error(`admin_mfa_assurance_failed: ${error.message}`);
  }

  const normalize = (value: string | null): "aal1" | "aal2" | null => {
    if (value === "aal1" || value === "aal2") return value;
    return null;
  };

  return {
    currentLevel: normalize(data.currentLevel),
    nextLevel: normalize(data.nextLevel),
  };
}
