import { createPrivilegedClient } from "@/lib/supabase/admin";

type ProvisionedProfileRole = "student" | "teacher";

interface EnsureAuthProfileInput {
  userId: string;
  role: ProvisionedProfileRole;
  fullName: string;
  phone: string;
  locale?: string;
  accountType?: "self" | "guardian";
  country?: "KR" | "CN" | "PH" | "OTHER";
  timezone?: string;
}

function isDuplicateKey(error: { code?: string; message?: string }) {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

/**
 * Ensure the public profile exists after Auth user creation.
 *
 * The database trigger remains the primary provisioning path. This server-side
 * guard makes signup recoverable if a migration omits that trigger: the normal
 * case costs one targeted UPDATE, while a missing profile uses one INSERT.
 */
export async function ensurePrivilegedAuthProfile(input: EnsureAuthProfileInput) {
  const admin = createPrivilegedClient();
  const profilePatch = {
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.accountType ? { account_type: input.accountType } : {}),
    ...(input.country ? { country: input.country } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
  };

  const updateExisting = () =>
    admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", input.userId)
      .eq("role", input.role)
      .select("id")
      .maybeSingle();

  const { data: updated, error: updateError } = await updateExisting();
  if (updateError) {
    throw new Error(`profile_update_failed: ${updateError.message}`);
  }
  if (updated) return;

  const { error: insertError } = await admin.from("profiles").insert({
    id: input.userId,
    role: input.role,
    ...profilePatch,
  });
  if (!insertError) return;

  // A trigger may have inserted the row between the UPDATE and INSERT. Retry
  // the role-constrained update once; never overwrite a different account role.
  if (isDuplicateKey(insertError)) {
    const { data: racedProfile, error: retryError } = await updateExisting();
    if (retryError) {
      throw new Error(`profile_update_failed: ${retryError.message}`);
    }
    if (racedProfile) return;
    throw new Error("profile_role_mismatch");
  }

  throw new Error(`profile_create_failed: ${insertError.message}`);
}
