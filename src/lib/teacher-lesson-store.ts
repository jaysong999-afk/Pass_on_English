export {
  getAllLessons,
  getTeacherLessons,
  getStudentLessons,
  getLessonById,
  updateLessonStatus,
  updateLessonSchedule,
  replaceLesson,
  pushLesson,
  deleteLessonById,
  removeFutureScheduledLessonsForEnrollment,
  getLessonsAssignedToTeacher,
  completeLesson,
  completeLessonAsStudentAbsent,
  createTrialLesson,
  getLessonEndTime,
  isLessonEnded,
  lessonNeedsFeedback,
  getNextLesson,
  getTodayLessons,
  getActionRequiredLessons,
  resetTeacherLessonStore,
} from "@/lib/teacher-lesson-store-sync";

export type { CreateTrialLessonInput } from "@/lib/teacher-lesson-store-sync";

export const DEMO_LESSON_IDS = {
  noShowDone: "lesson-demo-noshow-done",
  noShowTarget: "lesson-demo-noshow-target",
  active: "lesson-demo-active-2",
  noShowMakeup: "lesson-demo-noshow-makeup",
} as const;
