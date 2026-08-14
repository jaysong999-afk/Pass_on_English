import type { TeacherSalaryAdjustment } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherSalaryAdjustmentCache,
  prependTeacherSalaryAdjustmentCache,
  setTeacherSalaryAdjustmentCache,
} from "@/lib/teacher-salary-adjustment-cache";

interface TeacherBonusRow {
  id: string;
  teacher_id: string;
  amount_php: number;
  reason: string;
  month_key: string;
  created_by: string | null;
  created_at: string;
}

function rowToAdjustment(row: TeacherBonusRow): TeacherSalaryAdjustment {
  const isPenalty = Number(row.amount_php) < 0;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    month: row.month_key,
    type: isPenalty ? "penalty" : "bonus",
    amountPhp: Math.abs(Number(row.amount_php)),
    reason: row.reason,
    createdAt: row.created_at,
    createdBy: row.created_by ?? "admin",
  };
}

async function fetchAdjustmentRows(): Promise<TeacherBonusRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_bonuses")
    .select("id, teacher_id, amount_php, reason, month_key, created_by, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`teacher_bonuses_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as TeacherBonusRow[];
}

export async function warmTeacherSalaryAdjustmentCache() {
  const rows = await fetchAdjustmentRows();
  setTeacherSalaryAdjustmentCache(rows.map(rowToAdjustment));
  return getTeacherSalaryAdjustmentCache();
}

export async function addSalaryAdjustmentInDb(input: {
  teacherId: string;
  month: string;
  type: "bonus" | "penalty";
  amountPhp: number;
  reason: string;
  createdBy?: string;
}): Promise<TeacherSalaryAdjustment> {
  const supabase = await createClient();
  const amount = Math.abs(input.amountPhp);
  const signedAmount = input.type === "penalty" ? -amount : amount;

  const { data, error } = await supabase
    .from("teacher_bonuses")
    .insert({
      teacher_id: input.teacherId,
      amount_php: signedAmount,
      reason: input.reason.trim(),
      month_key: input.month,
      created_by: input.createdBy ?? null,
    })
    .select("id, teacher_id, amount_php, reason, month_key, created_by, created_at")
    .single();

  if (error) {
    throw new Error(`teacher_bonus_insert_failed: ${error.message}`);
  }

  const adjustment = rowToAdjustment(data as TeacherBonusRow);
  prependTeacherSalaryAdjustmentCache(adjustment);
  return { ...adjustment };
}
