import type { FaqItem } from "@/types";

let faqCache: FaqItem[] = [];

function sortItems(list: FaqItem[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function setFaqCache(items: FaqItem[]) {
  faqCache = sortItems(items.map((item) => ({ ...item })));
}

export function getFaqCache() {
  return faqCache.map((item) => ({ ...item }));
}

export function patchFaqCache(item: FaqItem) {
  const index = faqCache.findIndex((x) => x.id === item.id);
  if (index === -1) {
    faqCache.push({ ...item });
  } else {
    faqCache[index] = { ...item };
  }
  faqCache = sortItems(faqCache);
}

export function removeFaqFromCache(id: string) {
  faqCache = faqCache.filter((x) => x.id !== id);
}

export function clearFaqCache() {
  faqCache = [];
}
