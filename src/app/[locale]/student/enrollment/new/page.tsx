import { EnrollmentFlow } from "@/components/student/EnrollmentFlow";
import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export default async function NewEnrollmentPage() {
  await ensurePublicContentBootstrapped();
  return <EnrollmentFlow mode="new" teachers={getPublicTeachers()} />;
}
