import { NextResponse } from "next/server";
import {
  bulkTransferEnrollmentsFromTeacher,
  getBulkEnrollmentTransferPreview,
  previewEnrollmentTransferSlots,
} from "@/lib/admin/lesson-operations-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const fromTeacherId = searchParams.get("fromTeacherId");
  if (!fromTeacherId) {
    return NextResponse.json({ error: "from_teacher_required" }, { status: 400 });
  }

  const enrollmentId = searchParams.get("enrollmentId");
  const toTeacherId = searchParams.get("toTeacherId");
  if (enrollmentId && toTeacherId) {
    const slots = previewEnrollmentTransferSlots(
      enrollmentId,
      fromTeacherId,
      toTeacherId
    );
    return NextResponse.json({ slots });
  }

  return NextResponse.json({
    enrollments: getBulkEnrollmentTransferPreview(fromTeacherId),
  });
}

export async function POST(request: Request) {
  let body: {
    fromTeacherId: string;
    transfers: { enrollmentId: string; toTeacherId: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.fromTeacherId || !body.transfers?.length) {
    return NextResponse.json({ error: "transfers_required" }, { status: 400 });
  }

  try {
    const result = bulkTransferEnrollmentsFromTeacher(body);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "bulk_transfer_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
