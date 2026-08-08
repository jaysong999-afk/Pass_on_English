import { redirect } from "next/navigation";

export default async function StudentLessonRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect(`/${locale}/student?lesson=${id}`);
}
