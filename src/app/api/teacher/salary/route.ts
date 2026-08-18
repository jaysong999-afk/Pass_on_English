import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { requireTeacherAuth } from "@/lib/auth/session";
import {
  getSalaryStatementInDb,
  getSalaryStatementsForTeacherInDb,
  warmSalaryCache,
} from "@/lib/teacher-salary/repository";
import { getBonusPolicy, getSalaryMonthsForTeacher } from "@/lib/teacher-salary-store-sync";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
    const { teacherId } = await requireTeacherAuth();

    try {
      await warmSalaryCache();
    } catch (error) {
      console.error("[teacher/salary GET] warm cache", error);
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (month) {
      const statement = await getSalaryStatementInDb(teacherId, month);
      if (!statement) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({
        statement,
        bonusPolicy: getBonusPolicy(),
        availableMonths: getSalaryMonthsForTeacher(teacherId),
      });
    }

    const statements = await getSalaryStatementsForTeacherInDb(teacherId);
    return NextResponse.json({
      statements,
      availableMonths: getSalaryMonthsForTeacher(teacherId),
      bonusPolicy: getBonusPolicy(),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) return authResponse;
    console.error("[teacher/salary GET]", error);
    return NextResponse.json({ error: "salary_fetch_failed" }, { status: 500 });
  }
}
