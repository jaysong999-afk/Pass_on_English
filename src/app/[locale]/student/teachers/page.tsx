import { redirect } from "next/navigation";

export default async function StudentTeachersRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/student/enrollment`);
}
