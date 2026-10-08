import { redirect } from "next/navigation";

export default async function LegacyTeacherScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/teacher/lessons/${encodeURIComponent(id)}`);
}
