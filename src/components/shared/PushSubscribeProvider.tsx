"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ensurePushSubscription, registerServiceWorker } from "@/lib/push";

function resolvePushRole(pathname: string): "student" | "teacher" {
  return pathname.startsWith("/teacher") ? "teacher" : "student";
}

export function PushSubscribeProvider() {
  const pathname = usePathname();
  const role = resolvePushRole(pathname ?? "");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()) return;

    void registerServiceWorker().then((registration) => {
      if (!registration) return;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void ensurePushSubscription(role);
      }
    });
  }, [role]);

  return null;
}
