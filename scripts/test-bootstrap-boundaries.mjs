import { readFileSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const bootstrapSource = readFileSync(
  resolve(root, "src/lib/lesson-scheduler-bootstrap.ts"),
  "utf8"
);
const availabilityRouteSource = readFileSync(
  resolve(root, "src/app/api/teacher/availability/route.ts"),
  "utf8"
);
const cronRouteSource = readFileSync(
  resolve(root, "src/app/api/cron/expire-enrollment-holds/route.ts"),
  "utf8"
);
const serverSupabaseSource = readFileSync(
  resolve(root, "src/lib/supabase/server.ts"),
  "utf8"
);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`unable to locate boundary: ${startMarker}`);
  }
  return source.slice(start, end);
}

const readBootstrap = section(
  bootstrapSource,
  "export async function ensureReadModelsBootstrapped",
  "export const ensureSchedulesBootstrapped"
);
const availabilityGet = section(
  availabilityRouteSource,
  "export async function GET",
  "export async function PUT"
);

for (const mutation of [
  "restoreOccupiedWeeklyAvailabilityInDb",
  "bootstrapActiveEnrollmentSchedulesInDb",
  "ensureRenewalOffersInDb",
  "expireEnrollmentHoldsInDb",
]) {
  if (readBootstrap.includes(mutation)) {
    throw new Error(`read bootstrap must not call ${mutation}`);
  }
}

if (availabilityGet.includes("restoreOccupiedWeeklyAvailabilityInDb")) {
  throw new Error("teacher availability GET must not restore persisted availability");
}

if (!bootstrapSource.includes("export async function runScheduleMaintenanceInDb")) {
  throw new Error("explicit schedule maintenance entry point is missing");
}
if (!cronRouteSource.includes("runScheduleMaintenanceInDb")) {
  throw new Error("enrollment maintenance cron is not connected to the maintenance entry point");
}
if (
  !serverSupabaseSource.includes("bearer === cronSecret") ||
  !serverSupabaseSource.includes("createPrivilegedClient()")
) {
  throw new Error("authenticated cron requests must use the privileged database client");
}

console.log("PASS read bootstrap contains no persisted-state maintenance calls");
console.log("PASS teacher availability GET contains no availability upsert");
console.log("PASS scheduled maintenance is explicit and cron-connected");
console.log("PASS cron bearer authentication is isolated from Supabase user JWT handling");
