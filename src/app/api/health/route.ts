import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status:  "ok",
    service: "BIOS-ARC Telemetry API",
    version: "1.0.0",
    db:      process.env.DATABASE_URL ? "configured" : "not configured",
    ts:      new Date().toISOString(),
  });
}
