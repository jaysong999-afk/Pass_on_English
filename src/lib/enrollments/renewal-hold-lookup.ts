import type { SupabaseClient } from "@supabase/supabase-js";

/** A fresh, bounded existence lookup; never used to authorize a new hold. */
export async function findParentsWithPendingRenewalHolds(
  db: SupabaseClient,
  parentIds: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const ids = [...new Set(parentIds)];
  // Bound URL size and paginate duplicate holds instead of trusting the API row cap.
  const batchSize = 100;
  const pageSize = 100;
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    let afterId: string | undefined;
    for (;;) {
      let query = db.from("enrollments")
        .select("id,renewed_from_enrollment_id")
        .in("renewed_from_enrollment_id", batch)
        .eq("status", "pending_payment")
        .in("payment_status", ["pending", "reported"])
        .order("id", { ascending: true })
        .limit(pageSize);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query;
      if (error) throw new Error(`renewal_hold_lookup_failed: ${error.message}`);
      const rows = data ?? [];
      for (const row of rows) found.add(row.renewed_from_enrollment_id as string);
      if (rows.length < pageSize) break;
      afterId = rows[rows.length - 1].id as string;
    }
  }
  return found;
}
