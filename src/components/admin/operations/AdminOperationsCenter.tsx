"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  ChevronDown,
  RefreshCw,
  UserCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Lesson } from "@/types";
import { formatSessionBalance } from "@/lib/sessions";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import type { WeeklySlotMap } from "@/lib/availability/types";
import {
  getDateKeyInTimezone,
  startOfWeekMonday,
} from "@/lib/availability/timezone";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { TeacherWeeklyScheduleCalendar } from "@/components/teacher/TeacherWeeklyScheduleCalendar";
import { AdminLessonDualModal } from "@/components/admin/operations/AdminLessonDualModal";
import { AdminLessonOperationLogPanel } from "@/components/admin/operations/AdminLessonOperationLogPanel";
import { useAdminLessonModal } from "@/components/admin/operations/useAdminLessonModal";
import type { AdminLessonOperationLogEntry } from "@/types";

interface TeacherOption {
  id: string;
  displayName: string;
}

interface BulkEnrollmentRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  planLabel: string;
  planId: string;
  curriculum: string;
  scheduleDays: string[];
  slotLabel: string;
  sessionsRemaining: number;
  sessionsTotal: number;
  contractStart: string;
  contractEnd: string;
  status: string;
  upcomingLessonCount: number;
  scheduleInSync: boolean;
  upcomingLessons: { id: string; scheduledAt: string }[];
}

type OperationsTab = "schedule" | "bulk";

const MODE_OPTIONS: {
  id: OperationsTab;
  label: string;
  description: string;
  icon: typeof CalendarClock;
}[] = [
  {
    id: "schedule",
    label: "스케줄 & 수업 조치",
    description: "주간 캘린더 · 수업 클릭 시 대체·노쇼·취소",
    icon: CalendarClock,
  },
  {
    id: "bulk",
    label: "휴직 · 퇴직 일괄 이관",
    description: "담당 변경 시 잔여 수업 전체 이관",
    icon: ArrowRightLeft,
  },
];

const SELECT_CLASS =
  "h-11 w-full appearance-none rounded-xl border-2 border-gray-200 bg-white pl-3 pr-10 text-sm font-medium text-ink shadow-sm transition-colors hover:border-violet-300 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60";

export function AdminOperationsCenter() {
  const [tab, setTab] = useState<OperationsTab>("schedule");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [teacherSlots, setTeacherSlots] = useState<WeeklySlotMap | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkEnrollments, setBulkEnrollments] = useState<BulkEnrollmentRow[]>([]);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkTransfers, setBulkTransfers] = useState<Record<string, string>>({});
  const [bulkApplyTeacher, setBulkApplyTeacher] = useState("");
  const [bulkResult, setBulkResult] = useState("");
  const [bulkSlotPreview, setBulkSlotPreview] = useState<
    Record<string, { movableCount: number; totalScheduled: number; canAbsorbAll: boolean }>
  >({});
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() =>
    startOfWeekMonday(new Date())
  );
  const [operationLogs, setOperationLogs] = useState<AdminLessonOperationLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const selectedTeacherName = useMemo(
    () => teachers.find((t) => t.id === filterTeacher)?.displayName,
    [teachers, filterTeacher]
  );

  const bulkFromTeacherName = useMemo(
    () => teachers.find((t) => t.id === bulkFrom)?.displayName,
    [teachers, bulkFrom]
  );

  const assignedEnrollmentCount = useMemo(
    () => bulkEnrollments.filter((e) => bulkTransfers[e.enrollmentId]).length,
    [bulkEnrollments, bulkTransfers]
  );

  useEffect(() => {
    if (!bulkFrom) {
      setBulkEnrollments([]);
      setBulkTransfers({});
      setBulkSlotPreview({});
      return;
    }

    let cancelled = false;
    setBulkPreviewLoading(true);
    fetch(`/api/admin/lessons/bulk-reassign?fromTeacherId=${encodeURIComponent(bulkFrom)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setBulkEnrollments(data.enrollments ?? []);
          setBulkTransfers({});
          setBulkSlotPreview({});
          setBulkResult("");
        }
      })
      .finally(() => {
        if (!cancelled) setBulkPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bulkFrom]);

  useEffect(() => {
    if (!bulkFrom || bulkEnrollments.length === 0) {
      setBulkSlotPreview({});
      return;
    }

    let cancelled = false;
    (async () => {
      const next: Record<
        string,
        { movableCount: number; totalScheduled: number; canAbsorbAll: boolean }
      > = {};
      await Promise.all(
        bulkEnrollments.map(async (row) => {
          const toTeacherId = bulkTransfers[row.enrollmentId];
          if (!toTeacherId) return;
          const params = new URLSearchParams({
            fromTeacherId: bulkFrom,
            enrollmentId: row.enrollmentId,
            toTeacherId,
          });
          const res = await fetch(`/api/admin/lessons/bulk-reassign?${params}`);
          const data = await res.json();
          next[row.enrollmentId] = data.slots ?? {
            movableCount: 0,
            totalScheduled: row.upcomingLessonCount,
            canAbsorbAll: false,
          };
        })
      );
      if (!cancelled) setBulkSlotPreview(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [bulkFrom, bulkEnrollments, bulkTransfers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lessonsRes, teachersRes] = await Promise.all([
        fetch("/api/admin/lessons"),
        fetch("/api/teachers/profile"),
      ]);
      const lessonsData = await lessonsRes.json();
      const teachersData = await teachersRes.json();
      setLessons(lessonsData.lessons ?? []);
      setTeachers(
        (teachersData.teachers ?? []).map((t: { id: string; displayName: string }) => ({
          id: t.id,
          displayName: t.displayName,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOperationLogs = useCallback(async () => {
    if (filterTeacher === "all") {
      setOperationLogs([]);
      return;
    }
    const weekKey = getDateKeyInTimezone(scheduleWeekStart, CANONICAL_TIMEZONE);
    setLogsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/lessons/operation-logs?teacherId=${encodeURIComponent(filterTeacher)}&weekStart=${encodeURIComponent(weekKey)}`
      );
      const data = await res.json();
      setOperationLogs(data.logs ?? []);
    } finally {
      setLogsLoading(false);
    }
  }, [filterTeacher, scheduleWeekStart]);

  const refreshScheduleView = useCallback(async () => {
    await load();
    await loadOperationLogs();
  }, [load, loadOperationLogs]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadOperationLogs();
  }, [loadOperationLogs]);

  const modal = useAdminLessonModal(refreshScheduleView);

  useEffect(() => {
    if (filterTeacher === "all") {
      setTeacherSlots(null);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    fetch(`/api/teacher/availability?teacherId=${encodeURIComponent(filterTeacher)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTeacherSlots(data.availability?.slots ?? null);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filterTeacher]);

  async function runBulkTransfer() {
    if (!bulkFrom || bulkEnrollments.length === 0) return;
    const unassigned = bulkEnrollments.filter((e) => !bulkTransfers[e.enrollmentId]);
    if (unassigned.length > 0) {
      setBulkResult(`${unassigned.length}명의 학생에게 받는 선생님이 지정되지 않았습니다.`);
      return;
    }

    setBusy(true);
    setBulkResult("");
    try {
      const transfers = bulkEnrollments.map((row) => ({
        enrollmentId: row.enrollmentId,
        toTeacherId: bulkTransfers[row.enrollmentId],
      }));
      const res = await fetch("/api/admin/lessons/bulk-reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromTeacherId: bulkFrom, transfers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkResult(data.error ?? "일괄 이관 실패");
        return;
      }
      const lines = (data.transfers ?? []).map(
        (t: {
          studentName: string;
          lessonsMoved: number;
          lessonsSkipped: number;
        }) =>
          `${t.studentName}: ${t.lessonsMoved}회 이관` +
          (t.lessonsSkipped > 0 ? ` · ${t.lessonsSkipped}회 시간 충돌` : "")
      );
      setBulkResult(lines.join("\n") || "이관 완료");
      await load();
      const previewRes = await fetch(
        `/api/admin/lessons/bulk-reassign?fromTeacherId=${encodeURIComponent(bulkFrom)}`
      );
      const previewData = await previewRes.json();
      setBulkEnrollments(previewData.enrollments ?? []);
      setBulkTransfers({});
    } finally {
      setBusy(false);
    }
  }

  function applyBulkTeacherToAllEnrollments() {
    if (!bulkApplyTeacher) return;
    const next: Record<string, string> = { ...bulkTransfers };
    for (const row of bulkEnrollments) {
      next[row.enrollmentId] = bulkApplyTeacher;
    }
    setBulkTransfers(next);
  }

  return (
    <div className="space-y-6">
      {/* Mode selector — prominent card toggles */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          {MODE_OPTIONS.map(({ id, label, description, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all",
                  active
                    ? "border-violet-500 bg-violet-50 shadow-md ring-2 ring-violet-200/60"
                    : "border-gray-200 bg-white hover:border-violet-200 hover:bg-violet-50/30"
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-500"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "font-semibold",
                      active ? "text-violet-900" : "text-ink"
                    )}
                  >
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-gray-500">{description}</p>
                </div>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 border-gray-300"
          onClick={refreshScheduleView}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      {tab === "schedule" && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[240px] flex-1 space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
                  <UserCircle className="h-4 w-4" />
                  선생님 선택
                </Label>
                <div className="relative">
                  <select
                    className={cn(
                      SELECT_CLASS,
                      filterTeacher === "all"
                        ? "border-amber-300 bg-amber-50/40"
                        : "border-violet-300"
                    )}
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                  >
                    <option value="all">선생님을 선택하세요</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              {selectedTeacherName && (
                <Badge className="h-8 bg-violet-600 px-3 text-sm hover:bg-violet-600">
                  {selectedTeacherName} · KST
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-600">
              예약 슬롯 또는 수업을 클릭하면 상세 정보와 대체·노쇼·취소 조치 창이 열립니다.
            </p>
            {filterTeacher === "teacher-1" && (
              <p className="mt-2 rounded-lg border border-dashed border-violet-200 bg-white/80 px-3 py-2 text-xs text-violet-800">
                <strong>데모:</strong> 10:00 회색 = 노쇼 처리 완료 · 11:00 빨강 = 노쇼 테스트
                (확인 창) · 14:00 = 일반 예정 수업
              </p>
            )}
          </div>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <CardHeader className="border-b bg-gray-50/80 pb-3">
              <CardTitle className="text-base">주간 스케줄</CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-4">
              {loading && (
                <p className="py-12 text-center text-sm text-gray-400">불러오는 중…</p>
              )}
              {!loading && filterTeacher === "all" && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 py-16 text-center">
                  <CalendarClock className="h-12 w-12 text-gray-300" />
                  <p className="mt-4 font-medium text-gray-700">선생님을 선택해 주세요</p>
                  <p className="mt-1 max-w-sm text-sm text-gray-500">
                    위에서 선생님을 고르면 주간 캘린더와 예정 수업이 표시됩니다.
                  </p>
                </div>
              )}
              {!loading && filterTeacher !== "all" && slotsLoading && (
                <p className="py-12 text-center text-sm text-gray-400">스케줄 불러오는 중…</p>
              )}
              {!loading && filterTeacher !== "all" && !slotsLoading && teacherSlots && (
                <>
                  <TeacherWeeklyScheduleCalendar
                    slots={teacherSlots}
                    lessons={lessons}
                    teacherId={filterTeacher}
                    displayTimezone={CANONICAL_TIMEZONE}
                    showAvailabilityFooter={false}
                    weekStart={scheduleWeekStart}
                    onWeekStartChange={setScheduleWeekStart}
                    onLessonsChange={refreshScheduleView}
                    onLessonClick={(lesson) => modal.openLesson(lesson)}
                  />
                  <div className="mt-4">
                    <AdminLessonOperationLogPanel
                      logs={operationLogs}
                      loading={logsLoading}
                      onUndoComplete={refreshScheduleView}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AdminLessonDualModal
        lesson={modal.selected}
        open={modal.selected !== null}
        onOpenChange={(open) => {
          if (!open) modal.closeLesson();
        }}
        available={modal.available}
        substituteId={modal.substituteId}
        onSubstituteIdChange={modal.setSubstituteId}
        newTime={modal.newTime}
        onNewTimeChange={modal.setNewTime}
        makeupTime={modal.makeupTime}
        onMakeupTimeChange={modal.setMakeupTime}
        note={modal.note}
        onNoteChange={modal.setNote}
        busy={modal.busy}
        message={modal.message}
        onAction={modal.runAction}
      />

      {tab === "bulk" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <Card className="border-gray-200 shadow-sm xl:col-span-5">
            <CardHeader className="border-b bg-gray-50/80">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-violet-600" />
                수강 일괄 이관
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-sm leading-relaxed text-gray-600">
                휴직·퇴직 등으로 담당을 변경할 때, 해당 선생님과 계약 중인{" "}
                <strong className="text-ink">학생별 잔여 수업 전체 스케줄</strong>을 새
                선생님에게 넘깁니다.
              </p>
              <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-900">
                1회 수업만 바꾸려면{" "}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => setTab("schedule")}
                >
                  스케줄 &amp; 수업 조치
                </button>
                에서 <strong>대체 선생님 배정</strong>을 사용하세요.
              </p>

              <div className="space-y-2 rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4">
                <Label className="text-sm font-semibold text-amber-900">
                  이관 대상 선생님 (휴직·퇴직)
                </Label>
                <div className="relative">
                  <select
                    className={cn(
                      SELECT_CLASS,
                      !bulkFrom ? "border-amber-400 bg-white" : "border-amber-300"
                    )}
                    value={bulkFrom}
                    onChange={(e) => {
                      setBulkFrom(e.target.value);
                      setBulkApplyTeacher("");
                    }}
                  >
                    <option value="">선생님을 선택하세요</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
                {bulkFromTeacherName && (
                  <p className="text-xs text-amber-800">
                    선택: <strong>{bulkFromTeacherName}</strong>
                    {bulkEnrollments.length > 0 &&
                      ` · 이관 대상 수강 ${bulkEnrollments.length}건`}
                  </p>
                )}
              </div>

              {bulkEnrollments.length > 0 && (
                <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                  <Label className="text-xs font-semibold text-violet-800">
                    모든 학생에게 동일 선생님 배정 (선택)
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <select
                        className={SELECT_CLASS}
                        value={bulkApplyTeacher}
                        onChange={(e) => setBulkApplyTeacher(e.target.value)}
                      >
                        <option value="">받는 선생님 선택…</option>
                        {teachers
                          .filter((t) => t.id !== bulkFrom)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.displayName}
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 shrink-0 px-4"
                      disabled={!bulkApplyTeacher}
                      onClick={applyBulkTeacherToAllEnrollments}
                    >
                      전체 적용
                    </Button>
                  </div>
                </div>
              )}

              <Button
                className="h-11 w-full bg-violet-600 text-base font-semibold hover:bg-violet-700"
                disabled={
                  !bulkFrom ||
                  bulkEnrollments.length === 0 ||
                  assignedEnrollmentCount < bulkEnrollments.length ||
                  busy
                }
                onClick={runBulkTransfer}
              >
                잔여 수업 일괄 이관 실행
                {bulkEnrollments.length > 0
                  ? ` (${assignedEnrollmentCount}/${bulkEnrollments.length}명 배정)`
                  : ""}
              </Button>
              {bulkResult && (
                <pre className="whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs text-gray-700">
                  {bulkResult}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm xl:col-span-7">
            <CardHeader className="border-b bg-gray-50/80">
              <CardTitle className="text-base">이관 대상 수강 (학생별)</CardTitle>
              <p className="text-xs text-gray-500">
                각 카드 = <strong>한 학생의 수강 계약 1건</strong>. 잔여 회차에 해당하는
                예정 스케줄 전체가 이관됩니다.
              </p>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-320px)] space-y-3 overflow-y-auto pt-4">
              {!bulkFrom && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-14 text-center">
                  <ArrowRightLeft className="h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-600">
                    왼쪽에서 이관 대상 선생님을 선택하세요
                  </p>
                </div>
              )}
              {bulkFrom && bulkPreviewLoading && (
                <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
              )}
              {bulkFrom && !bulkPreviewLoading && bulkEnrollments.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">
                  잔여 수업이 있는 활성 수강이 없습니다.
                </p>
              )}
              {bulkEnrollments.map((row) => {
                const assignedTo = bulkTransfers[row.enrollmentId];
                const slots = assignedTo ? bulkSlotPreview[row.enrollmentId] : undefined;
                return (
                  <div
                    key={row.enrollmentId}
                    className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{row.studentName}</p>
                        <p className="mt-0.5 text-gray-600">
                          {row.planLabel} · {row.curriculum}
                        </p>
                      </div>
                      {assignedTo && slots && (
                        <Badge
                          variant={
                            slots.canAbsorbAll
                              ? "success"
                              : slots.movableCount > 0
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {slots.canAbsorbAll
                            ? "전체 이관 가능"
                            : `이관 가능 ${slots.movableCount}/${slots.totalScheduled}회`}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-violet-50 px-3 py-2">
                        <p className="text-xs text-violet-700">잔여 수업</p>
                        <p className="text-lg font-bold text-violet-900">
                          {formatSessionBalance(row.sessionsRemaining, row.sessionsTotal)}
                        </p>
                        <p className="mt-0.5 text-xs text-violet-800">
                          예정 스케줄{" "}
                          <strong
                            className={
                              row.scheduleInSync ? "text-violet-900" : "text-amber-700"
                            }
                          >
                            {row.upcomingLessonCount}회
                          </strong>
                          {!row.scheduleInSync && (
                            <span className="text-amber-700">
                              {" "}
                              (잔여 {row.sessionsRemaining}회와 불일치)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <p>
                          계약 기간: {formatDate(row.contractStart, "ko")} ~{" "}
                          {formatDate(row.contractEnd, "ko")}
                        </p>
                        <p className="mt-1">수업 시간: {row.slotLabel}</p>
                      </div>
                    </div>

                    {row.upcomingLessons.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-violet-700">
                          예정 스케줄 {row.upcomingLessons.length}회 보기
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
                          {row.upcomingLessons.map((l) => (
                            <li key={l.id}>
                              {formatDate(l.scheduledAt, "ko")}{" "}
                              {formatTime(l.scheduledAt, "ko", CANONICAL_TIMEZONE)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="mt-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">
                        받는 선생님 (이 수강 전체)
                      </Label>
                      <div className="relative">
                        <select
                          className={cn(
                            SELECT_CLASS,
                            !assignedTo && "border-amber-300 bg-amber-50/30"
                          )}
                          value={assignedTo ?? ""}
                          onChange={(e) =>
                            setBulkTransfers((prev) => ({
                              ...prev,
                              [row.enrollmentId]: e.target.value,
                            }))
                          }
                        >
                          <option value="">선택…</option>
                          {teachers
                            .filter((t) => t.id !== bulkFrom)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.displayName}
                              </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}