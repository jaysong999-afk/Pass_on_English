import type { DirectMessage } from "@/lib/admin/messages/types";

export function dedupeDirectMessages(messages: DirectMessage[]): DirectMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

export function appendDirectMessage(
  messages: DirectMessage[],
  message: DirectMessage
): DirectMessage[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message];
}
