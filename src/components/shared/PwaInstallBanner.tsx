"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "./PwaProvider";
import { pushCopy } from "@/lib/push/copy";

export function PwaInstallBanner({ locale = "en", portal = false }: { locale?: string; portal?: boolean }) {
  const pwa = usePwa();
  const pathname = usePathname();
  const copy = pushCopy(locale);
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pwa.ready || pwa.installed || pwa.denied || pwa.dismissed) return null;
  if (!portal && (!/^\/(ko|zh-CN)\/?$/.test(pathname) || !pwa.canPrompt)) return null;

  async function install() {
    if (!pwa.canPrompt) { setGuide(true); return; }
    setBusy(true);
    try { await pwa.install(); } catch { setGuide(true); } finally { setBusy(false); }
  }
  return (
    <aside className={portal ? "mb-3 rounded-xl border bg-white p-3" : "fixed bottom-4 right-4 z-40 max-w-xs rounded-xl border bg-white p-2 shadow-sm"}>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void install()} className="h-auto min-h-9 whitespace-normal text-left">
          <Download className="mr-2 h-4 w-4 shrink-0" />{copy.install}
        </Button>
        <button type="button" onClick={pwa.dismiss} aria-label={copy.close} className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center text-gray-500"><X className="h-4 w-4" /></button>
      </div>
      {portal && <p className="mt-2 text-xs text-gray-600">{copy.installDescription}</p>}
      {guide && <p role="status" className="mt-2 text-sm text-gray-700">{pwa.ios ? copy.ios : copy.manual}</p>}
    </aside>
  );
}
