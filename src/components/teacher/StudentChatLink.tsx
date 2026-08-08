"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeacherStudentChatHref } from "@/lib/chat-store";

interface StudentChatLinkProps {
  studentId: string;
  teacherId: string;
  teacherName: string;
  displayName: string;
  className?: string;
}

export function StudentChatLink({
  studentId,
  teacherId,
  teacherName,
  displayName,
  className,
}: StudentChatLinkProps) {
  const href = getTeacherStudentChatHref({
    studentId,
    teacherId,
    teacherName,
    displayName,
  });

  return (
    <Link
      href={href}
      title={`Message ${displayName}`}
      aria-label={`Message ${displayName}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className="h-4 w-4" />
    </Link>
  );
}
