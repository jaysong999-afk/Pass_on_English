"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface ChatThreadProps {
  messages: ChatMessage[];
  currentUserId?: string;
  placeholder?: string;
}

export function ChatThread({ messages, currentUserId = "student-1", placeholder = "메시지를 입력하세요..." }: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState(messages);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLocalMessages([
      ...localMessages,
      {
        id: `local-${Date.now()}`,
        senderId: currentUserId,
        senderName: "Me",
        senderRole: "student",
        body: input.trim(),
        createdAt: new Date().toISOString(),
        isOwn: true,
      },
    ]);
    setInput("");
  }

  return (
    <div className="flex h-[480px] flex-col rounded-2xl border bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {localMessages.map((msg) => {
          const isOwn = msg.isOwn ?? msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={cn("flex gap-2", isOwn && "flex-row-reverse")}>
              {!isOwn && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">
                    {msg.senderName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn("max-w-[75%]", isOwn && "items-end")}>
                {!isOwn && (
                  <p className="mb-1 text-xs text-gray-500">{msg.senderName}</p>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
                    isOwn
                      ? "bg-brand-600 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-900 rounded-bl-md"
                  )}
                >
                  {msg.body}
                </div>
                <p className={cn("mt-1 text-[10px] text-gray-400", isOwn && "text-right")}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className="flex gap-2 border-t p-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="submit" size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
