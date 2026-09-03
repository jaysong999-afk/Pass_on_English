"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PushError, subscribeToPush, type PushFailure, type PushRole } from "@/lib/push";
import { pushCopy } from "@/lib/push/copy";
import { usePwa } from "./PwaProvider";
import { usePageVisible } from "@/hooks/usePageVisible";

type Status = "idle" | "busy" | "enabled" | "ios" | PushFailure;

export function PushSubscribeProvider({ role, userId, locale = "en" }: {
  role: PushRole; userId?: string; locale?: string;
}) {
  const pwa = usePwa();
  const copy = pushCopy(locale);
  const [status, setStatus] = useState<Status>("idle");
  const visible = usePageVisible();

  useEffect(() => {
    if (!userId || !pwa.ready || !visible) return;
    setStatus(pwa.denied ? "denied" : "idle");
    let cancelled = false;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void subscribeToPush(role, userId, false)
        .then(() => { if (!cancelled) setStatus("enabled"); })
        .catch((error) => { if (!cancelled) setStatus(error instanceof PushError ? error.reason : "failed"); });
    }
    return () => { cancelled = true; };
  }, [role, userId, pwa.ready, pwa.denied, visible]);

  async function enable() {
    if (!userId) return;
    if (pwa.ios && !pwa.installed) { setStatus("ios"); return; }
    setStatus("busy");
    try {
      await subscribeToPush(role, userId);
      setStatus("enabled");
    } catch (error) {
      setStatus(error instanceof PushError ? error.reason : "failed");
    }
  }

  if (!userId || !pwa.ready) return null;
  return (
    <section className="mb-4 rounded-xl border bg-white p-3">
      {status !== "enabled" && (
        <Button type="button" size="sm" variant="outline" disabled={status === "busy"} onClick={() => void enable()} className="h-auto min-h-9 whitespace-normal text-left">
          <Bell className="mr-2 h-4 w-4 shrink-0" />{status === "busy" ? copy.busy : copy.enable}
        </Button>
      )}
      {status !== "idle" && status !== "busy" && <p role="status" className="mt-1 text-sm text-gray-600">{copy[status]}</p>}
    </section>
  );
}
