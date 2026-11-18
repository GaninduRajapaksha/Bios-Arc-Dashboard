import { NextRequest, NextResponse } from "next/server";
import { getTelemetry, TimeRange } from "@/lib/telemetry";

// GET /api/telemetry?nodeId=esp32-01&range=24H
// GET /api/telemetry?nodeId=esp32-01&range=custom&from=2026-11-01&to=2026-11-15
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const nodeId = searchParams.get("nodeId");
    const range  = (searchParams.get("range") ?? "24H") as TimeRange;
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
    }

    const from = fromStr ? new Date(fromStr) : undefined;
    const to   = toStr   ? new Date(toStr)   : undefined;

    const data = await getTelemetry({ nodeId, range, from, to });

    return NextResponse.json({ nodeId, range, count: data.length, data }, {
      headers: {
        // Allow browser to cache for 60s; Neon data is polled every 2h anyway
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err: unknown) {
    console.error("[/api/telemetry] Error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/telemetry  — ingest a new ESP32 reading
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId, recordedAt, zMag, zReal, zImag, phase, freqHz, tempC } = body;

    if (!nodeId || !zMag) {
      return NextResponse.json(
        { error: "nodeId and zMag are required" },
        { status: 400 }
      );
    }

    const { insertTelemetry } = await import("@/lib/telemetry");
    const inserted = await insertTelemetry([{
      nodeId,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      zMag,
      zReal,
      zImag,
      phase,
      freqHz,
      tempC,
    }]);

    return NextResponse.json({ inserted: inserted[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error("[POST /api/telemetry] Error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
