import { NextResponse } from "next/server";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import {
  getBonusPolicy,
  getSalaryMonthsForTeacher,
  getSalaryStatement,
  getSalaryStatementsForTeacher,
} from "@/lib/teacher-salary-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId") ?? CURRENT_TEACHER_ID;
  const month = searchParams.get("month");

  if (month) {
    const statement = getSalaryStatement(teacherId, month);
    if (!statement) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      statement,
      bonusPolicy: getBonusPolicy(),
      availableMonths: getSalaryMonthsForTeacher(teacherId),
    });
  }

  return NextResponse.json({
    statements: getSalaryStatementsForTeacher(teacherId),
    availableMonths: getSalaryMonthsForTeacher(teacherId),
    bonusPolicy: getBonusPolicy(),
  });
}
