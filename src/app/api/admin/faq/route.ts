import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { createFaqItemInDb, getAllFaqItemsInDb } from "@/lib/faq/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import type { UpsertFaqInput } from "@/types";

function validateInput(body: UpsertFaqInput): string | null {
  if (!body.categoryKo?.trim() || !body.categoryZh?.trim()) return "category_required";
  if (!body.questionKo?.trim() || !body.questionZh?.trim()) return "question_required";
  if (!body.answerKo?.trim() || !body.answerZh?.trim()) return "answer_required";
  return null;
}

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const items = await getAllFaqItemsInDb();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  try {
    const body = (await request.json()) as UpsertFaqInput;
    const error = validateInput(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    const item = await createFaqItemInDb(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
