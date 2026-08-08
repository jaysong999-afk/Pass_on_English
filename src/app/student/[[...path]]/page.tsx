import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { defaultLocale, isValidLocale } from "@/lib/i18n/config";

export default async function LegacyStudentRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    cookieLocale && isValidLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const suffix = path.length > 0 ? `/${path.join("/")}` : "";
  redirect(`/${locale}/student${suffix}`);
}
