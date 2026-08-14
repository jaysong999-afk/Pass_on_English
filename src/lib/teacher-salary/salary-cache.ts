import type { TeacherSalaryStatement } from "@/types";

let salaryCache: TeacherSalaryStatement[] = [];

export function getSalaryCache(): TeacherSalaryStatement[] {
  return salaryCache;
}

export function setSalaryCache(items: TeacherSalaryStatement[]) {
  salaryCache = items;
}

export function patchSalaryInCache(statement: TeacherSalaryStatement) {
  const index = salaryCache.findIndex(
    (s) => s.teacherId === statement.teacherId && s.month === statement.month
  );
  if (index === -1) {
    salaryCache.unshift(statement);
  } else {
    salaryCache[index] = statement;
  }
}

export function findSalaryInCache(teacherId: string, month: string) {
  return salaryCache.find((s) => s.teacherId === teacherId && s.month === month);
}
