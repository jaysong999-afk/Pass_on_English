/** Fired when chat messages or read state may have changed (refresh inbox badges). */
export const CHAT_INBOX_CHANGED = "chat-inbox-changed";

export function notifyChatInboxChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_INBOX_CHANGED));
}
