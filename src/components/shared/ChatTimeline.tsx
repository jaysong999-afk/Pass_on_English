"use client";

function toLocalDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function shouldShowChatDate(
  messages: { createdAt: string }[],
  index: number
): boolean {
  if (index === 0) return true;
  return toLocalDateKey(messages[index - 1].createdAt) !== toLocalDateKey(messages[index].createdAt);
}

export function formatChatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ChatDateDivider({
  value,
  locale,
}: {
  value: string;
  locale: string;
}) {
  const label = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));

  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-gray-200" />
      <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
