"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { registerServiceWorker } from "@/lib/push";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const DISMISSED_UNTIL = "passon-pwa-dismissed-until";
const PwaContext = createContext({
  ready: false, installed: false, ios: false, denied: false,
  dismissed: false, canPrompt: false,
  dismiss: () => {},
  install: async () => {},
});

export function PwaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, installed: false, ios: false, denied: false });
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_UNTIL, String(Date.now() + 7 * 86400000)); } catch { /* private browsing */ }
  };

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const refresh = () => {
      setState((previous) => ({
        ready: true,
        installed: previous.installed || display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
        ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
        denied: typeof Notification !== "undefined" && Notification.permission === "denied",
      }));
      try { setDismissed(Number(localStorage.getItem(DISMISSED_UNTIL)) > Date.now()); } catch { /* optional storage */ }
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
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    const prompt = deferred;
    setDeferred(null); // A browser prompt can only be consumed once.
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "dismissed") dismiss();
    else setState((previous) => ({ ...previous, installed: true }));
  };
  return <PwaContext.Provider value={{ ...state, dismissed, canPrompt: Boolean(deferred), dismiss, install }}>{children}</PwaContext.Provider>;
}
export const usePwa = () => useContext(PwaContext);
