import { NextResponse } from "next/server";
import { addLearner, getAccountSession } from "@/lib/account-store";
import { learnerToLegacyProfile } from "@/lib/student-profile-store";

export async function POST(request: Request) {
  const body = await request.json();

  const fullName = String(body.fullName ?? "").trim();
  const englishName = String(body.englishName ?? "").trim();
  const dateOfBirth = String(body.dateOfBirth ?? "").trim();

  if (!fullName || !englishName || !dateOfBirth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const learner = addLearner({ fullName, englishName, dateOfBirth });

  return NextResponse.json(
    {
      learner,
      session: getAccountSession(),
      legacyProfile: learnerToLegacyProfile(learner),
    },
    { status: 201 }
  );
}
