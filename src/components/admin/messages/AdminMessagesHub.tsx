"use client";

import { Suspense } from "react";
import { Headphones, Megaphone, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BroadcastPanel } from "@/components/admin/messages/BroadcastPanel";
import { CsManagerPanel } from "@/components/admin/messages/CsManagerPanel";
import { PushNotificationsPanel } from "@/components/admin/messages/PushNotificationsPanel";

export function AdminMessagesHub() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-white px-5 py-4">
        <div>
          <h1 className="text-lg font-bold text-ink">메시지 · CS 센터</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            1:1 CS, 채팅 모니터링, 단체 발송, Web Push를 한곳에서 관리합니다.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          API 연동 · 자동 발송 cron은 배포 후
        </Badge>
      </div>

      <Tabs defaultValue="cs">
        <TabsList className="h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="cs" className="gap-1.5 px-4 py-2">
            <Headphones className="h-4 w-4" />
            CS · 1:1
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-1.5 px-4 py-2">
            <Megaphone className="h-4 w-4" />
            단체 발송
          </TabsTrigger>
          <TabsTrigger value="push" className="gap-1.5 px-4 py-2">
            <Radio className="h-4 w-4" />
            Push · 알림
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cs">
          <Suspense
            fallback={
              <div className="rounded-2xl border bg-white p-8 text-sm text-gray-500">
                CS 대화 불러오는 중...
              </div>
            }
          >
            <CsManagerPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="broadcast">
          <BroadcastPanel />
        </TabsContent>
        <TabsContent value="push">
          <PushNotificationsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
