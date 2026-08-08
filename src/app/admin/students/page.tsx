"use client";

import Link from "next/link";
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
import { students } from "@/lib/mock-data";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store";
import { formatSessionBalance, sumSessionBalance } from "@/lib/sessions";
import { getStudentDisplayName } from "@/lib/student-display-name";

const paymentLabels: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  confirmed: { label: "확인됨", variant: "success" },
  reported: { label: "입금 신고", variant: "warning" },
  pending: { label: "대기", variant: "secondary" },
  rejected: { label: "거절", variant: "destructive" },
};

export default function AdminStudentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Input placeholder="이름 검색..." className="max-w-sm" />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">수강 중</TabsTrigger>
          <TabsTrigger value="past">과거 수강</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <div className="rounded-2xl border bg-white overflow-hidden">
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
                {students.map((student) => {
                  const payment = paymentLabels[student.paymentStatus];
                  const enrollments = getEnrollmentsByStudent(student.id).filter(
                    (e) => e.status !== "completed"
                  );
                  const balance = sumSessionBalance(enrollments);
                  return (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium">{getStudentDisplayName(student)}</div>
                        {student.englishName && student.fullName !== student.englishName && (
                          <div className="text-xs text-gray-500">{student.fullName}</div>
                        )}
                      </TableCell>
                      <TableCell>{student.country}</TableCell>
                      <TableCell>{student.planLabel}</TableCell>
                      <TableCell>{student.teacherName}</TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {enrollments.length > 0
                          ? formatSessionBalance(balance.remaining, balance.total)
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
          </div>
        </TabsContent>
        <TabsContent value="past">
          <p className="py-12 text-center text-sm text-gray-500">과거 수강자 데이터는 Phase 2에서 연동됩니다.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
