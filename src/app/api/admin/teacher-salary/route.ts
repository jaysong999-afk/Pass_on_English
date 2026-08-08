import { NextResponse } from "next/server";
import {
  confirmSalaryStatement,
  completeSalaryStatement,
  getSalaryStatement,
  getVerificationLessons,
  markSalaryPhpPaid,
  markSalaryProcessing,
  previewBulkHourlyRateUpdate,
  applyBulkHourlyRateUpdate,
  updateTeacherHourlyRate,
  updateSalaryStatementStatus,
} from "@/lib/teacher-salary-store";
import { getAdjustmentsForTeacherMonth, addSalaryAdjustment } from "@/lib/teacher-salary-adjustment-store";
import {
  getSalaryBonusPolicy,
  updateSalaryBonusPolicy,
} from "@/lib/teacher-salary-policy-store";
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

export async function GET(request: Request) {
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
    const statement = getSalaryStatement(teacherId, month);
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
  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === "update_status") {
      const { id, status, paymentDate } = body;
      if (!id || !status) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const statement = updateSalaryStatementStatus(id, status, { paymentDate });
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
      const statement = confirmSalaryStatement(teacherId, month, body.adminConfirmedBy);
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
      const statements = finalizeAllEstimatesForMonth(month);
      return NextResponse.json({ statements, count: statements.length });
    }

    if (action === "mark_processing") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      const statement = markSalaryProcessing(id);
      if (!statement) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ statement });
    }

    if (action === "mark_php_paid") {
      const { id, phpPaidAt } = body;
      if (!id) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      const statement = markSalaryPhpPaid(id, phpPaidAt);
      if (!statement) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ statement });
    }

    if (action === "complete") {
      const { id, krwTransferAmount } = body;
      if (!id || !krwTransferAmount) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const statement = completeSalaryStatement(id, Number(krwTransferAmount));
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
      const adjustment = addSalaryAdjustment({
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
      const policy = updateSalaryBonusPolicy(body.policy ?? body);
      return NextResponse.json({ policy });
    }

    if (action === "update_hourly_rate") {
      const { teacherId, hourlyRatePhp } = body;
      if (!teacherId || hourlyRatePhp == null) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      const teacher = updateTeacherHourlyRate(teacherId, Number(hourlyRatePhp));
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
      applyBulkHourlyRateUpdate(Number(hourlyRatePhp), teacherIds);
      return NextResponse.json({ ok: true, preview });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
