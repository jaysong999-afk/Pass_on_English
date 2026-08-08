import type { LessonFeedback, MonthlyGrowthReport } from "@/types";

const SEED_FEEDBACK: LessonFeedback[] = [
  {
    id: "fb-1",
    lessonId: "lesson-hist-2",
    studentId: "student-1",
    studentName: "Minjun Kim",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    lessonDate: "2026-07-29T10:00:00",
    topic: "Daily Conversation · Hobbies",
    feedback:
      "오늘 취미에 대해 자연스럽게 문장을 만들었어요. 'I enjoy playing soccer' 표현을 스스로 사용한 점이 좋았습니다. 발음에서 'th' 소리만 조금 더 연습하면 더 좋을 것 같아요.",
    homework: "Read pages 12–14 of your storybook and prepare 3 sentences about your weekend.",
    progressPages: "p. 12–14",
    createdAt: "2026-07-29T10:25:00",
  },
  {
    id: "fb-2",
    lessonId: "lesson-hist-1",
    studentId: "student-1",
    studentName: "Minjun Kim",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    lessonDate: "2026-07-30T10:00:00",
    topic: "Daily Conversation · School Life",
    feedback:
      "학교 생활에 대해 질문에 잘 답했어요. 짧은 문장에서 조금 더 긴 문장으로 확장하는 연습을 했습니다. 다음 수업에는 because를 사용해 이유를 말해 볼게요.",
    homework: "Write 5 sentences about your favorite subject at school.",
    progressPages: "p. 15–17",
    createdAt: "2026-07-30T10:22:00",
  },
];

const SEED_REPORTS: MonthlyGrowthReport[] = [
  {
    id: "rpt-1",
    studentId: "student-1",
    studentName: "Minjun Kim",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    month: "2026-06",
    title: "June Growth Report",
    lessonsCovered:
      "Daily greetings, self-introduction, hobbies vocabulary, and short Q&A about weekends. Practiced Oxford Phonics World 2 pages 12–17.",
    progressMade:
      "More confident in daily conversation; greets and introduces himself naturally. Completes homework consistently and picks up new expressions quickly.",
    areasToWorkOn:
      "Connecting longer sentences (brief pauses). Distinguishing 'r' and 'l' sounds in pronunciation.",
    nextMonthGoals:
      "Explain reasons using because/so; keep reading an English storybook twice a week.",
    overallComment:
      "Minjun brings great energy to every class. Keep this pace in July and you’ll grow another step. Keep up the great work!",
    publishedAt: "2026-07-01T09:00:00",
  },
  {
    id: "rpt-2",
    studentId: "student-1",
    studentName: "Minjun Kim",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    month: "2026-05",
    title: "May Growth Report",
    lessonsCovered:
      "Phonics review (short vowels), classroom English, and simple present sentences about family and school.",
    progressMade:
      "Can answer simple questions with full sentences more often. Homework completion improved.",
    areasToWorkOn: "Listening carefully before answering; using articles (a/an/the) correctly.",
    nextMonthGoals: "Build longer answers about hobbies; review phonics pages weekly.",
    overallComment:
      "Steady progress this month. Focus on listening and articles next month — you’re ready for it!",
    publishedAt: "2026-06-01T09:00:00",
  },
  {
    id: "rpt-3",
    studentId: "student-2",
    studentName: "Xiaoming Wang",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    month: "2026-06",
    title: "June Growth Report",
    lessonsCovered:
      "Business small talk, presentation openings, and email phrases from Business Result Intermediate.",
    progressMade:
      "Clearer structure when introducing a topic. More natural use of polite business expressions.",
    areasToWorkOn: "Speaking pace under pressure; reducing filler words (um/uh).",
    nextMonthGoals: "Deliver a 2-minute mini-presentation; practice Q&A follow-ups.",
    overallComment:
      "Xiaoming is focused and professional in every lesson. Great foundation for presentation practice next month.",
    publishedAt: "2026-07-02T10:00:00",
  },
];

const feedbacks: LessonFeedback[] = structuredClone(SEED_FEEDBACK);
const reports: MonthlyGrowthReport[] = structuredClone(SEED_REPORTS);

export function getFeedbacksByStudent(studentId: string) {
  return feedbacks
    .filter((f) => f.studentId === studentId)
    .sort((a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime())
    .map((f) => ({ ...f }));
}

export function getFeedbacksByTeacher(teacherId: string) {
  return feedbacks
    .filter((f) => f.teacherId === teacherId)
    .sort((a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime())
    .map((f) => ({ ...f }));
}

export function getFeedbacksByTeacherMonth(
  teacherId: string,
  month: string,
  studentId?: string
) {
  return getFeedbacksByTeacher(teacherId).filter((f) => {
    const key = f.lessonDate.slice(0, 7);
    if (key !== month) return false;
    if (studentId && studentId !== "all" && f.studentId !== studentId) return false;
    return true;
  });
}

export function getReportsByStudent(studentId: string) {
  return reports
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((r) => ({ ...r }));
}

export function getReportsByTeacher(teacherId: string) {
  return reports
    .filter((r) => r.teacherId === teacherId)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((r) => ({ ...r }));
}

export function getFeedbackByLesson(lessonId: string) {
  return feedbacks.find((f) => f.lessonId === lessonId);
}

export function getLastFeedbackForStudent(studentId: string, beforeIso?: string) {
  const list = getFeedbacksByStudent(studentId);
  if (!beforeIso) return list[0];
  const before = new Date(beforeIso).getTime();
  return list.find((f) => new Date(f.lessonDate).getTime() < before);
}

export function addLessonFeedback(
  input: Omit<LessonFeedback, "id" | "createdAt" | "readAt">
): LessonFeedback {
  const existing = feedbacks.find((f) => f.lessonId === input.lessonId);
  if (existing) {
    Object.assign(existing, input);
    return { ...existing };
  }
  const item: LessonFeedback = {
    ...input,
    id: `fb-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  feedbacks.unshift(item);
  return { ...item };
}

export function addMonthlyReport(
  input: Omit<MonthlyGrowthReport, "id" | "publishedAt" | "readAt">
): MonthlyGrowthReport {
  const dup = reports.find(
    (r) => r.studentId === input.studentId && r.month === input.month && r.teacherId === input.teacherId
  );
  if (dup) {
    Object.assign(dup, input, { publishedAt: new Date().toISOString(), readAt: undefined });
    return { ...dup };
  }
  const item: MonthlyGrowthReport = {
    ...input,
    id: `rpt-${Date.now()}`,
    publishedAt: new Date().toISOString(),
  };
  reports.unshift(item);
  return { ...item };
}

export function markFeedbackRead(id: string) {
  const f = feedbacks.find((x) => x.id === id);
  if (f && !f.readAt) f.readAt = new Date().toISOString();
}

export function markReportRead(id: string) {
  const r = reports.find((x) => x.id === id);
  if (r && !r.readAt) r.readAt = new Date().toISOString();
}

export function countUnreadForStudent(studentId: string) {
  const unreadFb = feedbacks.filter((f) => f.studentId === studentId && !f.readAt).length;
  const unreadRpt = reports.filter((r) => r.studentId === studentId && !r.readAt).length;
  return unreadFb + unreadRpt;
}
