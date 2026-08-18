import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

for (const path of [
  "src/components/shared/AppShell.tsx",
  "src/components/shared/StudentAppShell.tsx",
]) {
  if (!read(path).includes('from "@/components/shared/PortalNavigation"')) {
    throw new Error(`${path} does not use PortalNavigation`);
  }
}
console.log("PASS student and teacher shells share portal navigation");

for (const path of [
  "src/app/[locale]/student/chat/page.tsx",
  "src/app/teacher/chat/page.tsx",
]) {
  if (!read(path).includes('from "@/components/shared/ChatListParts"')) {
    throw new Error(`${path} does not use shared chat list UI`);
  }
}
console.log("PASS student and teacher chat lists share cards and load states");

for (const path of [
  "src/app/[locale]/student/chat/[roomId]/page.tsx",
  "src/app/teacher/chat/[roomId]/page.tsx",
  "src/app/admin/chat/[roomId]/page.tsx",
]) {
  const source = read(path);
  if (!source.includes('from "@/hooks/useChatRoom"')) {
    throw new Error(`${path} does not use shared chat room synchronization`);
  }
  if (source.includes('fetch(`/api/chat/rooms')) {
    throw new Error(`${path} still duplicates chat room requests`);
  }
}
console.log("PASS three role-specific chat rooms share room synchronization");
