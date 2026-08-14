import type { Lesson } from "@/types";

let lessonCache: Lesson[] = [];

export function getLessonCache(): Lesson[] {
  return lessonCache;
}

export function setLessonCache(items: Lesson[]) {
  lessonCache = items;
}

export function patchLessonInCache(lesson: Lesson) {
  const index = lessonCache.findIndex((l) => l.id === lesson.id);
  if (index === -1) {
    lessonCache.push(lesson);
  } else {
    lessonCache[index] = lesson;
  }
}

export function removeLessonFromCache(id: string) {
  lessonCache = lessonCache.filter((l) => l.id !== id);
}
