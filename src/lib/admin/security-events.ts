import "server-only";

import { createHmac } from "node:crypto";
import { createPrivilegedClient } from "@/lib/supabase/admin";

export type AdminSecurityEventType =
  | "admin_login_succeeded"
  | "admin_logout"
  | "mfa_enrolled"
  | "mfa_verified"
  | "password_changed"
  | "other_sessions_signed_out";

interface AppendAdminSecurityEventInput {
  actorId: string;
  eventType: AdminSecurityEventType;
  request?: Request;
  success?: boolean;
  metadata?: Record<string, unknown>;
}
function clientAddress(request: Request): string | null {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

function hashAddress(address: string | null): string | null {
  const secret =
    process.env.ADMIN_SECURITY_EVENT_HMAC_KEY?.trim() || process.env.CRON_SECRET?.trim();
  if (!address || !secret) return null;
  return createHmac("sha256", secret).update(address).digest("hex");
}

/** Security logging is intentionally best-effort and never blocks an admin action. */
export async function appendAdminSecurityEvent({
  actorId,
  eventType,
  request,
  success = true,
  metadata = {},
}: AppendAdminSecurityEventInput): Promise<void> {
  try {
    const supabase = createPrivilegedClient();
    const userAgent = request?.headers.get("user-agent")?.slice(0, 512) ?? null;
    const { error } = await supabase.from("admin_security_events").insert({
      actor_id: actorId,
      event_type: eventType,
      success,
      ip_hash: request ? hashAddress(clientAddress(request)) : null,
      user_agent: userAgent,
      metadata,
    });

    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[admin/security-event] write failed", {
        eventType,
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[admin/security-event] unexpected write failure", {
      eventType,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
