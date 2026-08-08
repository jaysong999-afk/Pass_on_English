"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canApprove,
  canCancel,
  initiatorLabel,
  rescheduleStatusLabel,
} from "@/lib/reschedule-labels";
import { formatDate, formatTime } from "@/lib/utils";
import type { LessonRescheduleRequest } from "@/types";

interface RescheduleProgressPanelProps {
  role: "teacher" | "student" | "admin";
  fetchUrl: string;
  timeZone?: string;
  locale?: "en" | "ko" | "zh";
  title: string;
  emptyMessage: string;
  onUpdated?: () => void;
  labels: {
    originalTime: string;
    proposedTime: string;
    reason: string;
    approve: string;
    reject: string;
    cancel: string;
    processing: string;
  };
}

export function RescheduleProgressPanel({
  role,
  fetchUrl,
  timeZone,
  locale = "en",
  title,
  emptyMessage,
  onUpdated,
  labels,
}: RescheduleProgressPanelProps) {
  const [requests, setRequests] = useState<LessonRescheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(fetchUrl);
      const data = await res.json();
      setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (id: string, action: "approve" | "reject" | "cancel") => {
    if (role === "admin") return;
    setActingId(id);
    try {
      const res = await fetch("/api/lessons/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, role }),
      });
      if (res.ok) {
        await load();
        onUpdated?.();
      }
    } finally {
      setActingId(null);
    }
  };

  const fmtLocale = locale === "zh" ? "zh-CN" : locale === "ko" ? "ko" : "en";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-emerald-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">{emptyMessage}</p>
        ) : (
          requests.map((req) => {
            const showApproveReject = role !== "admin" && canApprove(req, role);
            const showCancel = role !== "admin" && canCancel(req, role);
            const isPending =
              req.status === "pending_student_approval" ||
              req.status === "pending_teacher_approval";

            return (
              <div
                key={req.id}
                className={`rounded-xl border p-3 text-sm ${
                  isPending ? "border-amber-200 bg-amber-50/40" : "border-gray-100 bg-white"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {role === "teacher" ? req.studentName : req.teacherName}
                  </span>
                  {role === "admin" && (
                    <>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600">{req.studentName}</span>
                    </>
                  )}
                  <Badge variant={isPending ? "warning" : "secondary"} className="text-[10px]">
                    {initiatorLabel(req.initiator, locale)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {rescheduleStatusLabel(req.status, locale)}
                  </Badge>
                </div>

                <dl className="space-y-1 text-xs text-gray-600">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium">{labels.originalTime}:</dt>
                    <dd>
                      {formatDate(req.originalScheduledAt, fmtLocale)}{" "}
                      {formatTime(req.originalScheduledAt, fmtLocale, timeZone)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium">{labels.proposedTime}:</dt>
                    <dd className="font-medium text-emerald-800">
                      {formatDate(req.proposedScheduledAt, fmtLocale)}{" "}
                      {formatTime(req.proposedScheduledAt, fmtLocale, timeZone)}
                    </dd>
                  </div>
                  {req.reason && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium">{labels.reason}:</dt>
                      <dd>{req.reason}</dd>
                    </div>
                  )}
                </dl>

                {(showApproveReject || showCancel) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {showApproveReject && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          disabled={actingId === req.id}
                          onClick={() => handleAction(req.id, "approve")}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {actingId === req.id ? labels.processing : labels.approve}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={actingId === req.id}
                          onClick={() => handleAction(req.id, "reject")}
                        >
                          <X className="h-3.5 w-3.5" />
                          {labels.reject}
                        </Button>
                      </>
                    )}
                    {showCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-gray-600"
                        disabled={actingId === req.id}
                        onClick={() => handleAction(req.id, "cancel")}
                      >
                        {actingId === req.id ? labels.processing : labels.cancel}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
