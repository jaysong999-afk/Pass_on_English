"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PwaInstallBanner() {
  const t = useTranslations("common");
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const seen = window.localStorage.getItem("passon-pwa-prompt-seen");
    const timer = window.setTimeout(() => setReady(true), seen ? 1500 : 12000);
    window.localStorage.setItem("passon-pwa-prompt-seen", "true");
    return () => window.clearTimeout(timer);
  }, []);

  if (dismissed || !ready) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{t("pwaInstallTitle")}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("pwaInstallDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("pwaInstallClose")}
          className="shrink-0 text-gray-400 hover:text-gray-600 min-h-9 min-w-9 flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function PwaInstallButton() {
  return (
    <Button variant="outline" size="sm" className="gap-2">
      <Download className="h-4 w-4" />
      Add to Home Screen
    </Button>
  );
}
