import type { TextbookHistoryEntry } from "@/types";

export function TextbookHistory({
  entries,
  locale,
}: {
  entries: TextbookHistoryEntry[];
  locale: "en" | "ko";
}) {
  if (entries.length === 0) return null;

  const isKo = locale === "ko";
  const formatter = new Intl.DateTimeFormat(isKo ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <details className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-gray-600">
        {isKo ? `과거 교재 ${entries.length}개` : `Past textbooks (${entries.length})`}
      </summary>
      <ul className="mt-2 space-y-2 border-t border-gray-200 pt-2">
        {entries.map((entry, index) => {
          const replacedAt = new Date(entry.replacedAt);
          const dateLabel = Number.isNaN(replacedAt.getTime())
            ? ""
            : formatter.format(replacedAt);
          return (
            <li key={`${entry.replacedAt}-${index}`} className="flex justify-between gap-3 text-xs">
              <span className="break-words text-gray-700">{entry.textbook}</span>
              {dateLabel && <span className="shrink-0 text-gray-400">{dateLabel}</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
