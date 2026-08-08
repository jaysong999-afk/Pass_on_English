import { EnrollmentFlow } from "@/components/student/EnrollmentFlow";
import { getPublicTeachers } from "@/lib/teacher-profile-store";

export default function NewEnrollmentPage() {
  return <EnrollmentFlow mode="new" teachers={getPublicTeachers()} />;
}
