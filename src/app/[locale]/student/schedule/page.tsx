import { redirect } from "next/navigation";

export default async function StudentScheduleRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/student`);
}
