import { after, NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  finalizeEnrollmentRefundInDb,
  sendEnrollmentRefundPush,
} from "@/lib/refunds/repository";

interface RefundRequestBody {
  expectedCountedSessions?: unknown;
  expectedCalculatedAmount?: unknown;
  actualRefundAmount?: unknown;
  refundReason?: unknown;
  adjustmentReason?: unknown;
  adminNote?: unknown;
  paidSessionsTotalOverride?: unknown;
  refundCompleted?: unknown;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function errorStatus(message: string): number {
  if (message.includes("enrollment_not_found")) return 404;
  if (message.includes("forbidden")) return 403;
  if (
    message.includes("unresolved_past_lessons") ||
    message.includes("refund_preview_changed_retry") ||
    message.includes("refund_already_finalized") ||
    message.includes("paid_sessions_total_immutable")
  ) return 409;
  return 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    const { id } = await params;
    const body = await request.json() as RefundRequestBody;
    const expectedCountedSessions = finiteNumber(body.expectedCountedSessions);
    const expectedCalculatedAmount = finiteNumber(body.expectedCalculatedAmount);
    const actualRefundAmount = finiteNumber(body.actualRefundAmount);
    const paidSessionsTotalOverride = body.paidSessionsTotalOverride == null
      ? undefined
      : finiteNumber(body.paidSessionsTotalOverride);

    if (
      !Number.isInteger(expectedCountedSessions) || expectedCountedSessions! < 0 ||
      expectedCalculatedAmount == null || expectedCalculatedAmount < 0 ||
      actualRefundAmount == null || actualRefundAmount < 0 ||
      typeof body.refundReason !== "string" || !body.refundReason.trim() ||
      body.refundCompleted !== true ||
      (paidSessionsTotalOverride !== undefined &&
        (!Number.isInteger(paidSessionsTotalOverride) || paidSessionsTotalOverride! <= 0))
    ) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const result = await finalizeEnrollmentRefundInDb({
      enrollmentId: id,
      expectedCountedSessions: expectedCountedSessions!,
      expectedCalculatedAmount,
      actualRefundAmount,
      refundReason: body.refundReason,
      adjustmentReason: typeof body.adjustmentReason === "string" ? body.adjustmentReason : undefined,
      adminNote: typeof body.adminNote === "string" ? body.adminNote : undefined,
      paidSessionsTotalOverride: paidSessionsTotalOverride ?? undefined,
      refundCompleted: true,
    });

    after(async () => {
      try {
        await sendEnrollmentRefundPush(result);
      } catch (error) {
        console.error("[refund push] delivery failed", error instanceof Error ? error.message : error);
      }
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refund_finalize_failed";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
