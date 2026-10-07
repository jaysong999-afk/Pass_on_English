"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Headphones, Megaphone, Radio, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BroadcastPanel } from "@/components/admin/messages/BroadcastPanel";
import { CsManagerPanel } from "@/components/admin/messages/CsManagerPanel";
import { PushNotificationsPanel } from "@/components/admin/messages/PushNotificationsPanel";
import { StudentAnnouncementsPanel } from "@/components/admin/messages/StudentAnnouncementsPanel";

const MESSAGE_TABS = ["notices", "cs", "broadcast", "push"] as const;
type MessageTab = (typeof MESSAGE_TABS)[number];

function AdminMessagesHubContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: MessageTab = MESSAGE_TABS.includes(requestedTab as MessageTab)
    ? requestedTab as MessageTab
    : searchParams.has("thread")
      ? "cs"
      : "notices";

  function selectTab(tab: MessageTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (tab !== "cs") {
      params.delete("view");
      params.delete("thread");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-white px-5 py-4">
        <div>
          <h1 className="text-lg font-bold text-ink">공지 · 메시지 센터</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            학생 공지, 1:1 CS, 단체 발송, Web Push를 한곳에서 관리합니다.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          API 연동 · 자동 발송 cron은 배포 후
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => selectTab(value as MessageTab)}>
        <TabsList className="h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="notices" className="gap-1.5 px-4 py-2">
            <ScrollText className="h-4 w-4" />
            학생 공지
          </TabsTrigger>
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

        <TabsContent value="notices">
          <StudentAnnouncementsPanel />
        </TabsContent>

        <TabsContent value="cs">
          <CsManagerPanel />
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

export function AdminMessagesHub() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border bg-white p-8 text-sm text-gray-500">
          메시지 센터 불러오는 중...
        </div>
      }
    >
      <AdminMessagesHubContent />
    </Suspense>
  );
}
