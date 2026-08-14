"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";

interface StudentChatLinkProps {
  studentId: string;
  teacherId?: string;
  teacherName: string;
  displayName: string;
  className?: string;
}

export function StudentChatLink({
  studentId,
  teacherId: teacherIdProp,
  teacherName,
  displayName,
  className,
}: StudentChatLinkProps) {
  const router = useRouter();
  const { teacherId: sessionTeacherId } = useTeacherSession();
  const teacherId = teacherIdProp ?? sessionTeacherId;

  async function openChat(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!teacherId) return;

    const params = new URLSearchParams({
      role: "teacher",
      studentId,
      teacherName,
      displayName,
    });

    const res = await fetch(`/api/chat/rooms?${params.toString()}`);
    const data = await res.json();
    if (data.room?.id) {
      router.push(`/teacher/chat/${data.room.id}`);
    }
  }

  return (
    <button
      type="button"
      title={`Message ${displayName}`}
      aria-label={`Message ${displayName}`}
      onClick={openChat}
      disabled={!teacherId}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-40",
        className
      )}
    >
      <MessageCircle className="h-4 w-4" />
    </button>
  );
}
