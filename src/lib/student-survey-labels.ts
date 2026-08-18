import type { CefrLevel, CoursePurpose } from "@/types";

export const CEFR_LEVELS: { value: CefrLevel; label: string }[] = [
  { value: "A1", label: "A1 — 기초: 간단한 인사·자기소개 가능" },
  { value: "A2", label: "A2 — 초급: 일상적인 간단한 대화 가능" },
  { value: "B1", label: "B1 — 중급: 익숙한 주제로 의견 표현 가능" },
  { value: "B2", label: "B2 — 중상급: 다양한 주제로 자유롭게 대화 가능" },
  { value: "C1", label: "C1 — 고급: 복잡한 주제도 유창하게 소통" },
  { value: "C2", label: "C2 — 최고급: 원어민에 가까운 수준" },
];

export const COURSE_PURPOSES: { value: CoursePurpose; label: string }[] = [
  { value: "daily_conversation", label: "일상회화" },
  { value: "phonics", label: "파닉스" },
  { value: "graded_reading", label: "영어 원서 리딩" },
  { value: "debate", label: "Debate" },
  { value: "adult_conversation", label: "성인 영어회화" },
  { value: "business_english", label: "비즈니스 영어" },
  { value: "current_affairs", label: "시사 영어" },
];

const CEFR_LABEL_MAP = Object.fromEntries(CEFR_LEVELS.map((l) => [l.value, l.label])) as Record<
  CefrLevel,
  string
>;

const PURPOSE_LABEL_MAP = Object.fromEntries(
  COURSE_PURPOSES.map((p) => [p.value, p.label])
) as Record<CoursePurpose, string>;

const PURPOSE_LABEL_MAP_EN: Record<CoursePurpose, string> = {
  daily_conversation: "Daily conversation",
  phonics: "Phonics",
  graded_reading: "Graded reading",
  debate: "Debate",
  adult_conversation: "Adult conversation",
  business_english: "Business English",
  current_affairs: "Current affairs",
};

export function formatCefrLevel(level: CefrLevel): string {
  return CEFR_LABEL_MAP[level] ?? level;
}

export function formatCoursePurposes(purposes: CoursePurpose[]): string {
  return purposes.map((p) => PURPOSE_LABEL_MAP[p] ?? p).join(", ");
}

export function formatCoursePurposesEnglish(purposes: CoursePurpose[]): string {
  return purposes.map((purpose) => PURPOSE_LABEL_MAP_EN[purpose] ?? purpose).join(", ");
}

export const VALID_CEFR_LEVELS = CEFR_LEVELS.map((l) => l.value);
export const VALID_COURSE_PURPOSES = COURSE_PURPOSES.map((p) => p.value);
