import type { FaqItem, UpsertFaqInput } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getFaqCache,
  patchFaqCache,
  removeFaqFromCache,
  setFaqCache,
} from "@/lib/faq/faq-cache";

interface FaqRow {
  id: string;
  category_ko: string;
  category_zh: string;
  question_ko: string;
  question_zh: string;
  answer_ko: string;
  answer_zh: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
}

function rowToItem(row: FaqRow): FaqItem {
  return {
    id: row.id,
    categoryKo: row.category_ko,
    categoryZh: row.category_zh,
    questionKo: row.question_ko,
    questionZh: row.question_zh,
    answerKo: row.answer_ko,
    answerZh: row.answer_zh,
    sortOrder: row.sort_order,
    published: row.published,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: UpsertFaqInput, sortOrder: number) {
  return {
    category_ko: input.categoryKo.trim(),
    category_zh: input.categoryZh.trim(),
    question_ko: input.questionKo.trim(),
    question_zh: input.questionZh.trim(),
    answer_ko: input.answerKo.trim(),
    answer_zh: input.answerZh.trim(),
    sort_order: sortOrder,
    published: input.published ?? true,
  };
}

async function fetchFaqRows(): Promise<FaqRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_items")
    .select(
      "id, category_ko, category_zh, question_ko, question_zh, answer_ko, answer_zh, sort_order, published, updated_at"
    )
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`faq_items_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as FaqRow[];
}

async function refreshFaqCache() {
  const rows = await fetchFaqRows();
  const items = rows.map(rowToItem);
  setFaqCache(items);
  return items;
}

export async function warmFaqCache() {
  return refreshFaqCache();
}

export async function getAllFaqItemsInDb() {
  return refreshFaqCache();
}

export async function getPublishedFaqItemsInDb() {
  const items = getFaqCache().length ? getFaqCache() : await refreshFaqCache();
  return items.filter((item) => item.published);
}

export async function getFaqItemByIdInDb(id: string) {
  const cached = getFaqCache().find((x) => x.id === id);
  if (cached) return { ...cached };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_items")
    .select(
      "id, category_ko, category_zh, question_ko, question_zh, answer_ko, answer_zh, sort_order, published, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`faq_item_fetch_failed: ${error.message}`);
  }
  if (!data) return undefined;

  const item = rowToItem(data as FaqRow);
  patchFaqCache(item);
  return { ...item };
}

export async function createFaqItemInDb(input: UpsertFaqInput): Promise<FaqItem> {
  const supabase = await createClient();
  const existing = await fetchFaqRows();
  const maxOrder = existing.reduce((max, row) => Math.max(max, row.sort_order), 0);
  const sortOrder = input.sortOrder ?? maxOrder + 10;

  const { data, error } = await supabase
    .from("faq_items")
    .insert(inputToRow(input, sortOrder))
    .select(
      "id, category_ko, category_zh, question_ko, question_zh, answer_ko, answer_zh, sort_order, published, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`faq_item_create_failed: ${error.message}`);
  }

  const item = rowToItem(data as FaqRow);
  patchFaqCache(item);
  return { ...item };
}

export async function updateFaqItemInDb(
  id: string,
  input: UpsertFaqInput
): Promise<FaqItem | null> {
  const existing = await getFaqItemByIdInDb(id);
  if (!existing) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_items")
    .update(inputToRow(input, input.sortOrder ?? existing.sortOrder))
    .eq("id", id)
    .select(
      "id, category_ko, category_zh, question_ko, question_zh, answer_ko, answer_zh, sort_order, published, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`faq_item_update_failed: ${error.message}`);
  }

  const item = rowToItem(data as FaqRow);
  patchFaqCache(item);
  return { ...item };
}

export async function deleteFaqItemInDb(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("faq_items")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    throw new Error(`faq_item_delete_failed: ${error.message}`);
  }

  if ((count ?? 0) === 0) return false;

  removeFaqFromCache(id);
  return true;
}
