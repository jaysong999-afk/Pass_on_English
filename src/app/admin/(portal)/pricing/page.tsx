"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PricingPlan } from "@/types";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { formatPlanLabel, STANDARD_SESSION_MINUTES } from "@/lib/pricing-plan-store";
import { DAY_LABELS, formatScheduleDays } from "@/lib/teacher-availability";
import { formatCurrency } from "@/lib/utils";

const DAY_OPTIONS = DAY_LABELS.map((d) => ({ value: d, label: d }));

interface PlanFormState {
  name: string;
  nameZh: string;
  scheduleDays: string[];
  sessionsCount: string;
  sessionMinutes: string;
  priceKrw: string;
  priceCny: string;
  isPopular: boolean;
  active: boolean;
  sortOrder: string;
}

const emptyForm = (): PlanFormState => ({
  name: "",
  nameZh: "",
  scheduleDays: [],
  sessionsCount: "20",
  sessionMinutes: String(STANDARD_SESSION_MINUTES),
  priceKrw: "",
  priceCny: "",
  isPopular: false,
  active: true,
  sortOrder: "",
});

function planToForm(plan: PricingPlan): PlanFormState {
  return {
    name: plan.name,
    nameZh: plan.nameZh ?? "",
    scheduleDays: [...plan.scheduleDays],
    sessionsCount: String(plan.sessionsCount),
    sessionMinutes: String(plan.sessionMinutes),
    priceKrw: String(plan.priceKrw),
    priceCny: String(plan.priceCny),
    isPopular: Boolean(plan.isPopular),
    active: plan.active,
    sortOrder: String(plan.sortOrder),
  };
}

export default function AdminPricingPage() {
  const { plans, loading, error, reload } = usePricingPlans(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    [plans]
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
    setShowForm(true);
  }

  function openEdit(plan: PricingPlan) {
    setEditingId(plan.id);
    setForm(planToForm(plan));
    setFormError("");
    setShowForm(true);
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter((d) => d !== day)
        : [...prev.scheduleDays, day],
    }));
  }

  async function handleSave() {
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        nameZh: form.nameZh || undefined,
        scheduleDays: form.scheduleDays,
        sessionsCount: Number(form.sessionsCount),
        sessionMinutes: Number(form.sessionMinutes),
        priceKrw: Number(form.priceKrw),
        priceCny: Number(form.priceCny),
        isPopular: form.isPopular,
        active: form.active,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
      };

      const res = await fetch(
        editingId ? `/api/pricing-plans/${editingId}` : "/api/pricing-plans",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setFormError(
          data.error === "schedule_days_required"
            ? "수업 요일을 하나 이상 선택해 주세요."
            : "저장에 실패했습니다."
        );
        return;
      }

      setShowForm(false);
      setEditingId(null);
      await reload();
    } catch {
      setFormError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteError("");
    if (!confirm("이 요금제를 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/pricing-plans/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(
          data.error === "plan_in_use"
            ? "수강 중인 학생이 사용 중인 요금제는 삭제할 수 없습니다."
            : "삭제에 실패했습니다."
        );
        return;
      }
      await reload();
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          요금제 추가
        </Button>
      </div>

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {showForm && (
        <Card className="border-violet-100">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "요금제 수정" : "요금제 추가"}
            </CardTitle>
            <CardDescription>수업 요일, 횟수, 시간, 가격을 설정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="plan-name">요금제 이름 (한국어)</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="주5회(월~금) 20분"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="plan-name-zh">요금제 이름 (中文)</Label>
                <Input
                  id="plan-name-zh"
                  value={form.nameZh}
                  onChange={(e) => setForm({ ...form, nameZh: e.target.value })}
                  placeholder="每周5次(周一至周五) 20分钟"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>수업 요일</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleDay(value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.scheduleDays.includes(value)
                          ? "border-violet-600 bg-violet-50 text-violet-700"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessions">수업 횟수</Label>
                <Input
                  id="sessions"
                  type="number"
                  min={1}
                  value={form.sessionsCount}
                  onChange={(e) => setForm({ ...form, sessionsCount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minutes">회당 수업 시간(분)</Label>
                <Input
                  id="minutes"
                  type="number"
                  min={1}
                  value={form.sessionMinutes}
                  onChange={(e) => setForm({ ...form, sessionMinutes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="krw">가격 (원)</Label>
                <Input
                  id="krw"
                  type="number"
                  min={0}
                  value={form.priceKrw}
                  onChange={(e) => setForm({ ...form, priceKrw: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cny">가격 (위안)</Label>
                <Input
                  id="cny"
                  type="number"
                  min={0}
                  value={form.priceCny}
                  onChange={(e) => setForm({ ...form, priceCny: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort">표시 순서</Label>
                <Input
                  id="sort"
                  type="number"
                  min={1}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPopular}
                  onChange={(e) => setForm({ ...form, isPopular: e.target.checked })}
                />
                인기 요금제
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                활성 (수강신청·랜딩 노출)
              </label>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "저장 중…" : "저장"}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록된 요금제</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && sortedPlans.length === 0 && (
            <p className="text-sm text-gray-500">등록된 요금제가 없습니다.</p>
          )}
          <div className="space-y-3">
            {sortedPlans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{formatPlanLabel(plan)}</p>
                    {plan.isPopular && <Badge>인기</Badge>}
                    {!plan.active && <Badge variant="secondary">비활성</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatScheduleDays(plan.scheduleDays)} · 회당 {plan.sessionMinutes}분 ·{" "}
                    {formatCurrency(plan.priceKrw, "KRW")} / {plan.priceCny.toLocaleString()} 위안
                    {plan.nameZh ? (
                      <>
                        <br />
                        <span className="text-brand-700">中文: {plan.nameZh}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(plan)}>
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
