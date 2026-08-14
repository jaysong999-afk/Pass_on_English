import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";

export async function GET() {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: context.userId,
      email: context.email,
    },
    profile: context.profile,
  });
}
