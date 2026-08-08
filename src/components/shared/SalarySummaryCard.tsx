import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { SalarySummary } from "@/types";

interface SalarySummaryCardProps {
  summary: SalarySummary;
}

export function SalarySummaryCard({ summary }: SalarySummaryCardProps) {
  const total =
    summary.baseSalary +
    summary.monthlyBonus +
    summary.quarterlyBonus +
    summary.manualBonus;

  const rows = [
    { label: "Base Salary", value: summary.baseSalary, sub: `${summary.totalHours}h × ₱${summary.hourlyRate}` },
    { label: "Perfect Attendance Bonus", value: summary.monthlyBonus },
    { label: "Quarterly Bonus", value: summary.quarterlyBonus },
    { label: "Other Bonuses", value: summary.manualBonus },
  ];

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-800">
          <Wallet className="h-5 w-5" />
          Estimated Monthly Salary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-emerald-700">{formatCurrency(total, "PHP")}</p>
        <p className="mt-1 text-sm text-gray-500">July 2026 · Live estimate</p>
        <div className="mt-6 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-700">{row.label}</p>
                {row.sub && <p className="text-xs text-gray-400">{row.sub}</p>}
              </div>
              <p className="font-semibold">{formatCurrency(row.value, "PHP")}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
