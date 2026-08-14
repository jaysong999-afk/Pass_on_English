import type { FinanceTransaction } from "@/types";
import { clearFinanceTransactionCache, getFinanceTransactionCache } from "@/lib/finance/finance-cache";

export function getPayrollFinanceTransactions(): FinanceTransaction[] {
  return getFinanceTransactionCache()
    .filter((t) => t.category === "teacher_payroll")
    .map((t) => ({ ...t }));
}

export function getAllFinanceTransactions(): FinanceTransaction[] {
  return getFinanceTransactionCache().map((t) => ({ ...t }));
}

/** @internal */
export function resetPayrollFinanceStore() {
  clearFinanceTransactionCache();
}
