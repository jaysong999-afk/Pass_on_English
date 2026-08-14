"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EnrollmentDashboard } from "@/components/student/EnrollmentDashboard";
import { useActiveLearnerId } from "@/contexts/ActiveLearnerContext";
import type { PaymentRecord } from "@/types";

function EnrollmentPageContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "payment" ? "payment" : "courses";
  const learnerId = useActiveLearnerId();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    if (!learnerId) {
      setPayments([]);
      return;
    }
    void fetch(`/api/enrollments?studentId=${encodeURIComponent(learnerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPayments(data?.payments ?? []))
      .catch(() => setPayments([]));
  }, [learnerId]);

  return (
    <EnrollmentDashboard payments={payments} defaultTab={tab} studentId={learnerId || undefined} />
  );
}

function EnrollmentLoadingFallback() {
  const t = useTranslations("studentPortal.common");
  return <div className="py-12 text-center text-ink-muted">{t("loading")}</div>;
}

export default function StudentEnrollmentPage() {
  return (
    <Suspense fallback={<EnrollmentLoadingFallback />}>
      <EnrollmentPageContent />
    </Suspense>
  );
}
