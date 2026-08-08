import type { FaqItem } from "@/types";
import type { Locale } from "@/lib/i18n/config";

export function getFaqLocalized(item: FaqItem, locale: Locale) {
  const zh = locale === "zh-CN";
  return {
    category: zh ? item.categoryZh : item.categoryKo,
    question: zh ? item.questionZh : item.questionKo,
    answer: zh ? item.answerZh : item.answerKo,
  };
}

export function groupFaqByCategory(
  items: FaqItem[],
  locale: Locale
): { category: string; items: { id: string; question: string; answer: string }[] }[] {
  const map = new Map<string, { id: string; question: string; answer: string }[]>();

  for (const item of items) {
    const { category, question, answer } = getFaqLocalized(item, locale);
    const list = map.get(category) ?? [];
    list.push({ id: item.id, question, answer });
    map.set(category, list);
  }

  return [...map.entries()].map(([category, faqItems]) => ({
    category,
    items: faqItems,
  }));
}
