"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  MousePointerClick,
  Settings2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PushCampaignRow,
  PushCampaignTotals,
  SystemNotificationRule,
} from "@/lib/admin/messages/types";
import { cn, formatDate, formatTime } from "@/lib/utils";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof BellRing;
  tone: "violet" | "green" | "red" | "blue";
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  };
  return (
    <Card className={`rounded-2xl border ${tones[tone]}`}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-xl bg-white/80 p-2 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium opacity-80">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-xs opacity-70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function PushNotificationsPanel() {
  const [rules, setRules] = useState<SystemNotificationRule[]>([]);
  const [campaigns, setCampaigns] = useState<PushCampaignRow[]>([]);
  const [totals, setTotals] = useState<PushCampaignTotals>({
    sent: 0,
    delivered: 0,
    failed: 0,
    clicked: 0,
    deliveryRate: 0,
    ctr: 0,
  });
  const [loading, setLoading] = useState(true);
  const [savedToast, setSavedToast] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignRes, rulesRes] = await Promise.all([
        fetch("/api/admin/messages/campaigns"),
        fetch("/api/admin/messages/notification-rules"),
      ]);
      if (campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaigns(data.campaigns ?? []);
        if (data.totals) setTotals(data.totals);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/messages/notification-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: rules.map((r) => ({ id: r.id, enabled: r.enabled })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSavedToast(data.error ?? "저장에 실패했습니다.");
      } else {
        setRules(data.rules ?? rules);
        setSavedToast("자동 알림 설정이 저장되었습니다.");
      }
    } finally {
      setSaving(false);
      window.setTimeout(() => setSavedToast(""), 3500);
    }
  }

  return (
    <div className="space-y-6">
      {savedToast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {savedToast}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="총 발송"
          value={loading ? "…" : totals.sent.toLocaleString()}
          sub="캠페인 합계"
          icon={BellRing}
          tone="violet"
        />
        <StatCard
          label="전달 성공률"
          value={loading ? "…" : `${totals.deliveryRate}%`}
          sub={`${totals.delivered.toLocaleString()}건 성공`}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="실패"
          value={loading ? "…" : totals.failed.toLocaleString()}
          sub="구독 해지·토큰 만료 등"
          icon={XCircle}
          tone="red"
        />
        <StatCard
          label="클릭률 (CTR)"
          value={loading ? "…" : `${totals.ctr}%`}
          sub={`${totals.clicked.toLocaleString()}건 클릭`}
          icon={MousePointerClick}
          tone="blue"
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Web Push 발송 내역</CardTitle>
          <CardDescription>캠페인별 전달·실패·클릭 지표</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">불러오는 중...</p>
          ) : campaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">발송 내역이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>세그먼트</TableHead>
                  <TableHead>발송일</TableHead>
                  <TableHead className="text-right">대상</TableHead>
                  <TableHead className="text-right">성공</TableHead>
                  <TableHead className="text-right">실패</TableHead>
                  <TableHead className="text-right">클릭</TableHead>
                  <TableHead>채널</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((row) => {
                  const rate = row.recipients
                    ? Math.round((row.delivered / row.recipients) * 100)
                    : 0;
                  const ctr = row.delivered
                    ? Math.round((row.clicked / row.delivered) * 100)
                    : 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.title}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-gray-600">
                        {row.segment}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(row.sentAt, "ko")}
                        <br />
                        <span className="text-gray-400">{formatTime(row.sentAt)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.recipients}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">
                        {row.delivered}
                        <span className="ml-1 text-[10px] text-gray-400">({rate}%)</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {row.failed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.clicked}
                        <span className="ml-1 text-[10px] text-gray-400">({ctr}%)</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {row.channel === "push_chat" ? "푸시+채팅" : "푸시"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-violet-600" />
                  자동 시스템 알림
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  향후 구축 예정
                </Badge>
              </div>
              <CardDescription className="mt-1.5">
                수업 리마인더, 입금 확인, 보강 요청 등 자동 Push·앱 알림 규칙
              </CardDescription>
              <p className="mt-2 text-xs text-amber-700">
                규칙 ON/OFF는 DB에 저장됩니다. 실제 자동 발송(cron/Edge)은 서비스 배포 후
                연동됩니다.
              </p>
            </div>
            <Button onClick={() => void saveSettings()} disabled={saving || loading}>
              설정 저장
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 transition",
                rule.enabled ? "border-violet-100 bg-white" : "border-gray-100 bg-gray-50/80"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{rule.label}</p>
                  {rule.channels.map((ch) => (
                    <Badge key={ch} variant="secondary" className="text-[10px]">
                      {ch === "push" ? "Push" : "앱 알림"}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-sm text-gray-500">{rule.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                aria-label={`${rule.label} ${rule.enabled ? "켜짐" : "꺼짐"}`}
                onClick={() => toggleRule(rule.id)}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition",
                  rule.enabled ? "bg-violet-600" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
                    rule.enabled ? "left-[22px]" : "left-0.5"
                  )}
                />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
