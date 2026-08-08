"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupFaqByCategory } from "@/lib/faq-display";
import type { Locale } from "@/lib/i18n/config";
import type { FaqItem } from "@/types";
import { cn } from "@/lib/utils";

export function StudentFaqPage() {
  const t = useTranslations("studentPortal.faq");
  const locale = useLocale() as Locale;
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/faq");
      const data = (await res.json()) as { items?: FaqItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupFaqByCategory(items, locale), [items, locale]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink md:text-2xl">
          <HelpCircle className="h-7 w-7 text-brand-600" />
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-ink-muted">{t("loading")}</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-ink-muted">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-brand-800">{group.category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.items.map((item) => {
                  const expanded = openId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-xl border border-brand-100/80"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenId(expanded ? null : item.id)}
                        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-brand-50/40"
                      >
                        <span>{item.question}</span>
                        <ChevronDown
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0 text-brand-600 transition-transform",
                            expanded && "rotate-180"
                          )}
                        />
                      </button>
                      {expanded && (
                        <div className="border-t border-brand-50 bg-brand-50/30 px-4 py-3 text-sm leading-relaxed text-ink-muted">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-ink-muted">{t("contactHint")}</p>
    </div>
  );
}
