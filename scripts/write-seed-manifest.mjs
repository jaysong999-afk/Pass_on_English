/**
 * Write seed-manifest.json without auth (fixed IDs from migration 007).
 * Use when sign-in fails but migration 007 is applied.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifest = {
  seededAt: new Date().toISOString(),
  password: "DemoPass123!",
  student: {
    email: "demo-student@example.org",
    userId: "a0000002-0000-4000-8000-000000000002",
    learnerId: "a0000003-0000-4000-8000-000000000003",
  },
  teacher: {
    email: "demo-teacher@example.org",
    userId: "a0000001-0000-4000-8000-000000000001",
    displayName: "Sarah Mitchell",
  },
  admin: {
    email: "demo-admin@example.org",
    userId: "a0000004-0000-4000-8000-000000000004",
  },
  activeEnrollmentId: "a0000010-0000-4000-8000-000000000010",
  pendingEnrollmentId: "a0000011-0000-4000-8000-000000000011",
  completedLessonId: "a0000020-0000-4000-8000-000000000020",
  scheduledLessonId: "a0000021-0000-4000-8000-000000000021",
  chatRoomId: "a0000030-0000-4000-8000-000000000030",
};

writeFileSync(resolve(__dirname, "seed-manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Wrote seed-manifest.json (static IDs from migration 007)");
