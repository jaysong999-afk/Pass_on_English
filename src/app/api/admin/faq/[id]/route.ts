import { NextResponse } from "next/server";
import { deleteFaqItem, getFaqItemById, updateFaqItem } from "@/lib/faq-store";
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
  const { id } = await params;

  try {
    const body = (await request.json()) as UpsertFaqInput;
    const error = validateInput(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const item = updateFaqItem(id, body);
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
  const { id } = await params;
  const existing = getFaqItemById(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  deleteFaqItem(id);
  return NextResponse.json({ ok: true });
}
