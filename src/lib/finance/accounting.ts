import type {
  ExchangeRates,
  FinanceTransaction,
  MonthlyPlSummary,
  TaxTreatment,
  TransactionCategory,
} from "@/types";
import { getActivePricingPlans } from "@/lib/pricing-plan-store";
import { getPayrollFinanceTransactions } from "@/lib/finance/payroll-finance-store";
import { students } from "@/lib/mock-data";

/** Fallback when live rate API unavailable */
export const FALLBACK_RATES: ExchangeRates = {
  cnyToKrw: 190.2,
  phpToKrw: 23.8,
  updatedAt: new Date().toISOString(),
};

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  student_payment_kr: "한국 학생 수강료",
  student_payment_cn: "중국 학생 수강료",
  teacher_payroll: "선생님 인건비",
  server_infra: "서버·인프라",
  manual_income: "수기 수익",
  manual_expense: "수기 비용",
  other: "기타",
};

export const TAX_LABELS: Record<TaxTreatment, string> = {
  taxable: "과세 (10%)",
  zero_rated: "영세율",
  exempt: "면세",
  non_taxable: "비과세 (국외)",
};

export function convertToKrw(amount: number, currency: "KRW" | "CNY" | "PHP", rates: ExchangeRates) {
  if (currency === "KRW") return Math.round(amount);
  if (currency === "CNY") return Math.round(amount * rates.cnyToKrw);
  return Math.round(amount * rates.phpToKrw);
}

/** KR tuition: tax-inclusive → split supply / VAT */
export function splitTaxInclusive(totalKrw: number) {
  const supply = Math.round(totalKrw / 1.1);
  const vat = totalKrw - supply;
  return { supply, vat };
}

export function calcVatFromSupply(supply: number) {
  return Math.round(supply * 0.1);
}

function planAmountForStudent(country: "KR" | "CN" | "OTHER", planIndex = 0) {
  const plans = getActivePricingPlans();
  const plan = plans[planIndex] ?? plans[0];
  if (!plan) return 0;
  return country === "CN" ? plan.priceCny : plan.priceKrw;
}

/** Auto-generate transactions from students (revenue) and teachers (last month payroll) */
export function buildAutoTransactions(rates: ExchangeRates): FinanceTransaction[] {
  const txs: FinanceTransaction[] = [];
  const now = new Date();

  students
    .filter((s) => s.paymentStatus === "confirmed" || s.paymentStatus === "reported")
    .forEach((s, i) => {
      const isKr = s.country !== "CN";
      const amount = planAmountForStudent(s.country, i);
      const currency = isKr ? "KRW" : "CNY";
      const amountKrw = convertToKrw(amount, currency as "KRW" | "CNY", rates);
      const taxTreatment: TaxTreatment = isKr ? "taxable" : "non_taxable";
      const { supply, vat } = isKr
        ? splitTaxInclusive(amount)
        : { supply: amount, vat: 0 };

      txs.push({
        id: `auto-rev-${s.id}`,
        date: new Date(now.getFullYear(), now.getMonth(), 5 + i).toISOString().slice(0, 10),
        type: "income",
        category: isKr ? "student_payment_kr" : "student_payment_cn",
        description: `${s.fullName} — ${s.planLabel ?? "수강료"}`,
        currency: currency as "KRW" | "CNY",
        amount,
        amountKrw,
        supplyAmount: isKr ? supply : amount,
        vatAmount: vat,
        taxTreatment,
        source: "auto",
        studentName: s.fullName,
      });
    });

  const payrollTxs = getPayrollFinanceTransactions();
  txs.push(...payrollTxs);

  txs.push({
    id: "auto-server-1",
    date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    type: "expense",
    category: "server_infra",
    description: "Tencent Cloud HK — 월 서버·DB 비용",
    currency: "KRW",
    amount: 450000,
    amountKrw: 450000,
    supplyAmount: 409091,
    vatAmount: 40909,
    taxTreatment: "taxable",
    source: "auto",
  });

  return txs.sort((a, b) => b.date.localeCompare(a.date));
}

export const SEED_MANUAL_TRANSACTIONS: FinanceTransaction[] = [
  {
    id: "manual-1",
    date: "2026-07-12",
    type: "expense",
    category: "other",
    description: "마케팅 제작비",
    currency: "KRW",
    amount: 220000,
    amountKrw: 220000,
    supplyAmount: 200000,
    vatAmount: 20000,
    taxTreatment: "taxable",
    source: "manual",
  },
];

export function computeMonthlySummary(
  transactions: FinanceTransaction[],
  monthKey: string,
  _rates: ExchangeRates
): MonthlyPlSummary {
  const inMonth = transactions.filter((t) => t.date.startsWith(monthKey));

  const income = inMonth.filter((t) => t.type === "income");
  const expense = inMonth.filter((t) => t.type === "expense");

  const totalRevenueKrw = income.reduce((s, t) => s + t.amountKrw, 0);
  const totalExpenseKrw = expense.reduce((s, t) => s + t.amountKrw, 0);

  const outputVat = income
    .filter((t) => t.taxTreatment === "taxable")
    .reduce((s, t) => s + t.vatAmount, 0);

  const inputVat = expense
    .filter((t) => t.taxTreatment === "taxable")
    .reduce((s, t) => s + t.vatAmount, 0);

  const revenueCnyThisMonth = income
    .filter((t) => t.currency === "CNY")
    .reduce((s, t) => s + t.amount, 0);

  const revenueKrTaxableKrw = income
    .filter((t) => t.category === "student_payment_kr")
    .reduce((s, t) => s + t.amountKrw, 0);

  const revenueCnExemptKrw = income
    .filter((t) => t.category === "student_payment_cn")
    .reduce((s, t) => s + t.amountKrw, 0);

  const revenueOtherKrw = income
    .filter(
      (t) => t.category !== "student_payment_kr" && t.category !== "student_payment_cn"
    )
    .reduce((s, t) => s + t.amountKrw, 0);

  const expensePayrollKrw = expense
    .filter((t) => t.category === "teacher_payroll")
    .reduce((s, t) => s + t.amountKrw, 0);

  const expenseOtherKrw = expense
    .filter((t) => t.category !== "teacher_payroll")
    .reduce((s, t) => s + t.amountKrw, 0);

  return {
    totalRevenueKrw,
    totalExpenseKrw,
    netProfitKrw: totalRevenueKrw - totalExpenseKrw,
    outputVat,
    inputVat,
    estimatedVatPayable: Math.max(0, outputVat - inputVat),
    revenueCnyThisMonth,
    revenueKrTaxableKrw,
    revenueCnExemptKrw,
    revenueOtherKrw,
    expensePayrollKrw,
    expenseOtherKrw,
  };
}

export function getFinanceMonthOptions(transactions: FinanceTransaction[]): string[] {
  const months = new Set<string>();
  for (const t of transactions) {
    months.add(t.date.slice(0, 7));
  }
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function formatFinanceMonth(monthKey: string): string {
  const [year, m] = monthKey.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("ko-KR", { month: "long", year: "numeric" }).format(date);
}

export function buildTrendData(transactions: FinanceTransaction[], months = 6) {
  const result: { month: string; revenue: number; expense: number; profit: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const summary = computeMonthlySummary(transactions, key, FALLBACK_RATES);
    result.push({
      month: `${d.getMonth() + 1}월`,
      revenue: Math.round(summary.totalRevenueKrw / 10000),
      expense: Math.round(summary.totalExpenseKrw / 10000),
      profit: Math.round(summary.netProfitKrw / 10000),
    });
  }
  return result;
}

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=CNY&to=KRW", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("rate fetch failed");
    const data = await res.json();
    const cnyToKrw = data.rates?.KRW ?? FALLBACK_RATES.cnyToKrw;
    return {
      cnyToKrw,
      phpToKrw: FALLBACK_RATES.phpToKrw,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return { ...FALLBACK_RATES, updatedAt: new Date().toISOString() };
  }
}

export function exportTransactionsCsv(transactions: FinanceTransaction[]) {
  const headers = [
    "날짜",
    "유형",
    "카테고리",
    "설명",
    "통화",
    "금액",
    "원화환산",
    "공급가액",
    "부가세",
    "세무구분",
    "출처",
  ];

  const rows = transactions.map((t) => [
    t.date,
    t.type === "income" ? "수입" : "지출",
    CATEGORY_LABELS[t.category],
    t.description,
    t.currency,
    t.amount,
    t.amountKrw,
    t.supplyAmount,
    t.vatAmount,
    TAX_LABELS[t.taxTreatment],
    t.source === "auto" ? "자동" : "수기",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pass-on-english-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
