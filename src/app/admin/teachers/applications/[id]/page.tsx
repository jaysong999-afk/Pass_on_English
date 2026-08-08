"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchTeacherApplicationById } from "@/lib/teacher-applications";
import { formatDate } from "@/lib/utils";
import type { TeacherApplication } from "@/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-3 last:border-0 sm:flex-row sm:justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

export default function AdminTeacherApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<TeacherApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = String(params.id ?? "");
    fetchTeacherApplicationById(id).then((app) => {
      setApplication(app);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return <p className="text-gray-500">불러오는 중…</p>;
  }

  if (!application) {
    return <p className="text-gray-500">신청 내역을 찾을 수 없습니다.</p>;
  }

  async function handleReview(action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "teacher_signup",
          action,
          targetId: application!.id,
        }),
      });
      if (res.ok) {
        router.push("/admin/reschedule");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{application.fullName}</CardTitle>
            <Badge variant={application.status === "pending" ? "warning" : "secondary"}>
              {application.status === "pending"
                ? "승인 대기"
                : application.status === "approved"
                  ? "승인됨"
                  : "거절됨"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Row label="신청일" value={formatDate(application.submittedAt)} />
          <Row label="이메일" value={application.email} />
          <Row label="생년월일" value={application.dateOfBirth} />
          <Row label="전화번호" value={application.phone} />
          <Row label="계좌번호" value={application.bankAccount} />
          <Row label="Facebook Messenger ID" value={application.facebookMessengerId} />
          <Row label="주소" value={application.address} />
        </CardContent>
      </Card>

      {application.status === "pending" && (
        <div className="flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => handleReview("approve")}>
            승인 (계정 활성화)
          </Button>
          <Button
            variant="outline"
            className="flex-1 text-red-600"
            disabled={busy}
            onClick={() => handleReview("reject")}
          >
            거절
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-500">
        승인 시 teachers.status = active 로 전환됩니다. 처리 내역은 승인 요청 현황의 로그에서
        확인할 수 있습니다.
      </p>
    </div>
  );
}
