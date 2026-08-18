import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  confirmSalaryStatementInDb,
  completeSalaryStatementInDb,
  getSalaryStatementInDb,
  markSalaryPhpPaidInDb,
  markSalaryProcessingInDb,
  updateSalaryStatementStatusInDb,
  warmSalaryCache,
} from "@/lib/teacher-salary/repository";
import {
  getVerificationLessons,
  previewBulkHourlyRateUpdate,
} from "@/lib/teacher-salary-store-sync";
import { getAdjustmentsForTeacherMonth } from "@/lib/teacher-salary-adjustment-store-sync";
import { addSalaryAdjustmentInDb } from "@/lib/teacher-salary-adjustment-repository";
import { getSalaryBonusPolicy } from "@/lib/teacher-salary-policy-store-sync";
import { updateSalaryBonusPolicyInDb } from "@/lib/teacher-salary-policy-repository";
import {
  currentSalaryMonth,
  finalizeAllEstimatesForMonth,
  getAdminSalaryOverview,
  getAvailableSalaryMonths,
} from "@/lib/admin/teacher-salary-overview-store";
import {
  buildSalaryOverviewCsvRows,
  salaryCsvFilename,
} from "@/lib/teacher-salary-csv";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  try {
    await warmSalaryCache();
  } catch (error) {
    console.error("[admin/teacher-salary GET] warm cache", error);
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? currentSalaryMonth();
  const teacherId = searchParams.get("teacherId");
  const format = searchParams.get("format");

  if (format === "csv") {
    const overview = getAdminSalaryOverview(month);
    const csv = "\uFEFF" + buildSalaryOverviewCsvRows(month, overview.rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${salaryCsvFilename(month)}"`,
      },
    });
  }

  if (teacherId) {
    const statement = await getSalaryStatementInDb(teacherId, month);
    const verificationLessons = getVerificationLessons(teacherId, month);
    const adjustments = getAdjustmentsForTeacherMonth(teacherId, month);
    return NextResponse.json({
      statement: statement ?? null,
      verificationLessons,
      adjustments,
    });
  }

  const overview = getAdminSalaryOverview(month);
  return NextResponse.json({
    ...overview,
    availableMonths: getAvailableSalaryMonths(),
    bonusPolicy: getSalaryBonusPolicy(),
  });
}

export async function PATCH(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    await warmSalaryCache();

    const body = await request.json();
    const action = body.action as string;

    if (action === "update_status") {
      const { id, status, paymentDate } = body;
      if (!id || !status) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      if (!["confirmed", "processing", "paid", "completed"].includes(status)) {
        return NextResponse.json({ error: "invalid_status" }, { status: 400 });
      }
      const statement = await updateSalaryStatementStatusInDb(id, status, { paymentDate });
      if (!statement) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ statement });
    }

    if (action === "confirm" || action === "finalize") {
      const { teacherId, month } = body;
      if (!teacherId || !month) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const adminName = guard.profile.fullName?.trim() || guard.email;
      const statement = await confirmSalaryStatementInDb(teacherId, month, adminName);
      if (!statement) {
        return NextResponse.json({ error: "month_not_ended_or_not_found" }, { status: 400 });
      }
      return NextResponse.json({ statement });
    }

    if (action === "finalize_all") {
      const { month } = body;
      if (!month) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const statements = await finalizeAllEstimatesForMonth(month);
      return NextResponse.json({ statements, count: statements.length });
    }

    if (action === "mark_processing") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      const statement = await markSalaryProcessingInDb(id);
      if (!statement) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ statement });
    }

    if (action === "mark_php_paid") {
      const { id, phpPaidAt } = body;
      if (!id) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      const statement = await markSalaryPhpPaidInDb(id, phpPaidAt);
      if (!statement) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ statement });
    }

    if (action === "complete") {
      const { id, krwTransferAmount } = body;
      if (!id || !krwTransferAmount) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const statement = await completeSalaryStatementInDb(id, Number(krwTransferAmount));
      if (!statement) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      }
      return NextResponse.json({ statement });
    }

    if (action === "add_adjustment") {
      const { teacherId, month, type, amountPhp, reason } = body;
      if (!teacherId || !month || !type || !amountPhp || !reason) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const adjustment = await addSalaryAdjustmentInDb({
        teacherId,
        month,
        type,
        amountPhp: Number(amountPhp),
        reason,
        createdBy: body.createdBy,
      });
      return NextResponse.json({ adjustment });
    }

    if (action === "update_bonus_policy") {
      const policy = await updateSalaryBonusPolicyInDb(body.policy ?? body);
      return NextResponse.json({ policy });
    }

    if (action === "update_hourly_rate") {
      const { teacherId, hourlyRatePhp } = body;
      if (!teacherId || hourlyRatePhp == null) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const { updateTeacherHourlyRatePhpInDb } = await import("@/lib/teachers/repository");
      const teacher = await updateTeacherHourlyRatePhpInDb(teacherId, Number(hourlyRatePhp));
      if (!teacher) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ teacher });
    }

    if (action === "preview_bulk_hourly_rate") {
      const { hourlyRatePhp, teacherIds } = body;
      if (hourlyRatePhp == null) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      return NextResponse.json(
        previewBulkHourlyRateUpdate(Number(hourlyRatePhp), teacherIds)
      );
    }

    if (action === "bulk_update_hourly_rate") {
      const { hourlyRatePhp, teacherIds, force } = body;
      if (hourlyRatePhp == null) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const preview = previewBulkHourlyRateUpdate(Number(hourlyRatePhp), teacherIds);
      if (preview.hasDifferingRates && !force) {
        return NextResponse.json({ error: "differing_rates", preview }, { status: 409 });
      }
      const { updateTeacherHourlyRatePhpInDb } = await import("@/lib/teachers/repository");
      await Promise.all(
        preview.targetIds.map((teacherId) =>
          updateTeacherHourlyRatePhpInDb(teacherId, Number(hourlyRatePhp))
        )
      );
      return NextResponse.json({ ok: true, preview });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
