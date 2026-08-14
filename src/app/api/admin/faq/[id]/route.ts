import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  deleteFaqItemInDb,
  getFaqItemByIdInDb,
  updateFaqItemInDb,
} from "@/lib/faq/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import type { UpsertFaqInput } from "@/types";

function validateInput(body: UpsertFaqInput): string | null {
  if (!body.categoryKo?.trim() || !body.categoryZh?.trim()) return "category_required";
  if (!body.questionKo?.trim() || !body.questionZh?.trim()) return "question_required";
  if (!body.answerKo?.trim() || !body.answerZh?.trim()) return "answer_required";
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { id } = await params;

  try {
    const body = (await request.json()) as UpsertFaqInput;
    const error = validateInput(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const item = await updateFaqItemInDb(id, body);
    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const existing = await getFaqItemByIdInDb(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await deleteFaqItemInDb(id);
  return NextResponse.json({ ok: true });
}
