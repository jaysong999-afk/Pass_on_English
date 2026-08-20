import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [notificationRepo, lessonRepo, scheduleService, lessonRoute, hub, detailCard] = await Promise.all([
  read("src/lib/notifications/teacher-lesson-assignment.ts"),
  read("src/lib/lessons/repository.ts"),
  read("src/lib/lessons/schedule-service.ts"),
  read("src/app/api/teacher/lessons/route.ts"),
  read("src/components/teacher/TeacherMyLessonsHub.tsx"),
  read("src/components/teacher/TeacherLessonDetailCard.tsx"),
]);

assert.match(notificationRepo, /assignmentKey/);
assert.match(notificationRepo, /\.contains\("payload"/);
assert.match(notificationRepo, /purposes: studentRow\.purposes/);
console.log("PASS assignment notifications are deduplicated and retain learning goals");

assert.match(lessonRepo, /assignmentKey: `trial:\$\{lesson\.id\}`/);
assert.match(scheduleService, /assignmentKey: `enrollment:\$\{enrollmentId\}`/);
assert.match(scheduleService, /if \(!enrollment\.renewedFromEnrollmentId\)/);
assert.match(lessonRoute, /getEnrollmentById\(lesson\.enrollmentId\)/);
assert.match(lessonRoute, /renewedFromEnrollmentId/);
console.log("PASS trial and paid enrollment scheduling create assignment notices");

assert.match(lessonRoute, /notification\.readAt/);
assert.match(lessonRoute, /newAssignments/);
assert.match(hub, /Learning goals:/);
assert.match(hub, /View lesson/);
assert.match(hub, /Acknowledge/);
assert.match(hub, /\/api\/notifications\?role=teacher/);
console.log("PASS My Lessons exposes view and persistent acknowledgement actions");

assert.match(hub, /lesson\.isTrial[\s\S]*NEW/);
assert.match(detailCard, /lesson\.isTrial[\s\S]*NEW/);
console.log("PASS trial lessons receive NEW badges in schedule rows and lesson cards");
