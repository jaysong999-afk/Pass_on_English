import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const enrollmentComponent = read("src/components/student/EnrollmentFlow.tsx");
const enrollmentState = read(
  "src/components/student/enrollment/useEnrollmentFlowState.ts"
);
if (!enrollmentComponent.includes("useEnrollmentFlowState")) {
  throw new Error("EnrollmentFlow does not delegate flow state");
}
if (enrollmentComponent.includes('fetch("/api/student/account")')) {
  throw new Error("EnrollmentFlow still owns account bootstrap");
}
for (const responsibility of [
  "usePricingPlans",
  "useTeacherOpenSlots",
  "resolveEnrollmentPath",
]) {
  if (!enrollmentState.includes(responsibility)) {
    throw new Error(`Enrollment state hook is missing ${responsibility}`);
  }
}
console.log("PASS enrollment orchestration is separated from rendering");

const reviewComponent = read("src/components/admin/AdminReviewCenter.tsx");
const reviewState = read("src/components/admin/reviews/useAdminReviewCenter.ts");
const reviewCards = read("src/components/admin/reviews/ReviewSectionCards.tsx");
if (!reviewComponent.includes("useAdminReviewCenter")) {
  throw new Error("AdminReviewCenter does not delegate read state");
}
if (reviewComponent.includes('fetch("/api/admin/reviews");')) {
  throw new Error("AdminReviewCenter still owns review loading");
}
for (const responsibility of ["rescheduleAttentionCount", "getRescheduleMonitoringState"] ) {
  if (!reviewState.includes(responsibility)) {
    throw new Error(`Review state hook is missing ${responsibility}`);
  }
}
console.log("PASS admin review loading and derived state are separated from rendering");

for (const component of ["ReviewLogSection", "ReviewQueueCard"]) {
  if (!reviewCards.includes(`export function ${component}`)) {
    throw new Error(`Review section module is missing ${component}`);
  }
  if (reviewComponent.includes(`function ${component}`)) {
    throw new Error(`AdminReviewCenter still declares ${component}`);
  }
}
console.log("PASS reusable admin review sections are separated from the page controller");
