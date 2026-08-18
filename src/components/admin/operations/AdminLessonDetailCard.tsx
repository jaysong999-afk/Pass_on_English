"use client";

import {
  BookOpen,
  Clock,
  GraduationCap,
  MessageSquare,
  User,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getTimezoneShortLabel } from "@/lib/availability/timezone";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";
import { formatDate, formatTime } from "@/lib/utils";
import { adminLessonStatusLabel } from "./admin-lesson-utils";
import { TextbookHistory } from "@/components/shared/TextbookHistory";

interface AdminLessonDetailCardProps {
  display: LessonDisplayContext;
}

export function AdminLessonDetailCard({ display }: AdminLessonDetailCardProps) {
  const { lesson } = display;
  const tzLabel = getTimezoneShortLabel(CANONICAL_TIMEZONE, "ko");

  return (
    <Card className="h-full overflow-hidden border-violet-100 shadow-md">
      <CardHeader className="bg-violet-50/70 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <User className="h-5 w-5 text-violet-600" />
              {display.englishName}
            </CardTitle>
            <p className="mt-1 text-sm text-gray-600">
              {formatDate(lesson.scheduledAt, "ko")} ·{" "}
              {formatTime(lesson.scheduledAt, "ko", CANONICAL_TIMEZONE)} ({tzLabel}) ·{" "}
              {lesson.durationMinutes}분
            </p>
          </div>
          <Badge variant="secondary">{adminLessonStatusLabel(lesson)}</Badge>
        </div>
        <p className="text-sm text-gray-500">담당: {lesson.teacherName}</p>
        {lesson.originalTeacherName && lesson.originalTeacherName !== lesson.teacherName && (
          <p className="text-xs text-violet-700">원래 담당: {lesson.originalTeacherName}</p>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
        <DetailItem icon={Clock} label="수업 시간 (KST)">
          {formatTime(lesson.scheduledAt, "ko", CANONICAL_TIMEZONE)} {tzLabel}
        </DetailItem>
        <DetailItem icon={User} label="나이">
          {display.age != null ? `${display.age}세` : "—"}
        </DetailItem>
        <DetailItem icon={GraduationCap} label="영어 레벨">
          {display.englishLevel}
        </DetailItem>
        <DetailItem icon={User} label="성별">
          {display.gender === "male"
            ? "남성"
            : display.gender === "female"
              ? "여성"
              : "—"}
        </DetailItem>
        <DetailItem icon={Video} label="화상 플랫폼">
          <Badge variant="outline" className="font-mono text-xs">
            {display.videoPlatform}
          </Badge>
        </DetailItem>
        <DetailItem icon={BookOpen} label="교재" className="sm:col-span-2">
          <div>
            {display.textbook || "—"}
            <TextbookHistory entries={display.textbookHistory} locale="ko" />
          </div>
        </DetailItem>
        <DetailItem icon={BookOpen} label="최근 진도">
          {display.lastProgressPages ?? "—"}
        </DetailItem>
        <DetailItem icon={MessageSquare} label="최근 숙제">
          <span className="text-sm leading-snug">{display.lastHomework ?? "—"}</span>
        </DetailItem>
        {display.specialNotes && (
          <DetailItem icon={MessageSquare} label="특이사항" className="sm:col-span-2">
            <span className="text-sm leading-snug text-amber-800">{display.specialNotes}</span>
          </DetailItem>
        )}
      </CardContent>
    </Card>
  );
}

function DetailItem({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}
