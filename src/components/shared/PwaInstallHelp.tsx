"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pushCopy } from "@/lib/push/copy";
import { usePwa } from "./PwaProvider";

export function PwaInstallHelp({ locale = "en", compact = false, className }: {
  locale?: string;
  compact?: boolean;
  className?: string;
}) {
  const pwa = usePwa();
  const copy = pushCopy(locale);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!pwa.ready || !pwa.mobile || (compact && pwa.installed)) return null;

  async function openInstall() {
    if (pwa.installed) return;
    if (!pwa.canPrompt) {
      setGuideOpen(true);
      return;
    }
    setBusy(true);
    try {
      const result = await pwa.install();
      if (result !== "accepted") setGuideOpen(true);
    } catch {
      setGuideOpen(true);
    } finally {
      setBusy(false);
    }
  }

  const label = pwa.installed ? copy.installed : compact ? copy.installMenu : copy.install;
  const action = (
    <Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled={busy || pwa.installed} onClick={() => void openInstall()} className={className}>
      <Download className="mr-2 h-4 w-4 shrink-0" />{label}
    </Button>
  );

  return (
    <>
      {compact ? action : (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{copy.installHelpTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {pwa.installed ? copy.installed : copy.installDescription}
              </p>
            </div>
            {action}
          </div>
        </section>
      )}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.installHelpTitle}</DialogTitle>
            <DialogDescription>{copy.installDescription}</DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm leading-relaxed text-gray-700">{pwa.ios ? copy.ios : copy.manual}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
