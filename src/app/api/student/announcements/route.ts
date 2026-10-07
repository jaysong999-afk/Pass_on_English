import { NextResponse } from "next/server";
import { guardApiRole, isGuardResponse } from "@/lib/auth/api-guard";
import { isValidLocale, type Locale } from "@/lib/i18n/config";
import { listActiveStudentAnnouncementsInDb } from "@/lib/announcements/repository";

function responseHeaders(etag: string) {
  return {
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
    Vary: "Cookie, Authorization",
  };
}

function announcementEtag(items: { id: string; updatedAt: string }[]) {
  const fingerprint = items.map((item) => `${item.id}:${item.updatedAt}`).join("|") || "empty";
  return `W/\"${Buffer.from(fingerprint).toString("base64url")}\"`;
}

export async function GET(request: Request) {
  const guard = await guardApiRole("student");
  if (isGuardResponse(guard)) return guard;

  const localeParam = new URL(request.url).searchParams.get("locale") ?? "ko";
  const locale: Locale = isValidLocale(localeParam) ? localeParam : "ko";

  try {
    const announcements = await listActiveStudentAnnouncementsInDb(locale);
    const etag = announcementEtag(announcements);
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: responseHeaders(etag) });
    }

    return NextResponse.json(
      { announcements },
      { headers: responseHeaders(etag) }
    );
  } catch (error) {
    console.error("[GET /api/student/announcements]", error);
    return NextResponse.json({ error: "announcements_fetch_failed" }, { status: 500 });
  }
}
