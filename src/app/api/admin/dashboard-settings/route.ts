import { NextResponse } from "next/server";
import {
  getDashboardSlogan,
  setDashboardSlogan,
} from "@/lib/admin/dashboard-settings-store";

export async function GET() {
  return NextResponse.json({ slogan: getDashboardSlogan() });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const slogan = setDashboardSlogan(String(body.slogan ?? ""));
    return NextResponse.json({ slogan });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
