import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies, tail = "") {
  const source = readFileSync(path, "utf8") + tail;
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => dependencies[name] ?? {}, console });
  return exports;
}
const { findParentsWithPendingRenewalHolds } = load(
  "src/lib/enrollments/renewal-hold-lookup.ts", {}
);
let requests = 0;
let rows = [];
let fail = false;
const db = { from(table) {
  assert.equal(table, "enrollments");
  let ids, after = "", size;
  const query = {
    select(columns) { assert.equal(columns, "id,renewed_from_enrollment_id"); return this; },
    in(column, values) {
      if (column === "renewed_from_enrollment_id") { ids = values; assert.ok(ids.length <= 100); }
      else assert.deepEqual(Array.from(values), ["pending", "reported"]);
      return this;
    },
    eq(column, value) { assert.equal(column, "status"); assert.equal(value, "pending_payment"); return this; },
    order(column) { assert.equal(column, "id"); return this; },
    limit(value) { size = value; return this; },
    gt(column, value) { assert.equal(column, "id"); after = value; return this; },
    then(resolve) {
      requests++;
      return Promise.resolve({ data: rows.filter((r) => ids.includes(r.renewed_from_enrollment_id) && r.id > after)
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, size),
      error: fail ? { message: "unavailable" } : null }).then(resolve);
    },
  };
  return query;
} };
assert.equal((await findParentsWithPendingRenewalHolds(db, [])).size, 0);
assert.equal(requests, 0);
await findParentsWithPendingRenewalHolds(db, Array.from({ length: 8 }, (_, i) => `p${i}`));
assert.equal(requests, 1, "eight empty parent lookups use one request");
rows = Array.from({ length: 205 }, (_, i) => ({ id: String(i).padStart(4, "0"), renewed_from_enrollment_id: i < 204 ? "p0" : "p1" }));
requests = 0;
assert.equal((await findParentsWithPendingRenewalHolds(db, ["p0", "p1", "p0"])).size, 2);
assert.equal(requests, 3, "duplicates cannot hide a parent beyond the first page");
rows = []; requests = 0;
await findParentsWithPendingRenewalHolds(db, Array.from({ length: 201 }, (_, i) => `p${i}`));
assert.equal(requests, 3);
fail = true;
await assert.rejects(findParentsWithPendingRenewalHolds(db, ["p0"]), /renewal_hold_lookup_failed/);
fail = false;

// Execute the real repository orchestration, with IO and policy collaborators stubbed.
let cache = [], repaired = [], created = [], completed = [], activeHold = false;
const repo = load("src/lib/enrollments/repository.ts", {
  "@/lib/enrollments/renewal-hold-lookup": { findParentsWithPendingRenewalHolds },
  "@/lib/supabase/db-client": { createBootstrapDbClient: () => db },
  "@/lib/enrollments/enrollment-cache": { getEnrollmentCache: () => cache },
  "@/lib/teacher-lesson-store-sync": { getAllLessons: () => [] },
  "@/lib/enrollments/renewal-window": {
    isRenewableEnrollmentStatus: (status) => ["active", "expiring_soon", "completed"].includes(status),
    hasUpcomingPaidLesson: (row) => !!row.upcoming,
    getRenewalWindowState: (row) => ({ canAdminActivate: !!row.open }),
  },
  "@/lib/accounts/repository": { fetchStudentDisplayNameInDb: async () => "Test" },
}, `
export function configureTestIO(io: any) {
  dedupeRenewalHoldsForParentInDb = io.dedupe;
  confirmRenewalEnrollmentInDb = io.confirm;
  markEnrollmentCompletedIfCourseEnded = io.complete;
  findActiveHoldEnrollment = io.activeHold;
}
`);
repo.configureTestIO({
  dedupe: async (id) => { repaired.push(id); return { id: "hold" }; },
  confirm: async (input) => { created.push(input.fromEnrollmentId); return {}; },
  complete: async (row) => { completed.push(row.id); },
  activeHold: () => activeHold,
});
const parent = (id, extra = {}) => ({ id, status: "completed", studentId: id, ...extra });
cache = Array.from({ length: 8 }, (_, i) => parent(`p${i}`));
requests = 0;
assert.equal(await repo.ensureRenewalOffersInDb(), 0);
assert.equal(requests, 1);
assert.equal(repaired.length, 0);
assert.equal(created.length, 0);
cache = [parent("future", { upcoming: true }), parent("cancelled", { status: "cancelled" })];
requests = 0;
assert.equal(await repo.ensureRenewalOffersInDb(), 0);
assert.equal(requests, 0);
cache = [parent("open", { open: true }), parent("expired")];
rows = [{ id: "h1", renewed_from_enrollment_id: "open" }, { id: "h2", renewed_from_enrollment_id: "expired" }];
assert.equal(await repo.ensureRenewalOffersInDb(), 0);
assert.deepEqual(repaired, ["open", "expired"], "expired duplicate repair remains active");
assert.deepEqual(completed, ["open"]);
rows = []; cache = [parent("new", { open: true })];
assert.equal(await repo.ensureRenewalOffersInDb(), 1);
assert.deepEqual(created, ["new"], "new holds go through the existing creation/recheck path");
activeHold = true;
assert.equal(await repo.ensureRenewalOffersInDb(), 0);
assert.equal(created.length, 1);
activeHold = false; fail = true;
await assert.rejects(repo.ensureRenewalOffersInDb(), /renewal_hold_lookup_failed/);
assert.equal(created.length, 1, "lookup failures never create holds");
console.log("Renewal maintenance: batching, pagination, failures and workflow regression checks passed (no live DB).");
