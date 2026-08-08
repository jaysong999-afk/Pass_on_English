import { NextResponse } from "next/server";
import {
  getAdminTeacherListItems,
  getAdminTeacherSummaryCounts,
} from "@/lib/admin/teacher-overview-store";
import { getPendingTeacherApplications } from "@/lib/admin/teacher-detail-store";

export async function GET() {
  return NextResponse.json({
    summary: getAdminTeacherSummaryCounts(),
    teachers: getAdminTeacherListItems(),
    pendingApplications: getPendingTeacherApplications(),
  });
}
