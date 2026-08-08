import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EnrollmentFlow } from "@/components/student/EnrollmentFlow";
import { Button } from "@/components/ui/button";
import { studentPath } from "@/lib/student-paths";
import { getEnrollment } from "@/lib/mock-data";
import { getPublicTeachers } from "@/lib/teacher-profile-store";

export default async function RenewEnrollmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("studentPortal.enrollment");
  const enrollment = getEnrollment(id);

  if (!enrollment) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-muted">{t("notFound")}</p>
        <Button asChild className="mt-4">
          <Link href={studentPath(locale, "enrollment")}>{t("goBack")}</Link>
        </Button>
      </div>
    );
  }

  return <EnrollmentFlow mode="renew" teachers={getPublicTeachers()} enrollment={enrollment} />;
}
