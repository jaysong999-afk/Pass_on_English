import { createClient } from "@/lib/supabase/server";
import { DEMO_ADMIN_SENDER_ID } from "@/lib/admin/constants";

export { ADMIN_SENDER_DISPLAY_NAME } from "@/lib/admin/constants";

export async function resolveAdminProfileIdInDb(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return data?.id ?? DEMO_ADMIN_SENDER_ID;
}
