import type { DirectMessage } from "@/lib/admin/messages/types";
import { compareChatMessages } from "@/lib/chat/message-page";

export function dedupeDirectMessages(messages: DirectMessage[]): DirectMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  }).sort(compareChatMessages);
}

export function appendDirectMessage(
  messages: DirectMessage[],
  message: DirectMessage
): DirectMessage[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message].sort(compareChatMessages);
}
