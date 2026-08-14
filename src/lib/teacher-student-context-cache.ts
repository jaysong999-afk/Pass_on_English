import type { TeacherStudentContext } from "@/types";

const contextCache = new Map<string, TeacherStudentContext>();

function contextKey(studentId: string, teacherId: string) {
  return `${teacherId}|${studentId}`;
}

export function setTeacherStudentContextCache(contexts: TeacherStudentContext[]) {
  contextCache.clear();
  for (const ctx of contexts) {
    contextCache.set(contextKey(ctx.studentId, ctx.teacherId), { ...ctx });
  }
}

export function getTeacherStudentContextCache(studentId: string, teacherId: string) {
  const key = contextKey(studentId, teacherId);
  const ctx = contextCache.get(key);
  return ctx ? { ...ctx } : undefined;
}

export function setTeacherStudentContextCacheEntry(context: TeacherStudentContext) {
  contextCache.set(contextKey(context.studentId, context.teacherId), { ...context });
}

export function clearTeacherStudentContextCache() {
  contextCache.clear();
}

export function getAllTeacherStudentContextCacheEntries() {
  return [...contextCache.values()].map((ctx) => ({ ...ctx }));
}
