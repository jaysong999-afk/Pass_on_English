import { NextResponse } from "next/server";
import { undoAdminLessonOperation } from "@/lib/admin/lesson-operations-store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    undoAdminLessonOperation(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "undo_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
