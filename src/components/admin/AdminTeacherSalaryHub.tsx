"use client";

import { useState } from "react";
import { ClipboardCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminTeacherSalaryOverview } from "@/components/admin/AdminTeacherSalaryOverview";
import { TeacherCompensationEvaluation } from "@/components/admin/TeacherCompensationEvaluation";

export function AdminTeacherSalaryHub() {
  const [view, setView] = useState<"evaluation" | "settlement">("evaluation");
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
        <Button size="sm" variant={view === "evaluation" ? "default" : "ghost"} className="gap-1.5" onClick={() => setView("evaluation")}>
          <ClipboardCheck className="h-4 w-4" />평가·인상 심사
        </Button>
        <Button size="sm" variant={view === "settlement" ? "default" : "ghost"} className="gap-1.5" onClick={() => setView("settlement")}>
          <WalletCards className="h-4 w-4" />월 급여 정산
        </Button>
      </div>
      {view === "evaluation" ? <TeacherCompensationEvaluation /> : <AdminTeacherSalaryOverview />}
    </div>
  );
}
