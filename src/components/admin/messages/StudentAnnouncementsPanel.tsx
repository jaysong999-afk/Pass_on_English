"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  Copy,
  Megaphone,
  Pencil,
  Plus,
  Save,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AdminStudentAnnouncement,
  StudentAnnouncementDisplayStatus,
  StudentAnnouncementPriority,
  StudentAnnouncementStatus,
  UpsertStudentAnnouncementInput,
} from "@/lib/announcements/types";

interface AnnouncementForm {
  priority: StudentAnnouncementPriority;
  titleKo: string;
  bodyKo: string;
  titleZhCn: string;
  bodyZhCn: string;
  startsAt: string;
  endsAt: string;
  portalWide: boolean;
  linkPath: string;
  linkLabelKo: string;
  linkLabelZhCn: string;
  sortOrder: string;
}

const PAGE_SIZE = 20;
const DISPLAY_STATUS_LABELS: Record<StudentAnnouncementDisplayStatus, string> = {
  draft: "임시저장",
  scheduled: "게시 예약",
  published: "게시 중",
  expired: "게시 종료",
  archived: "보관",
};
const PRIORITY_LABELS: Record<StudentAnnouncementPriority, string> = {
  normal: "일반",
  important: "중요",
  urgent: "긴급",
};
const ERROR_MESSAGES: Record<string, string> = {
  invalid_starts_at: "게시 시작 일시를 확인해 주세요.",
  invalid_ends_at: "게시 종료 일시를 확인해 주세요.",
  invalid_period: "게시 종료 일시는 시작 일시보다 늦어야 합니다.",
  title_required: "게시하려면 한국어·중국어 제목을 모두 입력해야 합니다.",
  body_required: "게시하려면 한국어·중국어 내용을 모두 입력해야 합니다.",
  important_end_required: "중요·긴급 공지는 게시 종료 일시를 입력해 주세요.",
  title_too_long: "제목은 120자 이내로 입력해 주세요.",
  body_too_long: "내용은 3,000자 이내로 입력해 주세요.",
  invalid_link_path: "연결 경로는 /로 시작하는 서비스 내부 경로만 사용할 수 있습니다.",
};

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyForm(): AnnouncementForm {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    priority: "normal",
    titleKo: "",
    bodyKo: "",
    titleZhCn: "",
    bodyZhCn: "",
    startsAt: localDateTimeValue(now),
    endsAt: "",
    portalWide: false,
    linkPath: "",
    linkLabelKo: "",
    linkLabelZhCn: "",
    sortOrder: "0",
  };
}

function isoToLocalInput(iso: string | null) {
  return iso ? localDateTimeValue(new Date(iso)) : "";
}

function itemToForm(item: AdminStudentAnnouncement, duplicate = false): AnnouncementForm {
  return {
    priority: item.priority,
    titleKo: duplicate ? `${item.titleKo} (복사)` : item.titleKo,
    bodyKo: item.bodyKo,
    titleZhCn: duplicate ? `${item.titleZhCn}（副本）` : item.titleZhCn,
    bodyZhCn: item.bodyZhCn,
    startsAt: duplicate ? emptyForm().startsAt : isoToLocalInput(item.startsAt),
    endsAt: duplicate ? "" : isoToLocalInput(item.endsAt),
    portalWide: item.portalWide,
    linkPath: item.linkPath ?? "",
    linkLabelKo: item.linkLabelKo ?? "",
    linkLabelZhCn: item.linkLabelZhCn ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function formToInput(
  form: AnnouncementForm,
  status: StudentAnnouncementStatus
): UpsertStudentAnnouncementInput {
  return {
    status,
    priority: form.priority,
    titleKo: form.titleKo,
    bodyKo: form.bodyKo,
    titleZhCn: form.titleZhCn,
    bodyZhCn: form.bodyZhCn,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    portalWide: form.portalWide,
    linkPath: form.linkPath || null,
    linkLabelKo: form.linkLabelKo || null,
    linkLabelZhCn: form.linkLabelZhCn || null,
    sortOrder: Number(form.sortOrder) || 0,
  };
}

function itemToInput(
  item: AdminStudentAnnouncement,
  status: StudentAnnouncementStatus
): UpsertStudentAnnouncementInput {
  return {
    status,
    priority: item.priority,
    titleKo: item.titleKo,
    bodyKo: item.bodyKo,
    titleZhCn: item.titleZhCn,
    bodyZhCn: item.bodyZhCn,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    portalWide: item.portalWide,
    linkPath: item.linkPath,
    linkLabelKo: item.linkLabelKo,
    linkLabelZhCn: item.linkLabelZhCn,
    sortOrder: item.sortOrder,
  };
}

function formatDateTime(iso: string | null) {
  if (!iso) return "종료일 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function StatusBadge({ status }: { status: StudentAnnouncementDisplayStatus }) {
  const variant =
    status === "published"
      ? "success"
      : status === "scheduled"
        ? "default"
        : status === "expired"
          ? "warning"
          : "outline";
  return <Badge variant={variant}>{DISPLAY_STATUS_LABELS[status]}</Badge>;
}

export function StudentAnnouncementsPanel() {
  const [items, setItems] = useState<AdminStudentAnnouncement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm());
  const [previewLocale, setPreviewLocale] = useState<"ko" | "zh-CN">("ko");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    return params.toString();
  }, [page, priorityFilter, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/student-announcements?${query}`, { cache: "no-store" });
      const data = (await response.json()) as {
        items?: AdminStudentAnnouncement[];
        total?: number;
        error?: string;
      };
      if (!response.ok) {
        setMessage("공지사항을 불러오지 못했습니다. DB 마이그레이션 적용 상태를 확인해 주세요.");
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setEditingId("new");
    setForm(emptyForm());
    setPreviewLocale("ko");
    setMessage("");
  }

  function startEdit(item: AdminStudentAnnouncement) {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setPreviewLocale("ko");
    setMessage("");
  }

  function duplicate(item: AdminStudentAnnouncement) {
    setEditingId("new");
    setForm(itemToForm(item, true));
    setPreviewLocale("ko");
    setMessage("복사본을 만들었습니다. 게시 기간을 확인한 뒤 저장해 주세요.");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  async function save(status: StudentAnnouncementStatus) {
    if (!form.startsAt) {
      setMessage("게시 시작 일시를 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const url =
        editingId === "new"
          ? "/api/admin/student-announcements"
          : `/api/admin/student-announcements/${editingId}`;
      const response = await fetch(url, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToInput(form, status)),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(ERROR_MESSAGES[data.error ?? ""] ?? "공지사항을 저장하지 못했습니다.");
        return;
      }

      setEditingId(null);
      setForm(emptyForm());
      setMessage(status === "draft" ? "임시저장했습니다." : "게시 설정을 저장했습니다.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function archive(item: AdminStudentAnnouncement) {
    if (!window.confirm("이 공지를 보관할까요? 학생 포털에서는 즉시 숨겨집니다.")) return;
    const response = await fetch(`/api/admin/student-announcements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemToInput(item, "archived")),
    });
    if (!response.ok) {
      setMessage("공지를 보관하지 못했습니다.");
      return;
    }
    setMessage("공지를 보관했습니다.");
    await load();
  }

  const previewTitle = previewLocale === "ko" ? form.titleKo : form.titleZhCn;
  const previewBody = previewLocale === "ko" ? form.bodyKo : form.bodyZhCn;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-ink">학생 포털 공지 관리</h2>
          <p className="mt-1 text-sm text-gray-500">
            전체 학생이 함께 보는 공지입니다. 학생별 알림 행을 만들지 않아 DB 트래픽이 증가하지 않습니다.
          </p>
        </div>
        <Button onClick={startNew} disabled={editingId === "new"} className="gap-1.5">
          <Plus className="h-4 w-4" />
          새 공지 작성
        </Button>
      </div>

      {message && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          {message}
        </div>
      )}

      {editingId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-violet-200">
            <CardHeader>
              <CardTitle>{editingId === "new" ? "새 학생 공지" : "학생 공지 수정"}</CardTitle>
              <CardDescription>
                게시 전 한국어와 중국어 내용을 모두 입력해 주세요. 임시저장은 빈 항목이 있어도 가능합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="중요도">
                  <select
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"
                    value={form.priority}
                    onChange={(event) => {
                      const priority = event.target.value as StudentAnnouncementPriority;
                      setForm((current) => ({
                        ...current,
                        priority,
                        portalWide: priority === "normal" ? current.portalWide : true,
                      }));
                    }}
                  >
                    <option value="normal">일반 안내</option>
                    <option value="important">중요 공지</option>
                    <option value="urgent">긴급 공지</option>
                  </select>
                </Field>
                <Field label="게시 시작">
                  <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
                </Field>
                <Field label="게시 종료">
                  <Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
                </Field>
                <Field label="정렬 순서">
                  <Input type="number" min={-32767} max={32767} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
                </Field>
              </div>

              <label className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.portalWide}
                  onChange={(event) => setForm({ ...form, portalWide: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <strong className="block text-amber-950">학생 포털 상단에 고정 표시</strong>
                  <span className="text-amber-800">전체 휴강 등 반드시 확인해야 하는 공지에 사용합니다.</span>
                </span>
              </label>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border p-4">
                  <p className="font-semibold text-ink">한국어</p>
                  <Field label="제목">
                    <Input maxLength={120} value={form.titleKo} onChange={(event) => setForm({ ...form, titleKo: event.target.value })} placeholder="예: 10월 9일 전체 휴강 안내" />
                  </Field>
                  <Field label="내용">
                    <Textarea maxLength={3000} rows={7} value={form.bodyKo} onChange={(event) => setForm({ ...form, bodyKo: event.target.value })} placeholder="학생에게 전달할 내용을 입력하세요." />
                  </Field>
                  <Field label="버튼 문구 (선택)">
                    <Input value={form.linkLabelKo} onChange={(event) => setForm({ ...form, linkLabelKo: event.target.value })} placeholder="예: 수업 일정 확인" />
                  </Field>
                </div>
                <div className="space-y-4 rounded-2xl border p-4">
                  <p className="font-semibold text-ink">中文</p>
                  <Field label="标题">
                    <Input maxLength={120} value={form.titleZhCn} onChange={(event) => setForm({ ...form, titleZhCn: event.target.value })} placeholder="例如：10月9日停课通知" />
                  </Field>
                  <Field label="内容">
                    <Textarea maxLength={3000} rows={7} value={form.bodyZhCn} onChange={(event) => setForm({ ...form, bodyZhCn: event.target.value })} placeholder="请输入要告知学生的内容。" />
                  </Field>
                  <Field label="按钮文字（可选）">
                    <Input value={form.linkLabelZhCn} onChange={(event) => setForm({ ...form, linkLabelZhCn: event.target.value })} placeholder="例如：查看课程安排" />
                  </Field>
                </div>
              </div>

              <Field label="연결할 내부 경로 (선택)">
                <Input value={form.linkPath} onChange={(event) => setForm({ ...form, linkPath: event.target.value })} placeholder="예: /student/schedule" />
                <p className="mt-1 text-xs text-gray-500">외부 주소는 사용할 수 없습니다. 학생 페이지는 /student/... 형태로 입력하면 현재 언어가 자동 적용됩니다.</p>
              </Field>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button disabled={saving} variant="secondary" onClick={() => void save("draft")} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  임시저장
                </Button>
                <Button disabled={saving} onClick={() => void save("published")} className="gap-1.5">
                  <Send className="h-4 w-4" />
                  {form.startsAt && new Date(form.startsAt) > new Date() ? "예약 게시" : "게시"}
                </Button>
                <Button disabled={saving} variant="ghost" onClick={cancelEdit}>취소</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit xl:sticky xl:top-24">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">학생 화면 미리보기</CardTitle>
                <div className="flex rounded-lg bg-gray-100 p-1 text-xs">
                  <button type="button" onClick={() => setPreviewLocale("ko")} className={cn("rounded-md px-2 py-1", previewLocale === "ko" && "bg-white font-semibold shadow-sm")}>한국어</button>
                  <button type="button" onClick={() => setPreviewLocale("zh-CN")} className={cn("rounded-md px-2 py-1", previewLocale === "zh-CN" && "bg-white font-semibold shadow-sm")}>中文</button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn("rounded-2xl border p-4", form.priority === "urgent" ? "border-red-200 bg-red-50" : form.priority === "important" ? "border-amber-200 bg-amber-50" : "border-brand-100 bg-brand-50/40")}>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4" />
                  <Badge variant={form.priority === "urgent" ? "destructive" : form.priority === "important" ? "warning" : "secondary"}>{PRIORITY_LABELS[form.priority]}</Badge>
                </div>
                <p className="mt-3 font-bold">{previewTitle || "제목이 표시됩니다"}</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{previewBody || "공지 내용이 표시됩니다."}</p>
              </div>
              <p className="mt-3 text-xs text-gray-500">상단 고정: {form.portalWide ? "표시" : "표시 안 함"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">공지 목록</CardTitle>
              <CardDescription>게시 상태는 시작·종료 일시에 따라 자동으로 계산됩니다.</CardDescription>
            </div>
            <div className="flex gap-2">
              <select aria-label="게시 상태 필터" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                <option value="">모든 상태</option>
                <option value="draft">임시저장</option>
                <option value="published">게시·예약·종료</option>
                <option value="archived">보관</option>
              </select>
              <select aria-label="중요도 필터" value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                <option value="">모든 중요도</option>
                <option value="normal">일반</option>
                <option value="important">중요</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-500">공지사항을 불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">조건에 맞는 공지사항이 없습니다.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.displayStatus} />
                    <Badge variant={item.priority === "urgent" ? "destructive" : item.priority === "important" ? "warning" : "secondary"}>{PRIORITY_LABELS[item.priority]}</Badge>
                    {item.portalWide && <Badge variant="outline">상단 고정</Badge>}
                  </div>
                  <p className="mt-2 truncate font-semibold text-ink">{item.titleKo || "(한국어 제목 없음)"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.bodyKo || "내용 없음"}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-gray-400">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDateTime(item.startsAt)} ~ {formatDateTime(item.endsAt)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    최종 수정: {item.updatedByName || "관리자"} · {formatDateTime(item.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)} className="gap-1"><Pencil className="h-3.5 w-3.5" />수정</Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate(item)} title="복제"><Copy className="h-3.5 w-3.5" /></Button>
                  {item.status !== "archived" && (
                    <Button size="sm" variant="outline" onClick={() => void archive(item)} className="text-gray-600" title="보관"><Archive className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </div>
            ))
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</Button>
              <span className="text-sm text-gray-500">{page} / {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>다음</Button>
            </div>
          )}
        </CardContent>
      </Card>
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
