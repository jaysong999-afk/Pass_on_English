import type { FaqItem } from "@/types";
import { getFaqCache } from "@/lib/faq/faq-cache";

function sortItems(list: FaqItem[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function getAllFaqItems(): FaqItem[] {
  return sortItems(getFaqCache()).map((item) => ({ ...item }));
}

export function getPublishedFaqItems(): FaqItem[] {
  return sortItems(getFaqCache().filter((item) => item.published)).map((item) => ({
    ...item,
  }));
}

export function getFaqItemById(id: string): FaqItem | undefined {
  const item = getFaqCache().find((x) => x.id === id);
  return item ? { ...item } : undefined;
}
