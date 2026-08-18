import { NextResponse } from "next/server";
import { ensureAccountSession, updateAccountProfile } from "@/lib/account-store";
import type { CountryCode } from "@/types";

const VALID_COUNTRIES: CountryCode[] = ["KR", "CN", "PH", "OTHER"];

export async function PATCH(request: Request) {
  const current = await ensureAccountSession();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const phone = String(body?.phone ?? current.account.phone).trim();
  const country = String(body?.country ?? current.account.country) as CountryCode;
  const requestedLearners = Array.isArray(body?.learners) ? body.learners : [];
  if (!phone) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (phone.length > 30 || !VALID_COUNTRIES.includes(country)) {
    return NextResponse.json({ error: "invalid_length" }, { status: 400 });
  }

  const ownedLearners = new Map(current.learners.map((learner) => [learner.id, learner]));
  const parsedLearners = requestedLearners.map((item: unknown) => {
      const value = item as { id?: unknown; englishName?: unknown; videoPlatforms?: unknown };
      return {
        id: String(value.id ?? ""),
        englishName: value.englishName == null ? undefined : String(value.englishName).trim(),
        videoPlatforms: Array.isArray(value.videoPlatforms) ? value.videoPlatforms : undefined,
      };
    });
  if (parsedLearners.some((item: { id: string; englishName?: string; videoPlatforms?: unknown[] }) =>
    !ownedLearners.has(item.id) || (item.englishName !== undefined && (!item.englishName || item.englishName.length > 80)) || (item.videoPlatforms !== undefined && (item.videoPlatforms.length === 0 || !item.videoPlatforms.every((platform: unknown) => platform === "ZOOM" || platform === "VOOV")))
  )) {
    return NextResponse.json({ error: "invalid_learner" }, { status: 400 });
  }
  const learnerChanges = parsedLearners
    .filter((item: { id: string; englishName?: string; videoPlatforms?: unknown[] }) => {
      const learner = ownedLearners.get(item.id);
      return learner && (item.englishName !== learner.englishName || JSON.stringify(item.videoPlatforms ?? learner.videoPlatforms) !== JSON.stringify(learner.videoPlatforms));
    });

  if (current.account.accountType !== "guardian" && learnerChanges.some((item: { id: string; englishName?: string }) => {
    const learner = ownedLearners.get(item.id);
    return item.englishName !== undefined && item.englishName !== learner?.englishName;
  })) {
    return NextResponse.json({ error: "invalid_learner" }, { status: 400 });
  }

  try {
    const session = await updateAccountProfile({
      ...(phone !== current.account.phone ? { phone } : {}),
      ...(country !== current.account.country ? { country } : {}),
      ...(learnerChanges.length > 0 ? { learners: learnerChanges } : {}),
    });
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ account: session.account, learners: session.learners });
  } catch (error) {
    console.error("[student/settings/profile PATCH]", error);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }
}
