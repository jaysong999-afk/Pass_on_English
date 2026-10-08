import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getAdminStudentDetail } from "@/lib/admin/student-detail-store";
import {
  listStudentEnrollmentsInDb,
  listStudentPaymentRecordsInDb,
} from "@/lib/enrollments/repository";
import { listStudentLessonsInDb } from "@/lib/lessons/repository";
import { listStudentLearningInDb } from "@/lib/learning/repository";
import { listStudentRescheduleRequestsInDb } from "@/lib/reschedule/repository";
import { getStudentDirectoryEntryInDb } from "@/lib/students/repository";
import { getChatInboxInDb } from "@/lib/chat/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  const { id } = await params;
  const enrollments = await listStudentEnrollmentsInDb(id);
  const [directoryEntry, payments, lessons, learning, rescheduleRequests, chatRooms] =
    await Promise.all([
      getStudentDirectoryEntryInDb(id),
      listStudentPaymentRecordsInDb(id, enrollments),
      listStudentLessonsInDb(id),
      listStudentLearningInDb(id),
      listStudentRescheduleRequestsInDb(id),
      getChatInboxInDb(id).then((rooms) => rooms.filter((room) => room.studentId === id)),
    ]);
  if (!directoryEntry) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const detail = getAdminStudentDetail(id, {
    enrollments,
    payments,
    lessons,
    feedbacks: learning.feedbacks,
    reports: learning.reports,
    rescheduleRequests,
    chatRooms,
  });
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
