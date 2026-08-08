"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminDashboardSloganProps {
  initialSlogan?: string;
}

export function AdminDashboardSlogan({ initialSlogan }: AdminDashboardSloganProps) {
  const [slogan, setSlogan] = useState(initialSlogan ?? "");
  const [draft, setDraft] = useState(initialSlogan ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/dashboard-settings");
    if (!res.ok) return;
    const data = (await res.json()) as { slogan?: string };
    if (data.slogan) {
      setSlogan(data.slogan);
      setDraft(data.slogan);
    }
  }, []);

  useEffect(() => {
    if (!initialSlogan) {
      load();
    }
  }, [initialSlogan, load]);

  async function handleSave() {
    const next = draft.trim();
    if (!next) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/dashboard-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slogan: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as { slogan: string };
        setSlogan(data.slogan);
        setDraft(data.slogan);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(slogan);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="슬로건을 입력하세요"
          className="max-w-xl text-lg font-semibold"
          maxLength={120}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <Button size="sm" className="gap-1" disabled={saving || !draft.trim()} onClick={handleSave}>
          <Check className="h-4 w-4" />
          저장
        </Button>
        <Button size="sm" variant="ghost" className="gap-1" disabled={saving} onClick={handleCancel}>
          <X className="h-4 w-4" />
          취소
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3">
      <p className="text-2xl font-bold tracking-tight text-ink">{slogan || "…"}</p>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1 opacity-60 transition-opacity group-hover:opacity-100"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        수정
      </Button>
    </div>
  );
}
