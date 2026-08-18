import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const financeRepository = read("src/lib/finance/repository.ts");
const financeDashboard = read("src/components/admin/finance/FinanceDashboard.tsx");
const adminSender = read("src/lib/admin/resolve-admin-sender.ts");
const teacherResolver = read("src/lib/teachers/resolve-teacher-id.ts");
const broadcastPanel = read("src/components/admin/messages/BroadcastPanel.tsx");

const warmFinanceStart = financeRepository.indexOf("export async function warmFinanceCache");
const warmFinanceEnd = financeRepository.indexOf(
  "export function getPayrollFinanceTransactionsFromCache",
  warmFinanceStart
);
const warmFinance = financeRepository.slice(warmFinanceStart, warmFinanceEnd);

if (warmFinance.includes("ensureDefaultFinanceSeedInDb")) {
  throw new Error("finance cache warm-up still writes demo seed rows");
}
if (
  financeDashboard.includes("SEED_MANUAL_TRANSACTIONS") ||
  financeDashboard.includes("buildAutoTransactions")
) {
  throw new Error("finance dashboard still substitutes demo transactions");
}
if (adminSender.includes("DEMO_ADMIN_SENDER_ID")) {
  throw new Error("admin sender resolution still falls back to a demo UUID");
}
if (teacherResolver.includes("getAllTeachersFromCache()[0]")) {
  throw new Error("unknown teacher IDs still fall back to the first cached teacher");
}
if (broadcastPanel.includes("messages-mock-data")) {
  throw new Error("broadcast UI still imports through a mock-data module");
}
for (const path of ["src/lib/mock-data.ts", "src/lib/admin/messages-mock-data.ts"]) {
  if (existsSync(resolve(root, path))) {
    throw new Error(`${path} remains in the runtime source tree`);
  }
}

console.log("PASS finance reads never seed or substitute demo transactions");
console.log("PASS admin and teacher identity resolution never guesses demo identities");
console.log("PASS unreferenced mock modules are outside the runtime source tree");
