import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { isUuid } from "@/lib/teachers/resolve-teacher-id";
import { isTransferInput } from "@/lib/admin/enrollment-transfer";
import { listTransferEnrollments, transferEnrollments } from "@/lib/admin/enrollment-transfer-repository";

const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});
export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;
  const params = new URL(request.url).searchParams;
  const fromTeacherId = params.get("fromTeacherId") ?? "";
  if (!isUuid(fromTeacherId)) return json({ error: "from_teacher_required" }, 400);
  try {
    if (params.has("enrollmentId") || params.has("toTeacherId")) {
      const input = { fromTeacherId, transfers: [{ enrollmentId: params.get("enrollmentId"), toTeacherId: params.get("toTeacherId") }] };
      if (!isTransferInput(input)) return json({ error: "invalid_body" }, 400);
      const result = await transferEnrollments(input);
      return json({ slots: result.slotsByEnrollment[input.transfers[0].enrollmentId] });
    }
    return json({ enrollments: await listTransferEnrollments(fromTeacherId) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "이관 목록 조회 실패" }, 503);
  }
}
export async function POST(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (!isTransferInput(body)) return json({ error: "invalid_body" }, 400);
  try {
    const result = await transferEnrollments(body, body.action !== "preview");
    if (body.action !== "preview" && !result.ok) {
      return json({ ...result, error: "이관할 수 없는 수업이 있습니다. 아래 사유를 확인해 주세요. 변경된 수업은 없습니다." }, 409);
    }
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "일괄 이관 실패" }, 503);
  }
}
