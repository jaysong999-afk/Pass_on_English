import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import { createRequestDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
import type { Locale } from "@/lib/i18n/config";
import type {
  AdminStudentAnnouncement,
  StudentAnnouncement,
  StudentAnnouncementDisplayStatus,
  StudentAnnouncementPriority,
  StudentAnnouncementStatus,
  UpsertStudentAnnouncementInput,
} from "@/lib/announcements/types";

const ANNOUNCEMENT_CACHE_TAG = "student-announcements";
const ADMIN_COLUMNS = [
  "id",
  "status",
  "priority",
  "title_ko",
  "body_ko",
  "title_zh_cn",
  "body_zh_cn",
  "starts_at",
  "ends_at",
  "portal_wide",
  "link_path",
  "link_label_ko",
  "link_label_zh_cn",
  "sort_order",
  "published_at",
  "updated_by_profile:profiles!student_announcements_updated_by_fkey(full_name)",
  "created_at",
  "updated_at",
].join(", ");

const STUDENT_COMMON_COLUMNS = [
  "id",
  "priority",
  "starts_at",
  "ends_at",
  "portal_wide",
  "link_path",
  "updated_at",
];

interface AnnouncementRow {
  id: string;
  status: StudentAnnouncementStatus;
  priority: StudentAnnouncementPriority;
  title_ko: string;
  body_ko: string;
  title_zh_cn: string;
  body_zh_cn: string;
  starts_at: string;
  ends_at: string | null;
  portal_wide: boolean;
  link_path: string | null;
  link_label_ko: string | null;
  link_label_zh_cn: string | null;
  sort_order: number;
  published_at: string | null;
  updated_by_profile?: { full_name: string | null } | null;
  created_at: string;
  updated_at: string;
}

interface LocalizedAnnouncementRow {
  id: string;
  priority: StudentAnnouncementPriority;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  portal_wide: boolean;
  link_path: string | null;
  link_label: string | null;
  updated_at: string;
}

function displayStatus(row: AnnouncementRow): StudentAnnouncementDisplayStatus {
  if (row.status !== "published") return row.status;
  const now = Date.now();
  if (new Date(row.starts_at).getTime() > now) return "scheduled";
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return "expired";
  return "published";
}

function toAdminAnnouncement(row: AnnouncementRow): AdminStudentAnnouncement {
  return {
    id: row.id,
    status: row.status,
    displayStatus: displayStatus(row),
    priority: row.priority,
    titleKo: row.title_ko,
    bodyKo: row.body_ko,
    titleZhCn: row.title_zh_cn,
    bodyZhCn: row.body_zh_cn,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    portalWide: row.portal_wide,
    linkPath: row.link_path,
    linkLabelKo: row.link_label_ko,
    linkLabelZhCn: row.link_label_zh_cn,
    sortOrder: row.sort_order,
    publishedAt: row.published_at,
    updatedByName: row.updated_by_profile?.full_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLocalizedAnnouncement(row: LocalizedAnnouncementRow): StudentAnnouncement {
  return {
    id: row.id,
    priority: row.priority,
    title: row.title,
    body: row.body,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    portalWide: row.portal_wide,
    linkPath: row.link_path,
    linkLabel: row.link_label,
    updatedAt: row.updated_at,
  };
}

function toDbInput(input: UpsertStudentAnnouncementInput) {
  return {
    status: input.status,
    priority: input.priority,
    title_ko: input.titleKo.trim(),
    body_ko: input.bodyKo.trim(),
    title_zh_cn: input.titleZhCn.trim(),
    body_zh_cn: input.bodyZhCn.trim(),
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    portal_wide: input.portalWide,
    link_path: input.linkPath?.trim() || null,
    link_label_ko: input.linkLabelKo?.trim() || null,
    link_label_zh_cn: input.linkLabelZhCn?.trim() || null,
    sort_order: input.sortOrder ?? 0,
  };
}

async function queryActiveStudentAnnouncements(locale: Locale): Promise<StudentAnnouncement[]> {
  const db = createServiceDbClient();
  const now = new Date().toISOString();
  const localizedColumns =
    locale === "zh-CN"
      ? [...STUDENT_COMMON_COLUMNS, "title:title_zh_cn", "body:body_zh_cn", "link_label:link_label_zh_cn"]
      : [...STUDENT_COMMON_COLUMNS, "title:title_ko", "body:body_ko", "link_label:link_label_ko"];
  const { data, error } = await db
    .from("student_announcements")
    .select(localizedColumns.join(", "))
    .eq("status", "published")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("priority_rank", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`student_announcements_fetch_failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as LocalizedAnnouncementRow[]).map(toLocalizedAnnouncement);
}

const getCachedActiveStudentAnnouncements = unstable_cache(
  queryActiveStudentAnnouncements,
  ["student-announcements-active-v1"],
  { revalidate: 60, tags: [ANNOUNCEMENT_CACHE_TAG] }
);

export async function listActiveStudentAnnouncementsInDb(
  locale: Locale
): Promise<StudentAnnouncement[]> {
  return getCachedActiveStudentAnnouncements(locale);
}

export async function listAdminStudentAnnouncementsInDb(input: {
  page: number;
  pageSize: number;
  status?: StudentAnnouncementStatus;
  priority?: StudentAnnouncementPriority;
}): Promise<{ items: AdminStudentAnnouncement[]; total: number }> {
  const db = await createRequestDbClient();
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  let query = db
    .from("student_announcements")
    .select(ADMIN_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (input.status) query = query.eq("status", input.status);
  if (input.priority) query = query.eq("priority", input.priority);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`admin_student_announcements_fetch_failed: ${error.message}`);
  }

  return {
    items: ((data ?? []) as unknown as AnnouncementRow[]).map(toAdminAnnouncement),
    total: count ?? 0,
  };
}

export async function createStudentAnnouncementInDb(
  input: UpsertStudentAnnouncementInput
): Promise<AdminStudentAnnouncement> {
  const db = await createRequestDbClient();
  const { data, error } = await db
    .from("student_announcements")
    .insert(toDbInput(input))
    .select(ADMIN_COLUMNS)
    .single();

  if (error) {
    throw new Error(`student_announcement_create_failed: ${error.message}`);
  }

  revalidateTag(ANNOUNCEMENT_CACHE_TAG);
  return toAdminAnnouncement(data as unknown as AnnouncementRow);
}

export async function updateStudentAnnouncementInDb(
  id: string,
  input: UpsertStudentAnnouncementInput
): Promise<AdminStudentAnnouncement | null> {
  const db = await createRequestDbClient();
  const { data, error } = await db
    .from("student_announcements")
    .update(toDbInput(input))
    .eq("id", id)
    .select(ADMIN_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`student_announcement_update_failed: ${error.message}`);
  }

  revalidateTag(ANNOUNCEMENT_CACHE_TAG);
  return data ? toAdminAnnouncement(data as unknown as AnnouncementRow) : null;
}
