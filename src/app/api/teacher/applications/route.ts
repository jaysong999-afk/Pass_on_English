import { NextResponse } from "next/server";
import { listTeacherApplications } from "@/lib/admin/teacher-application-store";
import {
  getTeacherApplicationForApplicantInDb,
  listTeacherApplicationsInDb,
} from "@/lib/teacher-applications/repository";
import { registerTeacherApplicantInDb } from "@/lib/teacher-applications/register-applicant";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import type { TeacherSignupInput } from "@/types";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";

function parseSignupInput(body: unknown): TeacherSignupInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const fullName = String(raw.fullName ?? "").trim();
  const dateOfBirth = String(raw.dateOfBirth ?? "").trim();
  const phone = String(raw.phone ?? "").trim();
  const bankAccount = String(raw.bankAccount ?? "").trim();
  const facebookMessengerId = String(raw.facebookMessengerId ?? "").trim();
  const address = String(raw.address ?? "").trim();
  const email = String(raw.email ?? "").trim();
  const password = String(raw.password ?? "");

  if (
    !fullName ||
    !email ||
    !dateOfBirth ||
    !phone ||
    !bankAccount ||
    !facebookMessengerId ||
    !address ||
    !password
  ) {
    return null;
  }

  return {
    fullName,
    dateOfBirth,
    phone,
    bankAccount,
    facebookMessengerId,
    address,
    email,
    password,
  };
}

function mapRegisterError(error: unknown) {
  const message = error instanceof Error ? error.message : "signup_failed";

  if (message.includes("auth_signup_failed")) {
    const detail = message.split(": ").slice(1).join(": ").toLowerCase();
    if (
      detail.includes("already registered") ||
      detail.includes("already been registered") ||
      detail.includes("user already exists")
    ) {
      return { error: "email_already_registered" as const, status: 409 };
    }
    if (detail.includes("rate limit")) {
      return { error: "signup_rate_limited" as const, status: 429 };
    }
    return { error: "signup_failed" as const, status: 409 };
  }

  if (message.includes("auth_signin_failed")) {
    return { error: "email_already_registered" as const, status: 409 };
  }

  if (message.includes("teacher_application_create_failed")) {
    return { error: "application_create_failed" as const, status: 500 };
  }

  if (message.includes("profile_update_failed")) {
    return { error: "profile_update_failed" as const, status: 500 };
  }

  return { error: "signup_failed" as const, status: 500 };
}

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const context = await requireRole("teacher");
      const application = await getTeacherApplicationForApplicantInDb(
        id,
        context.userId,
        context.email
      );
      if (!application) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ application });
    }

    await requireRole("admin");
    await listTeacherApplicationsInDb();
    return NextResponse.json({ applications: listTeacherApplications() });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  await ensureSchedulesBootstrapped();
  try {
    const body = await request.json();
    const input = parseSignupInput(body);

    if (!input) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    if (input.password.length < 8) {
      return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    }

    const application = await registerTeacherApplicantInDb(input);

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("[teacher/applications POST]", error);
    const mapped = mapRegisterError(error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}
