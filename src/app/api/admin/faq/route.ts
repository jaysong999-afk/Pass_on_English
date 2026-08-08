import { NextResponse } from "next/server";
import { createFaqItem, getAllFaqItems } from "@/lib/faq-store";
import type { UpsertFaqInput } from "@/types";

function validateInput(body: UpsertFaqInput): string | null {
  if (!body.categoryKo?.trim() || !body.categoryZh?.trim()) return "category_required";
  if (!body.questionKo?.trim() || !body.questionZh?.trim()) return "question_required";
  if (!body.answerKo?.trim() || !body.answerZh?.trim()) return "answer_required";
  return null;
}

export async function GET() {
  return NextResponse.json({ items: getAllFaqItems() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UpsertFaqInput;
    const error = validateInput(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    const item = createFaqItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
