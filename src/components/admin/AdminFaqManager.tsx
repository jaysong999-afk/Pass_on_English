"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FaqItem, UpsertFaqInput } from "@/types";

interface FaqFormState {
  categoryKo: string;
  categoryZh: string;
  questionKo: string;
  questionZh: string;
  answerKo: string;
  answerZh: string;
  sortOrder: string;
  published: boolean;
}

const emptyForm = (): FaqFormState => ({
  categoryKo: "",
  categoryZh: "",
  questionKo: "",
  questionZh: "",
  answerKo: "",
  answerZh: "",
  sortOrder: "",
  published: true,
});

function itemToForm(item: FaqItem): FaqFormState {
  return {
    categoryKo: item.categoryKo,
    categoryZh: item.categoryZh,
    questionKo: item.questionKo,
    questionZh: item.questionZh,
    answerKo: item.answerKo,
    answerZh: item.answerZh,
    sortOrder: String(item.sortOrder),
    published: item.published,
  };
}

function formToInput(form: FaqFormState): UpsertFaqInput {
  return {
    categoryKo: form.categoryKo,
    categoryZh: form.categoryZh,
    questionKo: form.questionKo,
    questionZh: form.questionZh,
    answerKo: form.answerKo,
    answerZh: form.answerZh,
    sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
    published: form.published,
  };
}

export function AdminFaqManager() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FaqFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/faq");
      const data = (await res.json()) as { items?: FaqItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("new");
    setForm(emptyForm());
    setError("");
  }

  function startEdit(item: FaqItem) {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const payload = formToInput(form);
      const url =
        editingId === "new" ? "/api/admin/faq" : `/api/admin/faq/${editingId}`;
      const method = editingId === "new" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError("저장에 실패했습니다. 필수 항목을 확인해 주세요.");
        return;
      }

      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 FAQ 항목을 삭제할까요?")) return;

    const res = await fetch(`/api/admin/faq/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) cancelEdit();
      await load();
    }
  }

  async function togglePublished(item: FaqItem) {
    const res = await fetch(`/api/admin/faq/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...itemToForm(item),
        published: !item.published,
      }),
    });
    if (res.ok) await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          학생 포털 FAQ 탭에 표시되는 질문·답변을 관리합니다. 한국어·中文 모두 입력해 주세요.
        </p>
        <Button className="gap-1" onClick={startNew} disabled={editingId === "new"}>
          <Plus className="h-4 w-4" />
          FAQ 추가
        </Button>
      </div>

      {editingId && (
        <Card className="border-violet-200">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId === "new" ? "새 FAQ 작성" : "FAQ 수정"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="카테고리 (한국어)">
                <Input
                  value={form.categoryKo}
                  onChange={(e) => setForm({ ...form, categoryKo: e.target.value })}
                  placeholder="예: 수강신청·결제"
                />
              </Field>
              <Field label="分类 (中文)">
                <Input
                  value={form.categoryZh}
                  onChange={(e) => setForm({ ...form, categoryZh: e.target.value })}
                  placeholder="例如：选课与支付"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="질문 (한국어)">
                <Input
                  value={form.questionKo}
                  onChange={(e) => setForm({ ...form, questionKo: e.target.value })}
                />
              </Field>
              <Field label="问题 (中文)">
                <Input
                  value={form.questionZh}
                  onChange={(e) => setForm({ ...form, questionZh: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="답변 (한국어)">
                <Textarea
                  rows={5}
                  value={form.answerKo}
                  onChange={(e) => setForm({ ...form, answerKo: e.target.value })}
                />
              </Field>
              <Field label="回答 (中文)">
                <Textarea
                  rows={5}
                  value={form.answerZh}
                  onChange={(e) => setForm({ ...form, answerZh: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <Field label="정렬 순서 (숫자)">
                <Input
                  type="number"
                  className="w-32"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  placeholder="자동"
                />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  className="rounded border-gray-300"
                />
                학생 포털에 공개
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <Button className="gap-1" disabled={saving} onClick={handleSave}>
                <Save className="h-4 w-4" />
                {saving ? "저장 중…" : "저장"}
              </Button>
              <Button variant="secondary" onClick={cancelEdit}>
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={!item.published ? "opacity-70" : ""}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.categoryKo}</Badge>
                    <Badge variant="outline">{item.categoryZh}</Badge>
                    {!item.published && (
                      <Badge variant="warning">비공개</Badge>
                    )}
                    <span className="text-xs text-gray-400">순서 {item.sortOrder}</span>
                  </div>
                  <p className="font-medium text-ink">{item.questionKo}</p>
                  <p className="text-sm text-gray-500 line-clamp-2">{item.answerKo}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePublished(item)}
                    title={item.published ? "비공개로 전환" : "공개로 전환"}
                  >
                    {item.published ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
