import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.roomId !== "string" || !UUID.test(body.roomId) ||
      typeof body.clientId !== "string" || !UUID.test(body.clientId) || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "invalid_presence" }, { status: 400 });
  }
  const db = await createClient();
  // auth.uid() and room access are checked inside this single, scoped DB operation.
  const { error } = await db.rpc("set_chat_presence", {
    p_room_id: body.roomId, p_client_id: body.clientId, p_active: body.active,
  });
  if (error) return NextResponse.json({ error: "presence_failed" }, { status: error.code === "42501" ? 403 : 503 });
  return new Response(null, { status: 204 });
}
