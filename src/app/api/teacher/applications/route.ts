import { NextResponse } from "next/server";
import {
  getTeacherApplicationById,
  listTeacherApplications,
  saveTeacherApplication,
} from "@/lib/admin/teacher-application-store";
import type { TeacherApplication } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const application = getTeacherApplicationById(id);
    if (!application) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ application });
  }

  return NextResponse.json({ applications: listTeacherApplications() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = body as Omit<TeacherApplication, "id" | "status" | "submittedAt">;

    if (
      !input.fullName?.trim() ||
      !input.email?.trim() ||
      !input.dateOfBirth ||
      !input.phone?.trim()
    ) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const application = saveTeacherApplication({
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth,
      phone: input.phone.trim(),
      bankAccount: String(input.bankAccount ?? "").trim(),
      facebookMessengerId: String(input.facebookMessengerId ?? "").trim(),
      address: String(input.address ?? "").trim(),
      email: input.email.trim(),
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
