"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Clock,
  GraduationCap,
  MessageSquare,
  Pencil,
  User,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { formatDate, formatLessonTimeRange, formatTime } from "@/lib/utils";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";
import { StudentChatLink } from "@/components/teacher/StudentChatLink";

interface TeacherLessonDetailCardProps {
  display: LessonDisplayContext;
  editableTextbook?: boolean;
  showViewLink?: boolean;
  compact?: boolean;
}

export function TeacherLessonDetailCard({
  display,
  editableTextbook = false,
  showViewLink = false,
  compact = false,
}: TeacherLessonDetailCardProps) {
  const { lesson } = display;
  const [editingTextbook, setEditingTextbook] = useState(false);
  const [editingSpecialNotes, setEditingSpecialNotes] = useState(false);
  const [textbook, setTextbook] = useState(display.textbook);
  const [specialNotes, setSpecialNotes] = useState(display.specialNotes ?? "");
  const [savingTextbook, setSavingTextbook] = useState(false);
  const [savingSpecialNotes, setSavingSpecialNotes] = useState(false);
  const [savedTextbook, setSavedTextbook] = useState(false);
  const [savedSpecialNotes, setSavedSpecialNotes] = useState(false);

  const handleSaveTextbook = async () => {
    if (!lesson.studentId) return;
    setSavingTextbook(true);
    setSavedTextbook(false);
    try {
      const res = await fetch("/api/teacher/student-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: lesson.studentId,
          teacherId: lesson.teacherId,
          textbook,
        }),
      });
      if (res.ok) {
        setSavedTextbook(true);
        setEditingTextbook(false);
      }
    } finally {
      setSavingTextbook(false);
    }
  };

  const handleSaveSpecialNotes = async () => {
    if (!lesson.studentId) return;
    setSavingSpecialNotes(true);
    setSavedSpecialNotes(false);
    try {
      const res = await fetch("/api/teacher/student-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: lesson.studentId,
          teacherId: lesson.teacherId,
          specialNotes,
        }),
      });
      if (res.ok) {
        setSavedSpecialNotes(true);
        setEditingSpecialNotes(false);
      }
    } finally {
      setSavingSpecialNotes(false);
    }
  };

  const gridClass = compact
    ? "grid gap-3 sm:grid-cols-2"
    : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <Card className="overflow-hidden border-emerald-100">
      <CardHeader className="bg-emerald-50/60 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-emerald-600" />
              {display.englishName}
              {lesson.studentId && (
                <StudentChatLink
                  studentId={lesson.studentId}
                  teacherId={lesson.teacherId}
                  teacherName={lesson.teacherName}
                  displayName={display.englishName}
                />
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-gray-500">
              {formatDate(lesson.scheduledAt, "en")} ·{" "}
              {formatLessonTimeRange(
                lesson.scheduledAt,
                lesson.durationMinutes,
                "en",
                TEACHER_TIMEZONE
              )}
            </p>
          </div>
          {showViewLink && (
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href={`/teacher/lessons/${lesson.id}`}>View</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className={`pt-4 ${gridClass}`}>
        <DetailItem icon={Clock} label="Time">
          {formatTime(lesson.scheduledAt, "en", TEACHER_TIMEZONE)}
        </DetailItem>
        <DetailItem icon={User} label="Age">
          {display.age != null ? `${display.age} yrs` : "—"}
        </DetailItem>
        <DetailItem icon={GraduationCap} label="English Level">
          {display.englishLevel}
        </DetailItem>
        <DetailItem icon={Video} label="Video Platform">
          <Badge variant="outline" className="font-mono text-xs">
            {display.videoPlatform}
          </Badge>
        </DetailItem>
        <DetailItem icon={BookOpen} label="Textbook" className="sm:col-span-2">
          {editableTextbook ? (
            <div className="space-y-2">
              {editingTextbook ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={textbook}
                    onChange={(e) => setTextbook(e.target.value)}
                    placeholder="Enter textbook name"
                    className="rounded-lg"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={savingTextbook}
                      onClick={handleSaveTextbook}
                    >
                      {savingTextbook ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTextbook(display.textbook);
                        setEditingTextbook(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{textbook || "—"}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setEditingTextbook(true)}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              )}
              {savedTextbook && (
                <p className="text-xs text-emerald-600">Textbook saved.</p>
              )}
            </div>
          ) : (
            <span className="font-medium">{display.textbook || "—"}</span>
          )}
        </DetailItem>
        <DetailItem icon={BookOpen} label="Last Progress (pages)">
          {display.lastProgressPages ?? "—"}
        </DetailItem>
        <DetailItem icon={MessageSquare} label="Last Homework">
          <span className="text-sm leading-snug">
            {display.lastHomework ?? "—"}
          </span>
        </DetailItem>
        {(editableTextbook || display.specialNotes) && (
          <DetailItem
            icon={MessageSquare}
            label="Special Notes"
            className="sm:col-span-2"
          >
            {editableTextbook ? (
              <div className="space-y-2">
                {editingSpecialNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={specialNotes}
                      onChange={(e) => setSpecialNotes(e.target.value)}
                      placeholder="Add notes about this student (preferences, reminders, etc.)"
                      rows={3}
                      className="rounded-lg"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={savingSpecialNotes}
                        onClick={handleSaveSpecialNotes}
                      >
                        {savingSpecialNotes ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSpecialNotes(display.specialNotes ?? "");
                          setEditingSpecialNotes(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-sm leading-snug text-amber-800">
                      {specialNotes || "—"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      onClick={() => setEditingSpecialNotes(true)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </div>
                )}
                {savedSpecialNotes && (
                  <p className="text-xs text-emerald-600">Special notes saved.</p>
                )}
              </div>
            ) : (
              <span className="text-sm leading-snug text-amber-800">
                {display.specialNotes}
              </span>
            )}
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
