"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, UserCog, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/types";

const ACTION_SELECT_CLASS =
  "flex h-11 w-full appearance-none rounded-xl border-2 border-gray-200 bg-white pl-3 pr-10 text-sm font-medium shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

interface AvailableTeacher {
  teacherId: string;
  teacherName: string;
  slotAvailable: boolean;
}

interface AdminLessonActionsPanelProps {
  lesson: Lesson;
  available: AvailableTeacher[];
  substituteId: string;
  onSubstituteIdChange: (value: string) => void;
  newTime: string;
  onNewTimeChange: (value: string) => void;
  makeupTime: string;
  onMakeupTimeChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  message: string;
  onAction: (action: string, payload: Record<string, unknown>) => void;
}

export function AdminLessonActionsPanel({
  lesson,
  available,
  substituteId,
  onSubstituteIdChange,
  newTime,
  onNewTimeChange,
  makeupTime,
  onMakeupTimeChange,
  note,
  onNoteChange,
  busy,
  message,
  onAction,
}: AdminLessonActionsPanelProps) {
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false);
  const [unpaidCancelConfirmOpen, setUnpaidCancelConfirmOpen] = useState(false);

  const isActiveLesson =
    lesson.status === "scheduled" || lesson.status === "reschedule_pending";
  const alreadyNoShow = Boolean(lesson.teacherNoShow);

  function confirmNoShow() {
    setNoShowConfirmOpen(false);
    onAction("teacher_no_show", { note });
  }

  function confirmUnpaidCancel() {
    setUnpaidCancelConfirmOpen(false);
    onAction("cancel_unpaid", { note });
  }

  return (
    <>
      <Card className="flex h-full flex-col border-gray-200 shadow-md">
        <CardHeader className="border-b bg-violet-50/50 pb-3">
          <CardTitle className="text-base text-violet-900">수업 조치</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-5 overflow-y-auto pt-4">
          <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/30 p-3">
            <Label className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
              <UserCog className="h-4 w-4" />
              대체 선생님 배정
            </Label>
            <div className="relative">
              <select
                className={cn(
                  ACTION_SELECT_CLASS,
                  !substituteId && "border-amber-300 bg-amber-50/40"
                )}
                value={substituteId}
                onChange={(e) => onSubstituteIdChange(e.target.value)}
                disabled={!isActiveLesson || alreadyNoShow}
              >
                <option value="">대체 선생님 선택…</option>
                {available.map((t) => (
                  <option key={t.teacherId} value={t.teacherId} disabled={!t.slotAvailable}>
                    {t.teacherName}
                    {t.slotAvailable ? "" : " (시간 불가)"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            <Button
              size="sm"
              className="h-10 w-full bg-violet-600 hover:bg-violet-700"
              disabled={!substituteId || busy || !isActiveLesson || alreadyNoShow}
              onClick={() =>
                onAction("assign_substitute", {
                  substituteTeacherId: substituteId,
                  note,
                })
              }
            >
              대체 배정 · 피드백/급여 이관
            </Button>
          </div>

          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
            <Label className="flex items-center gap-1 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              선생님 노쇼
            </Label>
            {alreadyNoShow ? (
              <p className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600">
                이미 노쇼 처리된 수업입니다. 스케줄에서 회색으로 표시됩니다.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  학생 +1회 · 노쇼 수업·보강 무급 · 해당 월 만근/분기 보너스 리셋
                </p>
                <Input
                  type="datetime-local"
                  step={1200}
                  className="h-11 rounded-xl border-2"
                  value={makeupTime}
                  onChange={(e) => onMakeupTimeChange(e.target.value)}
                  disabled={!isActiveLesson}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-full border-amber-400 text-amber-900 hover:bg-amber-100"
                  disabled={busy || !isActiveLesson}
                  onClick={() => setNoShowConfirmOpen(true)}
                >
                  노쇼 처리
                </Button>
              </>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <Label className="text-sm font-semibold text-ink">일정 변경 (Availability 내)</Label>
            <Input
              type="datetime-local"
              step={1200}
              className="h-11 rounded-xl border-2"
              value={newTime}
              onChange={(e) => onNewTimeChange(e.target.value)}
              disabled={!isActiveLesson || alreadyNoShow}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-10 w-full"
              disabled={busy || !isActiveLesson || alreadyNoShow}
              onClick={() => onAction("reschedule", {})}
            >
              시간 변경
            </Button>
          </div>

          <Textarea
            placeholder="메모 (선택) — 무급 취소·기타 조치 사유"
            rows={2}
            className="rounded-xl border-2"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <Label className="flex items-center gap-1 text-sm font-semibold">
              <XCircle className="h-4 w-4" />
              무급 취소
            </Label>
            <p className="text-xs text-gray-500">
              선생님 급여 없이 수업을 취소합니다. 사유는 위 메모란에 입력해 주세요.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-full border-gray-400 text-gray-800 hover:bg-gray-100"
              disabled={busy || !isActiveLesson || alreadyNoShow}
              onClick={() => setUnpaidCancelConfirmOpen(true)}
            >
              무급 취소
            </Button>
          </div>

          {message && (
            <p
              className={`text-sm ${message.includes("실패") ? "text-red-600" : "text-green-700"}`}
            >
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={noShowConfirmOpen} onOpenChange={setNoShowConfirmOpen}>
        <DialogContent className="max-w-md gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              선생님 노쇼 처리 확인
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm leading-relaxed text-gray-600">
                <p>
                  이 수업을 <strong className="text-ink">노쇼 처리</strong>하시겠습니까?
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  <li>학생에게 수업 1회가 보상됩니다.</li>
                  <li>해당 수업은 선생님 무급 처리됩니다.</li>
                  <li>해당 월 만근·분기 보너스가 리셋됩니다.</li>
                  <li>스케줄 캘린더에서 해당 셀이 회색으로 표시됩니다.</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-11 flex-1"
              disabled={busy}
              onClick={() => setNoShowConfirmOpen(false)}
            >
              취소
            </Button>
            <Button
              className="h-11 flex-1 bg-amber-600 hover:bg-amber-700"
              disabled={busy}
              onClick={confirmNoShow}
            >
              {busy ? "처리 중…" : "노쇼 처리 확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unpaidCancelConfirmOpen} onOpenChange={setUnpaidCancelConfirmOpen}>
        <DialogContent className="max-w-md gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <XCircle className="h-5 w-5" />
              무급 취소 확인
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm leading-relaxed text-gray-600">
                <p>
                  이 수업을 <strong className="text-ink">무급 취소</strong>하시겠습니까?
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  <li>선생님 급여가 지급되지 않습니다.</li>
                  <li>해당 수업은 스케줄에서 삭제됩니다.</li>
                  <li>선생님 캘린더 해당 시간이 다시 Available(초록)으로 표시됩니다.</li>
                  <li>학생 잔여 수업 1회가 차감됩니다.</li>
                </ul>
                {note.trim() && (
                  <p className="rounded-lg border bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    메모: {note.trim()}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-11 flex-1"
              disabled={busy}
              onClick={() => setUnpaidCancelConfirmOpen(false)}
            >
              취소
            </Button>
            <Button
              className="h-11 flex-1 bg-gray-800 hover:bg-gray-900"
              disabled={busy}
              onClick={confirmUnpaidCancel}
            >
              {busy ? "처리 중…" : "무급 취소 확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
