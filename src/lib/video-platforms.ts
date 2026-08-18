import type { VideoPlatform } from "@/types";

export const VIDEO_PLATFORMS: VideoPlatform[] = ["ZOOM", "VOOV"];

export function areVideoPlatformsCompatible(student: VideoPlatform[], teacher: VideoPlatform[]) {
  return student.some((platform) => teacher.includes(platform));
}

export function resolveLessonVideoPlatform(
  student: VideoPlatform[],
  teacher: VideoPlatform[],
  preferred?: VideoPlatform,
  fallback: VideoPlatform = "ZOOM"
): VideoPlatform {
  if (preferred && student.includes(preferred) && teacher.includes(preferred)) {
    return preferred;
  }

  return student.find((platform) => teacher.includes(platform))
    ?? student[0]
    ?? teacher[0]
    ?? fallback;
}
