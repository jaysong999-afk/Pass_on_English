"use client";

import { Send } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  placeholder: string;
  disabled?: boolean;
  locale?: string;
  className?: string;
}

function getKeyboardHint(locale: string): string {
  if (locale.toLowerCase().startsWith("zh")) return "按 Enter 发送，Alt + Enter 换行";
  if (locale.toLowerCase().startsWith("en")) return "Enter to send, Alt + Enter for a new line";
  return "Enter로 전송, Alt + Enter로 줄바꿈";
}

function getSendLabel(locale: string): string {
  if (locale.toLowerCase().startsWith("zh")) return "发送消息";
  if (locale.toLowerCase().startsWith("en")) return "Send message";
  return "메시지 전송";
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  locale = "ko-KR",
  className,
}: ChatComposerProps) {
  const hintId = useId();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && value.trim()) void onSubmit();
      }}
      className={cn("border-t bg-gray-50/80 p-3", className)}
    >
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.altKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder={placeholder}
            rows={1}
            enterKeyHint="send"
            aria-describedby={hintId}
            disabled={disabled}
            className="max-h-32 min-h-11 resize-y bg-white"
          />
          <p id={hintId} className="mt-1.5 px-1 text-[11px] text-gray-400">
            {getKeyboardHint(locale)}
          </p>
        </div>
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={disabled || !value.trim()}
          aria-label={getSendLabel(locale)}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}
