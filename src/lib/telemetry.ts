import { db, isDbConfigured } from "@/lib/db/client";
import { telemetry } from "@/lib/db/schema";
import { and, gte, lte, eq, desc, asc } from "drizzle-orm";
import { subDays, subHours } from "date-fns";

export type TimeRange = "24H" | "7D" | "30D" | "custom";

export interface TelemetryPoint {
  ts:    number; // Unix timestamp (seconds) for Lightweight Charts
  value: number; // z_mag (impedance magnitude)
  zReal?: number;
  zImag?: number;
  phase?: number;
}

export interface TelemetryQueryOptions {
  nodeId:    string;
  range:     TimeRange;
  from?:     Date;
  to?:       Date;
  metric?:   "z_mag" | "z_real" | "z_imag" | "phase";
}

interface MockReading {
  id: number;
  nodeId: string;
  recordedAt: Date;
  zMag: number;
  zReal: number;
  zImag: number;
  phase: number;
  freqHz: number;
  tempC: number;
  rawJson: string | null;
}

const mockTelemetryStore = new Map<string, MockReading[]>();
let mockIdSeq = 1;

function ensureMockReadings(nodeId: string): MockReading[] {
  const existing = mockTelemetryStore.get(nodeId);
  if (existing) return existing;

  const readings: MockReading[] = [];
  const now = new Date();
  const intervalMs = 2 * 60 * 60 * 1000; // 2 hours
  const totalPoints = 30 * 12; // 30 days × 12 readings/day
  const baseZ = ({ "esp32-01": 450, "esp32-02": 520, "esp32-03": 390 } as Record<string, number>)[nodeId] ?? 480;

  for (let i = 0; i < totalPoints; i++) {
    const recordedAt = new Date(now.getTime() - (totalPoints - i) * intervalMs);
    const hour = recordedAt.getHours();
    const diurnal = Math.sin(((hour - 6) * Math.PI) / 12) * 20;
    const trend = (i / totalPoints) * 15;
    const pseudoNoise = Math.sin(i * 1.7 + baseZ) * 4;
    const zMag = Math.abs(baseZ + diurnal + trend + pseudoNoise);
    const phase = -20 + Math.cos(i * 0.9 + baseZ) * 2;
    const zReal = zMag * Math.cos((phase * Math.PI) / 180);
    const zImag = zMag * Math.sin((phase * Math.PI) / 180);

    readings.push({
      id: mockIdSeq++,
      nodeId,
      recordedAt,
      zMag: parseFloat(zMag.toFixed(3)),
      zReal: parseFloat(zReal.toFixed(3)),
      zImag: parseFloat(zImag.toFixed(3)),
      phase: parseFloat(phase.toFixed(3)),
      freqHz: 50000,
      tempC: parseFloat((36.5 + Math.sin(i * 0.5) * 0.7).toFixed(2)),
      rawJson: null,
    });
  }

  mockTelemetryStore.set(nodeId, readings);
  return readings;
}

function getRangeDates(range: TimeRange, from?: Date, to?: Date) {
  const now = new Date();
  switch (range) {
    case "24H": return { from: subHours(now, 24), to: now };
    case "7D":  return { from: subDays(now, 7),   to: now };
    case "30D": return { from: subDays(now, 30),  to: now };
    case "custom":
      if (!from || !to) throw new Error("custom range requires from and to dates");
      return { from, to };
  }
}

export async function getTelemetry(
  opts: TelemetryQueryOptions
): Promise<TelemetryPoint[]> {
  const { from: start, to: end } = getRangeDates(opts.range, opts.from, opts.to);

  if (isDbConfigured) {
    try {
      const rows = await db
        .select({
          recordedAt: telemetry.recordedAt,
          zMag:       telemetry.zMag,
          zReal:      telemetry.zReal,
          zImag:      telemetry.zImag,
          phase:      telemetry.phase,
        })
        .from(telemetry)
        .where(
          and(
            eq(telemetry.nodeId, opts.nodeId),
            gte(telemetry.recordedAt, start),
            lte(telemetry.recordedAt, end)
          )
        )
        .orderBy(asc(telemetry.recordedAt))
        .limit(5000);

      return rows.map((r: { recordedAt: Date; zMag: number; zReal: number | null; zImag: number | null; phase: number | null }) => ({
        ts:    Math.floor(r.recordedAt.getTime() / 1000),
        value: r.zMag,
        zReal: r.zReal ?? undefined,
        zImag: r.zImag ?? undefined,
        phase: r.phase ?? undefined,
      }));
    } catch (err) {
      console.warn("[AI Studio] DB query failed, falling back to mock telemetry:", err);
    }
  }

  const readings = ensureMockReadings(opts.nodeId)
    .filter((r) => r.recordedAt >= start && r.recordedAt <= end)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .slice(0, 5000);

  return readings.map((r) => ({
    ts: Math.floor(r.recordedAt.getTime() / 1000),
    value: r.zMag,
    zReal: r.zReal,
    zImag: r.zImag,
    phase: r.phase,
  }));
}

export async function getLatestReading(nodeId: string) {
  if (isDbConfigured) {
    try {
      const [row] = await db
        .select()
        .from(telemetry)
        .where(eq(telemetry.nodeId, nodeId))
        .orderBy(desc(telemetry.recordedAt))
        .limit(1);
      return row ?? null;
    } catch (err) {
      console.warn("[AI Studio] DB query failed, falling back to mock reading:", err);
    }
  }

  const readings = ensureMockReadings(nodeId);
  return readings[readings.length - 1] ?? null;
}

export async function insertTelemetry(readings: {
  nodeId:     string;
  recordedAt: Date;
  zMag:       number;
  zReal?:     number;
  zImag?:     number;
  phase?:     number;
  freqHz?:    number;
  tempC?:     number;
}[]) {
  if (isDbConfigured) {
    try {
      return await db.insert(telemetry).values(readings).returning();
    } catch (err) {
      console.warn("[AI Studio] DB insert failed, using in-memory store:", err);
    }
  }

  const inserted: MockReading[] = readings.map((r) => {
    const entry: MockReading = {
      id: mockIdSeq++,
      nodeId: r.nodeId,
      recordedAt: r.recordedAt,
      zMag: r.zMag,
      zReal: r.zReal ?? r.zMag,
      zImag: r.zImag ?? 0,
      phase: r.phase ?? 0,
      freqHz: r.freqHz ?? 50000,
      tempC: r.tempC ?? 36.5,
      rawJson: null,
    };
    const list = ensureMockReadings(r.nodeId);
    list.push(entry);
    return entry;
  });

  return inserted;
}
