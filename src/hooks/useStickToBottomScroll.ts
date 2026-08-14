"use client";

import { useCallback, useEffect, useRef } from "react";

interface UseStickToBottomScrollOptions {
  /** Changing this re-enables auto-scroll (e.g. room or thread id). */
  resetKey?: string | null;
  /** Number of messages/items — scroll when this changes. */
  itemCount?: number;
  /** When false, defer auto-scroll until the scroll container is mounted. */
  ready?: boolean;
}

export function useStickToBottomScroll({
  resetKey,
  itemCount = 0,
  ready = true,
}: UseStickToBottomScrollOptions = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [resetKey]);

  useEffect(() => {
    if (!ready || !stickToBottomRef.current) return;
    const behavior: ScrollBehavior = itemCount > 1 ? "smooth" : "instant";
    requestAnimationFrame(() => {
      scrollToBottom(behavior);
      requestAnimationFrame(() => scrollToBottom(behavior));
    });
  }, [itemCount, resetKey, ready, scrollToBottom]);

  return {
    scrollRef,
    handleScroll,
    scrollToBottom,
    pinToBottom,
    stickToBottomRef,
  };
}
