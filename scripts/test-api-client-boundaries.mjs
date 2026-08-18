import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const resourceConsumers = [
  "src/hooks/usePricingPlans.ts",
  "src/components/student/StudentFaqPage.tsx",
  "src/components/teacher/TeacherMyLessonsHub.tsx",
  "src/app/admin/(portal)/teacher-profiles/page.tsx",
];
const clientConsumers = [
  ...resourceConsumers,
  "src/contexts/ActiveLearnerContext.tsx",
  "src/contexts/TeacherSessionContext.tsx",
];

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

for (const path of resourceConsumers) {
  const contents = source(path);
  if (!contents.includes('from "@/hooks/useApiResource"')) {
    throw new Error(`${path} does not use the shared API loading lifecycle`);
  }
}
console.log(`PASS shared loading lifecycle consumers: ${resourceConsumers.length}`);

for (const path of clientConsumers) {
  const contents = source(path);
  if (!contents.includes('from "@/lib/api/client"')) {
    throw new Error(`${path} does not use the shared API client`);
  }
}
console.log(`PASS shared API client consumers: ${clientConsumers.length}`);

const client = source("src/lib/api/client.ts");
for (const required of ["class ApiClientError", "response.ok", "response.status", "payload"]) {
  if (!client.includes(required)) throw new Error(`API client is missing ${required}`);
}
console.log("PASS API errors retain status, code, and response payload");
