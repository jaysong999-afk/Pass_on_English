"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminStudentListItem } from "@/lib/admin/student-overview-store";
import { formatSessionBalance } from "@/lib/sessions";
import type { PaymentStatus } from "@/types";

const paymentLabels: Record<
  PaymentStatus,
  { label: string; variant: "success" | "warning" | "secondary" | "destructive" }
> = {
  confirmed: { label: "확인됨", variant: "success" },
  reported: { label: "입금 신고", variant: "warning" },
  pending: { label: "대기", variant: "secondary" },
  rejected: { label: "거절", variant: "destructive" },
};

export default function AdminStudentsPage() {
  const [activeStudents, setActiveStudents] = useState<AdminStudentListItem[]>([]);
  const [pastStudents, setPastStudents] = useState<AdminStudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, pastRes] = await Promise.all([
        fetch("/api/admin/students?tab=active"),
        fetch("/api/admin/students?tab=past"),
      ]);
      if (activeRes.ok) {
        const data = await activeRes.json();
        setActiveStudents(data.students ?? []);
      } else {
        setActiveStudents([]);
      }
      if (pastRes.ok) {
        const data = await pastRes.json();
        setPastStudents(data.students ?? []);
      } else {
        setPastStudents([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filterStudents = useCallback(
    (items: AdminStudentListItem[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return items;
      return items.filter(
        (student) =>
          student.displayName.toLowerCase().includes(q) ||
          student.legalName.toLowerCase().includes(q) ||
          (student.teacherName?.toLowerCase().includes(q) ?? false)
      );
    },
    [search]
  );

  const filteredActive = useMemo(
    () => filterStudents(activeStudents),
    [activeStudents, filterStudents]
  );
  const filteredPast = useMemo(
    () => filterStudents(pastStudents),
    [pastStudents, filterStudents]
  );

  function renderTable(items: AdminStudentListItem[]) {
    if (loading) {
      return <p className="px-4 py-12 text-center text-sm text-gray-500">불러오는 중...</p>;
    }

    if (items.length === 0) {
      return (
        <p className="px-4 py-12 text-center text-sm text-gray-500">
          표시할 학생이 없습니다.
        </p>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>국가</TableHead>
            <TableHead>플랜</TableHead>
            <TableHead>선생님</TableHead>
            <TableHead>잔여 수업</TableHead>
            <TableHead>입금</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((student) => {
            const payment = paymentLabels[student.paymentStatus];
            return (
              <TableRow key={student.id}>
                <TableCell>
                  <div className="font-medium">{student.displayName}</div>
                  {student.legalName !== student.displayName && (
                    <div className="text-xs text-gray-500">{student.legalName}</div>
                  )}
                </TableCell>
                <TableCell>{student.country}</TableCell>
                <TableCell>{student.planLabel ?? "—"}</TableCell>
                <TableCell>{student.teacherName ?? "—"}</TableCell>
                <TableCell className="tabular-nums font-medium">
                  {student.sessionsTotal > 0
                    ? formatSessionBalance(student.sessionsRemaining, student.sessionsTotal)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={payment.variant}>{payment.label}</Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/students/${student.id}`}>상세</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="이름 검색..."
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">수강 중</TabsTrigger>
          <TabsTrigger value="past">과거 수강</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <div className="overflow-hidden rounded-2xl border bg-white">
            {renderTable(filteredActive)}
          </div>
        </TabsContent>
        <TabsContent value="past">
          <div className="overflow-hidden rounded-2xl border bg-white">
            {renderTable(filteredPast)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
