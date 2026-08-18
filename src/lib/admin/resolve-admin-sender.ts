import { createClient } from "@/lib/supabase/server";

export { ADMIN_SENDER_DISPLAY_NAME } from "@/lib/admin/constants";

export async function resolveAdminProfileIdInDb(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`admin_profile_lookup_failed: ${error.message}`);
  if (!data?.id) throw new Error("admin_profile_not_found");
  return data.id;
}
