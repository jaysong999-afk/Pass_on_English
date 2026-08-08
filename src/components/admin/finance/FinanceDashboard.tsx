"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  Receipt,
  Globe,
  ChevronDown,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ManualTransactionModal } from "@/components/admin/finance/ManualTransactionModal";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import {
  buildAutoTransactions,
  buildTrendData,
  CATEGORY_LABELS,
  computeMonthlySummary,
  exportTransactionsCsv,
  FALLBACK_RATES,
  formatFinanceMonth,
  getFinanceMonthOptions,
  SEED_MANUAL_TRANSACTIONS,
  TAX_LABELS,
} from "@/lib/finance/accounting";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ExchangeRates, FinanceTransaction, TransactionType } from "@/types";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function loadRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=CNY&to=KRW");
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    return {
      cnyToKrw: data.rates?.KRW ?? FALLBACK_RATES.cnyToKrw,
      phpToKrw: FALLBACK_RATES.phpToKrw,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return { ...FALLBACK_RATES, updatedAt: new Date().toISOString() };
  }
}

function monthDateRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function FinanceDashboard() {
  const { plans: activePlans } = usePricingPlans(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => monthDateRange(currentMonthKey()).from);
  const [dateTo, setDateTo] = useState(() => monthDateRange(currentMonthKey()).to);

  const refreshRates = useCallback(async () => {
    setRatesLoading(true);
    const r = await loadRates();
    setRates(r);
    setRatesLoading(false);
  }, []);

  useEffect(() => {
    refreshRates();
  }, [refreshRates]);

  useEffect(() => {
    const auto = buildAutoTransactions(rates, activePlans);
    setTransactions([...auto, ...SEED_MANUAL_TRANSACTIONS]);
  }, [rates, activePlans]);

  const availableMonths = useMemo(
    () => getFinanceMonthOptions(transactions),
    [transactions]
  );

  const summary = useMemo(
    () => computeMonthlySummary(transactions, selectedMonth, rates),
    [transactions, selectedMonth, rates]
  );

  const trendData = useMemo(() => buildTrendData(transactions), [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          CATEGORY_LABELS[t.category].includes(search) ||
          (t.studentName?.includes(search) ?? false) ||
          (t.teacherName?.includes(search) ?? false)
        );
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, dateFrom, dateTo, search]);

  function handleManualAdd(tx: FinanceTransaction) {
    setTransactions((prev) => [tx, ...prev]);
  }

  const categories = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];

  return (
    <div className="space-y-6">
      {/* Exchange rate bar */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">환율 (자동 갱신)</p>
              <p className="text-xs text-blue-700 mt-0.5">
                1 CNY = <strong>{rates.cnyToKrw.toFixed(2)}</strong> KRW · 1 PHP ={" "}
                <strong>{rates.phpToKrw.toFixed(2)}</strong> KRW (관리자 설정)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <span>
              갱신: {new Date(rates.updatedAt).toLocaleString("ko-KR")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-blue-700"
              onClick={refreshRates}
              disabled={ratesLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${ratesLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Unified P&L summary */}
      <Card className="overflow-hidden border-gray-200">
        <CardHeader className="border-b bg-gray-50/80 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>월별 손익</CardTitle>
              <CardDescription>원화(KRW) 환산 기준 · 모든 금액은 선택 월 거래일 집계</CardDescription>
            </div>
            <div className="relative w-full sm:w-auto">
              <select
                className="h-10 w-full appearance-none rounded-xl border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm font-medium sm:min-w-[160px]"
                value={selectedMonth}
                onChange={(e) => {
                  const month = e.target.value;
                  setSelectedMonth(month);
                  const range = monthDateRange(month);
                  setDateFrom(range.from);
                  setDateTo(range.to);
                }}
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatFinanceMonth(m)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid lg:grid-cols-2 lg:divide-x">
            {/* Revenue column */}
            <div className="p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  총 매출
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">
                  {formatCurrency(summary.totalRevenueKrw, "KRW")}
                </p>
              </div>
              <div className="space-y-3">
                <BreakdownRow
                  label="한국 학생 수강료"
                  amount={summary.revenueKrTaxableKrw}
                  tone="income"
                  hint="과세 · 부가세 10%"
                />
                <BreakdownRow
                  label="중국 학생 수강료"
                  amount={summary.revenueCnExemptKrw}
                  tone="income"
                  hint={
                    summary.revenueCnyThisMonth > 0
                      ? `¥${summary.revenueCnyThisMonth.toLocaleString()} · 비과세(국외)`
                      : "비과세(국외)"
                  }
                />
                <BreakdownRow
                  label="기타 수입"
                  amount={summary.revenueOtherKrw}
                  tone="income"
                  hint="수기 등록 수익 등"
                />
              </div>
            </div>

            {/* Expense column */}
            <div className="border-t p-6 lg:border-t-0">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  총 비용
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-red-700">
                  {formatCurrency(summary.totalExpenseKrw, "KRW")}
                </p>
              </div>
              <div className="space-y-3">
                <BreakdownRow
                  label="선생님 인건비"
                  amount={summary.expensePayrollKrw}
                  tone="expense"
                  hint="급여 종결 시 반영 · 영세율"
                />
                <BreakdownRow
                  label="기타 비용"
                  amount={summary.expenseOtherKrw}
                  tone="expense"
                  hint="서버·인프라, 마케팅, 수기 비용 등"
                />
              </div>
            </div>
          </div>

          {/* Bottom strip: profit + VAT */}
          <div className="grid border-t bg-gray-50/50 sm:grid-cols-2 sm:divide-x">
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                <Wallet className="h-5 w-5 text-violet-700" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">순이익</p>
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    summary.netProfitKrw >= 0 ? "text-violet-700" : "text-red-600"
                  )}
                >
                  {formatCurrency(summary.netProfitKrw, "KRW")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 border-t px-6 py-4 sm:border-t-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <Receipt className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">예상 부가세 (납부)</p>
                <p className="text-xl font-bold tabular-nums text-amber-700">
                  {formatCurrency(summary.estimatedVatPayable, "KRW")}
                </p>
                <p className="text-[11px] text-gray-500">
                  매출세액 {formatCurrency(summary.outputVat, "KRW")} − 매입세액{" "}
                  {formatCurrency(summary.inputVat, "KRW")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend chart — KRW unified */}
      <Card>
        <CardHeader>
          <CardTitle>월별 손익 추이 (원화 통합, 만원)</CardTitle>
          <CardDescription>매출 · 비용 · 순이익을 원화 기준으로 표시</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `${v}만원`} />
                <Legend />
                <Bar dataKey="revenue" name="매출" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="비용" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="순이익" stroke="#7c3aed" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* VAT legend */}
      <div className="rounded-xl border bg-gray-50 px-4 py-3 text-xs text-gray-600 leading-relaxed">
        <strong className="text-gray-800">부가세 집계 기준:</strong> 한국 학생 수강료 = 과세(10%) ·
        중국 학생 수강료 = 비과세(국외 용역) · 필리핀 선생님 인건비 = 영세율 · 국내 서버/마케팅
        등 = 과세(10%). 모든 합계·그래프는 원화(KRW) 환산 기준입니다.
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>거래 내역</CardTitle>
            <CardDescription>자동(수강료·인건비) + 수기 등록 내역</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => exportTransactionsCsv(filtered)}>
              <ArrowDownToLine className="h-4 w-4" />
              엑셀(CSV) 다운로드
            </Button>
            <Button className="gap-2 bg-violet-600 hover:bg-violet-700" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              수기 거래 등록
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="검색 (설명, 학생, 선생님...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-11 rounded-xl border px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | TransactionType)}
            >
              <option value="all">유형: 전체</option>
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
            <select
              className="h-11 rounded-xl border px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">카테고리: 전체</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">원화환산</TableHead>
                  <TableHead>세무</TableHead>
                  <TableHead>출처</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-gray-400">
                      조건에 맞는 거래가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-sm">{t.date}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "income" ? "success" : "destructive"}>
                          {t.type === "income" ? "수입" : "지출"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{CATEGORY_LABELS[t.category]}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{t.description}</TableCell>
                      <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                        {formatCurrency(t.amount, t.currency)}
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {formatCurrency(t.amountKrw, "KRW")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {TAX_LABELS[t.taxTreatment]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.source === "auto" ? "secondary" : "default"}>
                          {t.source === "auto" ? "자동" : "수기"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-gray-500">{filtered.length}건 표시 (전체 {transactions.length}건)</p>
        </CardContent>
      </Card>

      <ManualTransactionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        rates={rates}
        onSubmit={handleManualAdd}
      />
    </div>
  );
}

function BreakdownRow({
  label,
  amount,
  tone,
  hint,
}: {
  label: string;
  amount: number;
  tone: "income" | "expense";
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
      </div>
      <p
        className={cn(
          "shrink-0 text-sm font-bold tabular-nums",
          tone === "income" ? "text-emerald-700" : "text-red-700"
        )}
      >
        {formatCurrency(amount, "KRW")}
      </p>
    </div>
  );
}
