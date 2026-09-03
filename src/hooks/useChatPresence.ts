"use client";

import { useEffect } from "react";

/** Renew only while a focused room has a working Realtime connection. */
export function useChatPresence(roomId: string, connected: boolean) {
  useEffect(() => {
    if (!roomId || !connected) return;
    let clientId: string | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let requests = Promise.resolve();
    const send = (id: string, active: boolean) => {
      // Keep leave behind any pending renewal so a late response cannot resurrect it.
      requests = requests.then(async () => {
        try {
          await fetch("/api/chat/presence", {
            method: "POST", credentials: "include", keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, clientId: id, active }),
            signal: AbortSignal.timeout(5000),
          });
        } catch { /* The 90-second server lease bounds an interrupted session. */ }
      });
    };
    const leave = () => {
      clearInterval(timer);
      if (clientId) send(clientId, false);
      clientId = undefined;
    };
    const update = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) { leave(); return; }
      if (clientId) return;
      const id = crypto.randomUUID();
      clientId = id;
      send(id, true);
      timer = setInterval(() => send(id, true), 60000);
    };
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      leave();
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", update);
    };
  }, [roomId, connected]);
}
