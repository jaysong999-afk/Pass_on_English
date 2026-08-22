"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, MessageSquare, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_FILTER_LABELS,
  type BroadcastAudience,
  type BroadcastEnrollmentFilter,
} from "@/lib/admin/messages/types";
import { cn } from "@/lib/utils";

type SendChannel = "push_chat" | "push_only" | "chat_only";

const AUDIENCE_OPTIONS: BroadcastAudience[] = [
  "all",
  "students_all",
  "students_kr",
  "students_cn",
  "teachers",
];

const FILTER_OPTIONS: BroadcastEnrollmentFilter[] = [
  "active",
  "expiring_soon",
  "pending_payment",
  "pending_registration",
  "completed",
];

export function BroadcastPanel() {
  const [audience, setAudience] = useState<BroadcastAudience>("students_all");
  const [filters, setFilters] = useState<BroadcastEnrollmentFilter[]>(["active"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<SendChannel>("push_chat");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  const previewQuery = useMemo(() => {
    const params = new URLSearchParams({ audience });
    for (const filter of filters) {
      params.append("filter", filter);
    }
    return params.toString();
  }, [audience, filters]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/broadcast/preview?${previewQuery}`);
      const data = await res.json();
      setRecipientCount(data.count ?? 0);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewQuery]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  function toggleFilter(filter: BroadcastEnrollmentFilter) {
    setFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  }

  async function handleSend(mode: "now" | "schedule") {
    if (!title.trim() || !body.trim()) {
      setToast("제목과 내용을 입력해 주세요.");
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      setToast("예약 발송 시간을 선택해 주세요.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/admin/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          audience,
          filters: audience === "teachers" ? [] : filters,
          channel,
          scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "발송에 실패했습니다.");
        return;
      }

      const campaign = data.campaign as { recipients: number; delivered: number };
      setToast(
        mode === "schedule"
          ? `예약 발송이 등록되었습니다. (대상 ${campaign.recipients}명)`
          : `발송 완료 — 대상 ${campaign.recipients}명, 전달 ${campaign.delivered}건`
      );
      setTitle("");
      setBody("");
      setScheduledAt("");
      void loadPreview();
    } finally {
      setSending(false);
      window.setTimeout(() => setToast(""), 4500);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-violet-600" />
            단체 · 전체 메시지 발송
          </CardTitle>
          <CardDescription>
            세그먼트와 수강 상태 조건으로 대상을 좁혀 브로드캐스트합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {toast && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              {toast}
            </div>
          )}

          <div className="space-y-3">
            <Label>대상 선택</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAudience(opt)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm transition",
                    audience === opt
                      ? "border-violet-500 bg-violet-50 font-semibold text-violet-900"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {BROADCAST_AUDIENCE_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>조건 필터 (학생 대상 시)</Label>
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((filter) => {
                const active = filters.includes(filter);
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => toggleFilter(filter)}
                    disabled={audience === "teachers"}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-violet-500 bg-violet-100 text-violet-900"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50",
                      audience === "teachers" && "opacity-40"
                    )}
                  >
                    {BROADCAST_FILTER_LABELS[filter]}
                  </button>
                );
              })}
            </div>
            {audience === "teachers" && (
              <p className="text-xs text-gray-500">선생님 대상 발송 시 수강 필터는 적용되지 않습니다.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="broadcast-title">제목</Label>
              <Input
                id="broadcast-title"
                placeholder="알림 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast-schedule">예약 발송 (선택)</Label>
              <Input
                id="broadcast-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-body">내용</Label>
            <Textarea
              id="broadcast-body"
              placeholder="메시지 내용을 입력하세요..."
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>발송 채널</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "push_chat", label: "푸시 + 채팅", icon: Send },
                  { id: "push_only", label: "푸시만", icon: BellRing },
                  { id: "chat_only", label: "채팅만", icon: MessageSquare },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant={channel === id ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setChannel(id)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button disabled={sending} onClick={() => void handleSend("now")}>
              즉시 발송
            </Button>
            <Button
              variant="outline"
              disabled={sending || !scheduledAt}
              onClick={() => void handleSend("schedule")}
            >
              예약 발송
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-2xl border-violet-100 bg-violet-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-violet-600" />
              발송 예상 대상
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-violet-900">
              {previewLoading ? "…" : recipientCount.toLocaleString()}
              <span className="ml-1 text-base font-normal text-violet-700">명</span>
            </p>
            <p className="mt-2 text-xs text-violet-800/80">
              {BROADCAST_AUDIENCE_LABELS[audience]}
              {filters.length > 0 && audience !== "teachers"
                ? ` · ${filters.map((f) => BROADCAST_FILTER_LABELS[f]).join(", ")}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-400">PUSH / 채팅</p>
              <p className="mt-1 font-semibold">{title || "(제목 없음)"}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                {body || "내용을 입력하면 여기에 표시됩니다."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
