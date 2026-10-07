import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/049_student_announcements.sql");
const privilegeMigration = read("supabase/migrations/050_harden_student_announcement_privileges.sql");
const repository = read("src/lib/announcements/repository.ts");
const studentRoute = read("src/app/api/student/announcements/route.ts");
const adminRoute = read("src/app/api/admin/student-announcements/route.ts");
const provider = read("src/contexts/StudentAnnouncementsContext.tsx");
const studentUi = read("src/components/student/StudentAnnouncements.tsx");
const adminUi = read("src/components/admin/messages/StudentAnnouncementsPanel.tsx");

for (const requirement of [
  "CREATE TABLE IF NOT EXISTS public.student_announcements",
  "ENABLE ROW LEVEL SECURITY",
  "rls_student_announcements_student_select",
  "rls_student_announcements_admin_insert",
  "rls_student_announcements_admin_update",
  "status = 'published'",
  "starts_at <= now()",
  "ends_at IS NULL OR ends_at > now()",
]) {
  if (!migration.includes(requirement)) {
    throw new Error(`announcement migration boundary missing: ${requirement}`);
  }
}
if (/ADD TABLE\s+(?:public\.)?student_announcements/i.test(migration)) {
  throw new Error("student announcements must not be added to Supabase Realtime");
}
console.log("PASS announcement table has bounded role policies and no Realtime publication");

for (const requirement of [
  "REVOKE ALL ON TABLE public.student_announcements FROM authenticated",
  "GRANT SELECT, INSERT, UPDATE ON TABLE public.student_announcements TO authenticated",
]) {
  if (!privilegeMigration.includes(requirement)) {
    throw new Error(`announcement least-privilege boundary missing: ${requirement}`);
  }
}
if (/GRANT[^;]*DELETE/i.test(privilegeMigration)) {
  throw new Error("authenticated users must not receive announcement DELETE privileges");
}
console.log("PASS announcement table excludes direct authenticated DELETE privileges");

for (const source of [repository, studentRoute, adminRoute]) {
  if (/ensure\w*Bootstrapped\s*\(/.test(source)) {
    throw new Error("announcement requests must not run a global bootstrap");
  }
  if (/\.select\(\s*[`'\"]\*/.test(source)) {
    throw new Error("announcement queries must select explicit columns");
  }
}
for (const requirement of [
  ".limit(10)",
  "unstable_cache",
  "revalidate: 60",
  "revalidateTag",
]) {
  if (!repository.includes(requirement)) {
    throw new Error(`announcement traffic optimization missing: ${requirement}`);
  }
}
console.log("PASS announcement reads are column-limited, cached, and bounded");

if (provider.includes("setInterval(") || provider.includes("supabase.channel(")) {
  throw new Error("announcement provider must not poll or open a Realtime channel");
}
for (const requirement of ["visibilitychange", "If-None-Match", "requestInFlightRef"]) {
  if (!provider.includes(requirement)) {
    throw new Error(`announcement client request guard missing: ${requirement}`);
  }
}
console.log("PASS student shell uses one shared conditional request without polling");

for (const requirement of [
  "StudentAnnouncementStrip",
  "StudentAnnouncementCard",
  "StudentAnnouncementBell",
  "StudentNoticesPage",
]) {
  if (!studentUi.includes(requirement)) {
    throw new Error(`student announcement UI missing: ${requirement}`);
  }
}
for (const requirement of ["임시저장", "예약 게시", "한국어", "中文", "보관"]) {
  if (!adminUi.includes(requirement)) {
    throw new Error(`admin announcement workflow missing: ${requirement}`);
  }
}
if (/method:\s*["']DELETE["']/.test(adminUi)) {
  throw new Error("published announcements must be archived instead of deleted");
}
console.log("PASS student and admin announcement workflows are connected");
