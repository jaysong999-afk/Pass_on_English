import type { FinanceTransaction } from "@/types";

let transactions: FinanceTransaction[] = [];

export function getFinanceTransactionCache(): FinanceTransaction[] {
  return transactions;
}

export function setFinanceTransactionCache(next: FinanceTransaction[]) {
  transactions = next.map((t) => ({ ...t }));
}

export function upsertFinanceTransactionInCache(tx: FinanceTransaction) {
  const idx = transactions.findIndex((t) => t.id === tx.id);
  if (idx >= 0) {
    transactions[idx] = { ...tx };
  } else {
    transactions.unshift({ ...tx });
  }
}

export function clearFinanceTransactionCache() {
  transactions = [];
}
