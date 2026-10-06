import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getEnrollmentRefundPreviewInDb } from "@/lib/refunds/repository";

function errorStatus(message: string): number {
  if (message.includes("enrollment_not_found")) return 404;
  if (message.includes("forbidden")) return 403;
  return 400;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    const { id } = await params;
    const preview = await getEnrollmentRefundPreviewInDb(id);
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refund_preview_failed";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
