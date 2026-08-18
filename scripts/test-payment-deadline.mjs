import {
  computeHoldDeadlineFrom,
  paymentHoldStartsAt,
  studentFacingPaymentDeadlineAt,
} from "../src/lib/enrollment-hold/constants.ts";

const HOUR_MS = 60 * 60 * 1000;
const start = new Date("2026-08-17T00:00:00.000Z");
const holdDeadline = computeHoldDeadlineFrom(start);

for (const enrollment of [
  { paymentDeadlineAt: holdDeadline.toISOString() },
  { paymentDeadlineAt: holdDeadline.toISOString(), includesTrial: true },
  { paymentDeadlineAt: holdDeadline.toISOString(), renewedFromEnrollmentId: "previous" },
]) {
  const studentDeadline = studentFacingPaymentDeadlineAt(enrollment);
  if (!studentDeadline) throw new Error("student deadline is missing");
  if ((new Date(studentDeadline).getTime() - start.getTime()) / HOUR_MS !== 12) {
    throw new Error(`student deadline must be 12h: ${studentDeadline}`);
  }
}

if ((holdDeadline.getTime() - paymentHoldStartsAt(holdDeadline).getTime()) / HOUR_MS !== 15) {
  throw new Error("server slot hold must remain 15h");
}

console.log("PASS regular/trial/renewal student deadlines are 12h; server hold remains 15h");
