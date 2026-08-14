import type { AdminReviewLogEntry } from "@/types";
import type { AdminReviewLogsByCategory } from "@/lib/admin/admin-review-log-cache";
import { createClient } from "@/lib/supabase/server";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import {
  getAdminReviewLogCache,
  prependAdminReviewLogCache,
  setAdminReviewLogCache,
} from "@/lib/admin/admin-review-log-cache";

interface AdminReviewLogRow {
  id: string;
  category: AdminReviewLogEntry["category"];
  action: AdminReviewLogEntry["action"];
  target_id: string;
  target_label: string;
  detail: string | null;
  admin_name: string;
  at: string;
}

function rowToEntry(row: AdminReviewLogRow): AdminReviewLogEntry {
  return {
    id: row.id,
    category: row.category,
    action: row.action,
    targetId: row.target_id,
    targetLabel: row.target_label,
    detail: row.detail ?? undefined,
    adminName: row.admin_name,
    at: row.at,
  };
}

async function fetchReviewLogRows(limit = 400): Promise<AdminReviewLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_review_logs")
    .select("id, category, action, target_id, target_label, detail, admin_name, at")
    .order("at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`admin_review_logs_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as AdminReviewLogRow[];
}

export async function warmAdminReviewLogCache(limit = 400) {
  const rows = await fetchReviewLogRows(limit);
  setAdminReviewLogCache(rows.map(rowToEntry));
  return getAdminReviewLogsByCategorySync(limit);
}

export function getAdminReviewLogsByCategorySync(limit = 100): AdminReviewLogsByCategory {
  const cache = getAdminReviewLogCache();
  return {
    reschedule: cache.reschedule.slice(0, limit),
    teacher_signup: cache.teacher_signup.slice(0, limit),
    student_signup: cache.student_signup.slice(0, limit),
    payment_activation: cache.payment_activation.slice(0, limit),
  };
}

export async function appendAdminReviewLogInDb(
  input: Omit<AdminReviewLogEntry, "id" | "at"> & { at?: string }
): Promise<AdminReviewLogEntry> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("admin_review_logs")
    .insert({
      category: input.category,
      action: input.action,
      target_id: input.targetId,
      target_label: input.targetLabel,
      detail: input.detail ?? null,
      admin_name: input.adminName,
      ...(input.at ? { at: input.at } : {}),
    })
    .select("id, category, action, target_id, target_label, detail, admin_name, at")
    .single();

  if (error) {
    throw new Error(`admin_review_log_insert_failed: ${error.message}`);
  }

  const entry = rowToEntry(data as AdminReviewLogRow);
  prependAdminReviewLogCache(entry);
  return { ...entry };
}
