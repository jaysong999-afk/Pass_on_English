"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { registerServiceWorker } from "@/lib/push";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const DISMISSED_UNTIL = "passon-pwa-dismissed-until";
const DISMISS_DURATION_MS = 7 * 86400000;
export type InstallResult = "accepted" | "dismissed" | "unavailable";
interface PwaContextValue {
  ready: boolean;
  mobile: boolean;
  installed: boolean;
  ios: boolean;
  denied: boolean;
  dismissed: boolean;
  canPrompt: boolean;
  dismiss: () => void;
  install: () => Promise<InstallResult>;
}
const PwaContext = createContext<PwaContextValue>({
  ready: false, mobile: false, installed: false, ios: false, denied: false,
  dismissed: false, canPrompt: false,
  dismiss: () => {},
  install: async () => "unavailable",
});

export function PwaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, mobile: false, installed: false, ios: false, denied: false });
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDismissal = useCallback((until: number | null) => {
    if (dismissalTimer.current) clearTimeout(dismissalTimer.current);
    if (!until || until <= Date.now()) {
      setDismissed(false);
      return;
    }
    setDismissed(true);
    dismissalTimer.current = setTimeout(() => {
      setDismissed(false);
      try { localStorage.removeItem(DISMISSED_UNTIL); } catch { /* optional storage */ }
    }, until - Date.now());
  }, []);
  const dismiss = useCallback(() => {
    const until = Date.now() + DISMISS_DURATION_MS;
    scheduleDismissal(until);
    try { localStorage.setItem(DISMISSED_UNTIL, String(until)); } catch { /* private browsing */ }
  }, [scheduleDismissal]);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const refresh = () => {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState((previous) => ({
        ready: true,
        mobile,
        installed: previous.installed || display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
        ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
        denied: typeof Notification !== "undefined" && Notification.permission === "denied",
      }));
      try {
        const until = Number(localStorage.getItem(DISMISSED_UNTIL));
        scheduleDismissal(until > Date.now() ? until : null);
        if (until && until <= Date.now()) localStorage.removeItem(DISMISSED_UNTIL);
      } catch { setDismissed(false); /* optional storage */ }
    };
    const capture = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPrompt);
    };
    const installed = () => {
      setState((previous) => ({ ...previous, installed: true }));
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("focus", refresh);
    window.addEventListener("push-permission-changed", refresh);
    display.addEventListener("change", refresh);
    refresh();
    void registerServiceWorker();
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("push-permission-changed", refresh);
      display.removeEventListener("change", refresh);
      if (dismissalTimer.current) clearTimeout(dismissalTimer.current);
    };
  }, [scheduleDismissal]);

  const install = async () => {
    if (!deferred) return "unavailable" as const;
    const prompt = deferred;
    setDeferred(null); // A browser prompt can only be consumed once.
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "dismissed") {
      dismiss();
      return "dismissed" as const;
    }
    setState((previous) => ({ ...previous, installed: true }));
    return "accepted" as const;
  };
  return <PwaContext.Provider value={{ ...state, dismissed, canPrompt: Boolean(deferred), dismiss, install }}>{children}</PwaContext.Provider>;
}
export const usePwa = () => useContext(PwaContext);
