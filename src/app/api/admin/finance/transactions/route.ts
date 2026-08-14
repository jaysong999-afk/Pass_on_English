import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAllFinanceTransactionsFromCache } from "@/lib/finance/repository";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const transactions = getAllFinanceTransactionsFromCache();
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("[admin/finance/transactions GET]", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
