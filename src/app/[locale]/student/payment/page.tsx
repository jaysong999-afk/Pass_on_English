import { redirect } from "next/navigation";

export default async function StudentPaymentRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/student/enrollment?tab=payment`);
}
