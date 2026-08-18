import { existsSync, readFileSync, readdirSync } from "fs";
import { extname, join, resolve } from "path";

const root = process.cwd();
const removedFacades = [
  "src/lib/enrollment-store.ts",
  "src/lib/faq-store.ts",
  "src/lib/learning-store.ts",
  "src/lib/reschedule-store.ts",
  "src/lib/teacher-availability-store.ts",
  "src/lib/teacher-lesson-store.ts",
  "src/lib/teacher-payroll-penalty-store.ts",
  "src/lib/teacher-profile-store.ts",
  "src/lib/teacher-salary-adjustment-store.ts",
  "src/lib/teacher-salary-policy-store.ts",
  "src/lib/teacher-salary-store.ts",
  "src/lib/teacher-student-context-store.ts",
  "src/lib/admin/admin-review-log-store.ts",
  "src/lib/admin/student-registration-store.ts",
  "src/lib/finance/payroll-finance-store.ts",
];

for (const path of removedFacades) {
  if (existsSync(resolve(root, path))) {
    throw new Error(`re-export-only facade remains: ${path}`);
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".mjs"].includes(extname(path)) ? [path] : [];
  });
}

const removedImports = removedFacades.map((path) =>
  `@/${path.replace(/^src\//, "").replace(/\.ts$/, "")}`
);
for (const file of sourceFiles(resolve(root, "src"))) {
  const source = readFileSync(file, "utf8");
  for (const importPath of removedImports) {
    if (source.includes(`"${importPath}"`) || source.includes(`'${importPath}'`)) {
      throw new Error(`${file} still imports removed facade ${importPath}`);
    }
  }
  if (source.includes("store-sync-sync")) {
    throw new Error(`${file} contains an invalid duplicated store-sync path`);
  }
}

console.log(`PASS removed ${removedFacades.length} re-export-only store facades`);
console.log("PASS runtime imports point directly to the responsible store-sync modules");
