import { NextResponse } from "next/server";
import type { VideoPlatform } from "@/types";
import { fetchStudentCountryInDb } from "@/lib/accounts/repository";
import { updateTeacherStudentContext } from "@/lib/teacher-student-context-store-sync";
import {
  defaultVideoPlatformForCountry,
  getTeacherStudentContextInDb,
  updateTeacherStudentContextInDb,
} from "@/lib/teacher-student-context-repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getTeacherById } from "@/lib/teacher-profile-store-sync";
import { resolveLessonVideoPlatform } from "@/lib/video-platforms";

async function resolveVideoPlatformOptions(studentId: string, teacherId: string) {
  const country = await fetchStudentCountryInDb(studentId);
  return {
    studentPlatforms: getStudentDirectoryEntry(studentId)?.learner.videoPlatforms ?? [],
    teacherPlatforms: getTeacherById(teacherId)?.videoPlatforms ?? [],
    fallback: defaultVideoPlatformForCountry(country),
  };
}

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const teacherId = searchParams.get("teacherId");

  if (!studentId || !teacherId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    const options = await resolveVideoPlatformOptions(studentId, teacherId);
    const context = await getTeacherStudentContextInDb(studentId, teacherId, {
      videoPlatform: options.fallback,
    });
    return NextResponse.json({
      context: {
        ...context,
        videoPlatform: resolveLessonVideoPlatform(
          options.studentPlatforms,
          options.teacherPlatforms,
          context.videoPlatform,
          options.fallback
        ),
      },
    });
  } catch (error) {
    console.error("[teacher/student-context GET]", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

async function handleUpdate(request: Request) {
  await ensureSchedulesBootstrapped();
  let body: {
    studentId?: string;
    teacherId?: string;
    textbook?: string;
    videoPlatform?: VideoPlatform;
    specialNotes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { studentId, teacherId, textbook, videoPlatform, specialNotes } = body;

  if (!studentId || !teacherId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    const options = await resolveVideoPlatformOptions(studentId, teacherId);
    const current = await getTeacherStudentContextInDb(studentId, teacherId, {
      videoPlatform: options.fallback,
    });
    const resolvedVideoPlatform = resolveLessonVideoPlatform(
      options.studentPlatforms,
      options.teacherPlatforms,
      videoPlatform ?? current.videoPlatform,
      options.fallback
    );
    const context = await updateTeacherStudentContextInDb(
      studentId,
      teacherId,
      { textbook, videoPlatform: resolvedVideoPlatform, specialNotes },
      { videoPlatform: options.fallback }
    );

    updateTeacherStudentContext(studentId, teacherId, {
      textbook: context.textbook,
      textbookHistory: context.textbookHistory,
      videoPlatform: context.videoPlatform,
      specialNotes: context.specialNotes,
    });

    return NextResponse.json({ context });
  } catch (error) {
    console.error("[teacher/student-context update]", error);
    const message = error instanceof Error ? error.message : "update_failed";
    if (message.includes("invalid input syntax for type uuid")) {
      return NextResponse.json({ error: "invalid_student_or_teacher_id" }, { status: 400 });
    }
    if (message.includes("_failed") || message.includes("violates foreign key")) {
      return NextResponse.json({ error: "save_failed" }, { status: 404 });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return handleUpdate(request);
}

export async function PUT(request: Request) {
  return handleUpdate(request);
}
