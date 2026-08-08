import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Pass on English",
    timestamp: new Date().toISOString(),
  });
}
