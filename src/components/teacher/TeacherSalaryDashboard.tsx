"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Info, Landmark, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  SalaryStatusBadge,
  formatSalaryMonth,
} from "@/components/shared/SalaryStatusBadge";
import { statementTotal } from "@/lib/teacher-salary-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TeacherSalaryStatement } from "@/types";

interface BonusPolicy {
  perfectAttendance: string;
  quarterly: string;
}

export function TeacherSalaryDashboard() {
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [statement, setStatement] = useState<TeacherSalaryStatement | null>(null);
  const [bonusPolicy, setBonusPolicy] = useState<BonusPolicy | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/salary?month=${month}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatement(data.statement);
      setBonusPolicy(data.bonusPolicy);
      setAvailableMonths(data.availableMonths ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(`/api/teacher/salary`)
      .then((r) => r.json())
      .then((data) => {
        const months: string[] = data.availableMonths ?? [];
        setAvailableMonths(months);
        const initial = months[0] ?? "";
        setSelectedMonth(initial);
        if (initial) load(initial);
      });
  }, [load]);

  useEffect(() => {
    if (selectedMonth) load(selectedMonth);
  }, [selectedMonth, load]);

  const total = useMemo(
    () => (statement ? statementTotal(statement) : 0),
    [statement]
  );

  if (loading && !statement) {
    return <p className="py-12 text-center text-sm text-gray-500">Loading salary…</p>;
  }

  if (!statement) {
    return <p className="py-12 text-center text-sm text-gray-500">No salary data available.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">Salary</h2>
        <p className="text-sm text-gray-500">Monthly payroll statements & live estimates</p>
      </div>

      {/* Zone 1: Summary + Bonus Policy (merged) */}
      <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Label htmlFor="salary-month" className="text-xs text-gray-500">
                Month
              </Label>
              <select
                id="salary-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatSalaryMonth(m)}
                    {m === availableMonths[0] ? " · Live" : ""}
                  </option>
                ))}
              </select>
            </div>
            <SalaryStatusBadge status={statement.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {statement.isLiveEstimate ? "Estimated Total" : "Total Payout"}
            </p>
            <p className="text-3xl font-bold tabular-nums text-emerald-700">
              {formatCurrency(total, "PHP")}
            </p>
            {statement.isLiveEstimate && (
              <p className="mt-1 text-xs text-emerald-600">Live estimate · subject to change</p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Completed Classes </span>
              <span className="font-semibold tabular-nums">{statement.completedClasses}</span>
            </div>
            <div>
              <span className="text-gray-500">Total Hours </span>
              <span className="font-semibold tabular-nums">{statement.totalHours} hrs</span>
            </div>
          </div>

          {bonusPolicy && (
            <div className="rounded-xl border border-emerald-100 bg-white/70 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                <Info className="h-3.5 w-3.5" />
                Bonus Policy
              </p>
              <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
                <li>• {bonusPolicy.perfectAttendance}</li>
                <li>• {bonusPolicy.quarterly}</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zone 2: Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Salary Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4 text-sm">
          <BreakdownRow
            label="Base Salary (completed classes)"
            sub={`${statement.totalHours}h × ₱${statement.hourlyRate}`}
            value={statement.baseSalary}
          />
          <BreakdownRow
            label="Perfect Attendance Bonus"
            value={statement.perfectAttendanceBonus}
          />
          <BreakdownRow label="Quarterly Bonus" value={statement.quarterlyBonus} />
          <BreakdownRow label="Other Incentives" value={statement.otherIncentives} />
          <div className="my-2 border-t border-dashed" />
          <BreakdownRow
            label="Deductions (no-show / late)"
            value={-statement.deductions}
            negative
          />
          <div className="mt-3 flex items-center justify-between border-t pt-3 font-bold">
            <span>Net Total</span>
            <span className="tabular-nums text-emerald-700">{formatCurrency(total, "PHP")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Zone 3: Payout */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-5 w-5 text-emerald-600" />
            Payout Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4 text-sm">
          <div className="rounded-xl border bg-gray-50/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Payout Account
            </p>
            <p className="mt-1 font-semibold text-ink">{statement.payoutAccount.label}</p>
            <p className="font-mono text-gray-700">{statement.payoutAccount.accountNumber}</p>
            {statement.payoutAccount.accountName && (
              <p className="mt-1 text-gray-500">{statement.payoutAccount.accountName}</p>
            )}
            <p className="mt-2 text-xs capitalize text-gray-400">
              Type: {statement.payoutAccount.type}
            </p>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
            <span>
              Payment Date:{" "}
              <span className="font-medium text-ink">
                {statement.paymentDate
                  ? formatDate(statement.paymentDate, "en")
                  : statement.status === "estimated"
                    ? "TBD (end of month)"
                    : "Pending schedule"}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownRow({
  label,
  sub,
  value,
  negative,
}: {
  label: string;
  sub?: string;
  value: number;
  negative?: boolean;
}) {
  const display = negative && value === 0 ? formatCurrency(0, "PHP") : formatCurrency(Math.abs(value), "PHP");
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <p className={`shrink-0 font-semibold tabular-nums ${negative && value > 0 ? "text-red-600" : ""}`}>
        {negative && value > 0 ? "−" : ""}
        {display}
      </p>
    </div>
  );
}
