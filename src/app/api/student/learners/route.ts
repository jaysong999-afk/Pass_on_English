import { NextResponse } from "next/server";
import { addLearner, ensureAccountSession, getAccountSession } from "@/lib/account-store";
import { learnerToLegacyProfile } from "@/lib/student-profile-store";

export async function POST(request: Request) {
  try {
    const sessionLoaded = await ensureAccountSession();
    if (!sessionLoaded) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const fullName = String(body.fullName ?? "").trim();
    const englishName = String(body.englishName ?? "").trim();
    const dateOfBirth = String(body.dateOfBirth ?? "").trim();

    if (!fullName || !englishName || !dateOfBirth) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const learner = await addLearner({ fullName, englishName, dateOfBirth });

    return NextResponse.json(
      {
        learner,
        session: getAccountSession(),
        legacyProfile: learnerToLegacyProfile(learner),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[student/learners POST]", error);
    return NextResponse.json({ error: "learner_create_failed" }, { status: 500 });
  }
}
