"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminReviewLogsByCategory } from "@/lib/admin/admin-review-log-store-sync";
import { getRescheduleMonitoringState } from "@/lib/reschedule/admin-monitoring";
import type {
  LessonRescheduleRequest,
  StudentEnrollment,
  StudentRegistrationReview,
  TeacherApplication,
} from "@/types";

interface PaymentReviewEnrollment extends StudentEnrollment {
  studentName: string;
  studentLegalName?: string;
  depositorName?: string;
  accountHolderName?: string;
  renewalUnapplied?: boolean;
}

export interface ReviewSnapshot {
  reschedule: LessonRescheduleRequest[];
  rescheduleAttentionCount: number;
  teacherApplications: TeacherApplication[];
  studentRegistrations: StudentRegistrationReview[];
  paymentEnrollments: PaymentReviewEnrollment[];
  logs: AdminReviewLogsByCategory;
}

export type RescheduleFilter = "all" | "pending" | "completed" | "closed" | "attention";

export function useAdminReviewCenter(rescheduleFilter: RescheduleFilter) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reviews");
      setSnapshot((await res.json()) as ReviewSnapshot);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      reschedule: snapshot?.rescheduleAttentionCount ?? 0,
      teacher: snapshot?.teacherApplications.length ?? 0,
      student: snapshot?.studentRegistrations.length ?? 0,
      payment: snapshot?.paymentEnrollments.length ?? 0,
    }),
    [snapshot]
  );

  const rescheduleRows = useMemo(() => {
    const rows = snapshot?.reschedule ?? [];
    return rows.filter((request) => {
      const monitoring = getRescheduleMonitoringState(request);
      if (rescheduleFilter === "pending") return monitoring.isPending;
      if (rescheduleFilter === "completed") return request.status === "approved";
      if (rescheduleFilter === "closed") {
        return request.status === "rejected" || request.status === "cancelled";
      }
      if (rescheduleFilter === "attention") return monitoring.requiresAdminAttention;
      return true;
    });
  }, [snapshot, rescheduleFilter]);

  return { snapshot, setSnapshot, loading, counts, rescheduleRows, load };
}
