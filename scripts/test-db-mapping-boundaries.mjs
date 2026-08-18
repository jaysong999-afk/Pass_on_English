import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const studentRepositories = [
  "src/lib/accounts/repository.ts",
  "src/lib/students/repository.ts",
];
for (const path of studentRepositories) {
  const source = read(path);
  for (const boundary of ["@/lib/students/db-types", "@/lib/students/db-readers"]) {
    if (!source.includes(boundary)) throw new Error(`${path} does not use ${boundary}`);
  }
  for (const duplicate of ["interface StudentRow", "interface EnrollmentMetaRow", "interface TrialLessonRow"] ) {
    if (source.includes(duplicate)) throw new Error(`${path} still declares ${duplicate}`);
  }
}
console.log("PASS account and student repositories share DB row types and readers");

const joinedRepositories = [
  "src/lib/lessons/repository.ts",
  "src/lib/learning/repository.ts",
  "src/lib/reschedule/repository.ts",
];
for (const path of joinedRepositories) {
  const source = read(path);
  if (!source.includes("@/lib/db/join-types")) {
    throw new Error(`${path} does not use shared joined-name conversion`);
  }
}
console.log("PASS lesson, learning, and reschedule repositories share joined-name conversion");

const dbTypes = read("src/lib/students/db-types.ts");
for (const country of ['"KR"', '"CN"', '"PH"']) {
  if (!dbTypes.includes(country)) throw new Error(`Student DB country type is missing ${country}`);
}
console.log("PASS shared student DB type retains all supported single-timezone countries");
