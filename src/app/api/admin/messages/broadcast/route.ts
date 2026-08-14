import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { deliverBroadcastInDb } from "@/lib/admin/messages/repository";
import type {
  BroadcastAudience,
  BroadcastChannel,
  BroadcastEnrollmentFilter,
} from "@/lib/admin/messages/types";

function parseAudience(value: unknown): BroadcastAudience | null {
  const allowed: BroadcastAudience[] = [
    "all",
    "students_all",
    "students_kr",
    "students_cn",
    "teachers",
  ];
  if (typeof value === "string" && allowed.includes(value as BroadcastAudience)) {
    return value as BroadcastAudience;
  }
  return null;
}

function parseChannel(value: unknown): BroadcastChannel | null {
  if (value === "push_chat" || value === "push_only" || value === "chat_only") {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      audience?: string;
      filters?: string[];
      channel?: string;
      scheduledAt?: string | null;
    };

    const audience = parseAudience(body.audience);
    const channel = parseChannel(body.channel);
    if (!audience || !channel || !body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const filters = (body.filters ?? []).filter(Boolean) as BroadcastEnrollmentFilter[];

    const campaign = await deliverBroadcastInDb({
      title: body.title,
      body: body.body,
      audience,
      filters,
      channel,
      scheduledAt: body.scheduledAt ?? null,
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("[POST /api/admin/messages/broadcast]", error);
    const message = error instanceof Error ? error.message : "broadcast_send_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
