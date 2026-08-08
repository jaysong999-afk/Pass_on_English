import { NextResponse } from "next/server";
import {
  addMonthlyReport,
  getReportsByStudent,
  getReportsByTeacher,
  markReportRead,
} from "@/lib/learning-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const teacherId = searchParams.get("teacherId");

  if (studentId) {
    return NextResponse.json({ reports: getReportsByStudent(studentId) });
  }
  if (teacherId) {
    return NextResponse.json({ reports: getReportsByTeacher(teacherId) });
  }
  return NextResponse.json({ error: "studentId or teacherId required" }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const report = addMonthlyReport(body);
    return NextResponse.json({ report }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  if (id && action === "read") {
    markReportRead(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
