import { NextResponse } from "next/server";

function resolveCronSecret(): string | null {
  const configured = process.env.CRON_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") {
    return "dev-cron-test-secret";
  }
  return null;
}

export function verifyCronSecret(request: Request): NextResponse | null {
  const secret = resolveCronSecret();
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearer === secret || headerSecret === secret) {
    return null;
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
