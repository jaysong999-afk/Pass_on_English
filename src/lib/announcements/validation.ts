import type {
  StudentAnnouncementPriority,
  StudentAnnouncementStatus,
  UpsertStudentAnnouncementInput,
} from "@/lib/announcements/types";

export const STUDENT_ANNOUNCEMENT_STATUSES: StudentAnnouncementStatus[] = [
  "draft",
  "published",
  "archived",
];
export const STUDENT_ANNOUNCEMENT_PRIORITIES: StudentAnnouncementPriority[] = [
  "normal",
  "important",
  "urgent",
];

export function validateStudentAnnouncementInput(
  body: UpsertStudentAnnouncementInput
): string | null {
  if (!STUDENT_ANNOUNCEMENT_STATUSES.includes(body.status)) return "invalid_status";
  if (!STUDENT_ANNOUNCEMENT_PRIORITIES.includes(body.priority)) return "invalid_priority";
  if (!body.startsAt || Number.isNaN(new Date(body.startsAt).getTime())) return "invalid_starts_at";
  if (body.endsAt && Number.isNaN(new Date(body.endsAt).getTime())) return "invalid_ends_at";
  if (body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) return "invalid_period";
  if (body.status === "published") {
    if (!body.titleKo?.trim() || !body.titleZhCn?.trim()) return "title_required";
    if (!body.bodyKo?.trim() || !body.bodyZhCn?.trim()) return "body_required";
    if (body.priority !== "normal" && !body.endsAt) return "important_end_required";
  }
  if ((body.titleKo?.length ?? 0) > 120 || (body.titleZhCn?.length ?? 0) > 120) {
    return "title_too_long";
  }
  if ((body.bodyKo?.length ?? 0) > 3000 || (body.bodyZhCn?.length ?? 0) > 3000) {
    return "body_too_long";
  }
  if (
    (body.linkLabelKo?.trim() || body.linkLabelZhCn?.trim()) &&
    !body.linkPath?.trim()
  ) {
    return "link_path_required";
  }
  if (
    body.linkPath &&
    (!body.linkPath.startsWith("/") || body.linkPath.startsWith("//") || /[\r\n]/.test(body.linkPath))
  ) {
    return "invalid_link_path";
  }
  if (!Number.isInteger(body.sortOrder ?? 0) || Math.abs(body.sortOrder ?? 0) > 32767) {
    return "invalid_sort_order";
  }
  return null;
}
