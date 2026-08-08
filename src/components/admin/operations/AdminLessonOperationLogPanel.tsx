"use client";

import { useState } from "react";
import { ClipboardList, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminLessonOperationLogEntry } from "@/types";
import { operationTypeLabel } from "@/lib/admin/admin-lesson-operation-log-store";
import { cn, formatDate, formatTime } from "@/lib/utils";

const UNDO_ERROR_LABELS: Record<string, string> = {
  log_not_found: "로그를 찾을 수 없습니다.",
  already_undone: "이미 취소된 조치입니다.",
  not_undoable: "취소할 수 없는 조치입니다.",
  lesson_state_changed: "수업 상태가 변경되어 취소할 수 없습니다.",
  makeup_already_completed: "보강 수업이 완료되어 취소할 수 없습니다.",
  makeup_not_reversible: "보강 수업 상태 때문에 취소할 수 없습니다.",
  slot_unavailable: "해당 시간에 다른 수업이 있어 취소할 수 없습니다.",
  lesson_already_exists: "수업이 이미 존재합니다.",
  invalid_undo_payload: "조치 정보가 올바르지 않습니다.",
  undo_failed: "조치 취소에 실패했습니다.",
};

interface AdminLessonOperationLogPanelProps {
  logs: AdminLessonOperationLogEntry[];
  loading?: boolean;
  onUndoComplete?: () => void;
}

export function AdminLessonOperationLogPanel({
  logs,
  loading,
  onUndoComplete,
}: AdminLessonOperationLogPanelProps) {
  const [undoBusyId, setUndoBusyId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState("");

  async function handleUndo(logId: string) {
    if (!confirm("이 조치를 취소하시겠습니까? 수업·회차·스케줄이 되돌아갑니다.")) {
      return;
    }
    setUndoBusyId(logId);
    setUndoError("");
    try {
      const res = await fetch(`/api/admin/lessons/operation-logs/${logId}/undo`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setUndoError(UNDO_ERROR_LABELS[data.error] ?? data.error ?? "조치 취소 실패");
        return;
      }
      onUndoComplete?.();
    } finally {
      setUndoBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b bg-gray-50/80 px-4 py-3">
        <ClipboardList className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-ink">수업 조치 로그</h3>
        <span className="text-xs text-gray-500">선택한 주간 기준</span>
      </div>

      <div className="p-4">
        {undoError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {undoError}
          </p>
        )}

        {loading && (
          <p className="py-6 text-center text-sm text-gray-400">로그 불러오는 중…</p>
        )}

        {!loading && logs.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            이 주에 기록된 수업 조치가 없습니다.
          </p>
        )}

        {!loading && logs.length > 0 && (
          <ul className="space-y-2">
            {logs.map((log) => {
              const undone = Boolean(log.undoneAt);
              const canUndo =
                log.undoable &&
                !undone &&
                (log.action === "teacher_no_show" || log.action === "cancel_unpaid");

              return (
                <li
                  key={log.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3 py-2.5",
                    undone ? "border-gray-100 bg-gray-50/80" : "border-violet-100 bg-violet-50/30"
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium",
                          undone && "opacity-60"
                        )}
                      >
                        {operationTypeLabel(log.action)}
                      </Badge>
                      {undone && (
                        <Badge variant="secondary" className="text-[10px]">
                          조치 취소됨
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(log.at)} {formatTime(log.at)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium text-ink",
                        undone && "text-gray-500 line-through"
                      )}
                    >
                      {log.studentName ? `${log.studentName} · ` : ""}
                      {log.summary}
                    </p>
                    <p className="text-xs text-gray-500">
                      수업: {formatDate(log.scheduledAt)} {formatTime(log.scheduledAt)}
                      {log.note ? ` · ${log.note}` : ""}
                    </p>
                  </div>

                  {canUndo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1 border-amber-300 text-amber-900 hover:bg-amber-50"
                      disabled={undoBusyId === log.id}
                      onClick={() => handleUndo(log.id)}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      취소
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
