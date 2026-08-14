import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EnrollmentFlow } from "@/components/student/EnrollmentFlow";
import { Button } from "@/components/ui/button";
import { studentPath } from "@/lib/student-paths";
import { getEnrollmentById } from "@/lib/enrollment-store-sync";
import { decorateEnrollmentRenewal } from "@/lib/enrollments/renewal-window";
import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export default async function RenewEnrollmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("studentPortal.enrollment");
  await ensureSchedulesBootstrapped();
  const enrollment = getEnrollmentById(id);
  const decorated = enrollment ? decorateEnrollmentRenewal(enrollment) : undefined;

  if (!decorated) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-muted">{t("notFound")}</p>
        <Button asChild className="mt-4">
          <Link href={studentPath(locale, "enrollment")}>{t("goBack")}</Link>
        </Button>
      </div>
    );
  }

  return <EnrollmentFlow mode="renew" teachers={getPublicTeachers()} enrollment={decorated} />;
}
