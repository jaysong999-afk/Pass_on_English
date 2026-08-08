import { NextResponse } from "next/server";
import { adjustEnrollmentSessions } from "@/lib/enrollment-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    sessionsRemaining?: number;
    sessionsTotal?: number;
    deltaRemaining?: number;
    deltaTotal?: number;
    reason?: string;
    adminName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updated = adjustEnrollmentSessions(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  return NextResponse.json({ enrollment: updated });
}
