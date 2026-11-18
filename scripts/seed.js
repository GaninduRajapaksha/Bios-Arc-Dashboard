#!/usr/bin/env node
/**
 * scripts/seed.js
 * Populates the Neon DB with realistic ESP32 bio-impedance telemetry data.
 * Generates 30 days × 12 readings/day = 360 data points per node.
 *
 * Usage: node scripts/seed.js
 */
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");
require("dotenv").config({ path: ".env.local" });

const NODES = [
  { nodeId: "esp32-01", label: "Node Alpha",  location: "Chamber A", firmware: "v2.4.1" },
  { nodeId: "esp32-02", label: "Node Beta",   location: "Chamber B", firmware: "v2.4.1" },
  { nodeId: "esp32-03", label: "Node Gamma",  location: "Chamber C", firmware: "v2.3.9" },
];

/** Realistic bio-impedance simulation: 300–700 Ω range with diurnal variation */
function generateReadings(nodeId, daysBack = 30) {
  const readings = [];
  const now     = new Date();
  const intervalMs = 2 * 60 * 60 * 1000; // 2 hours
  const totalPoints = (daysBack * 24 * 60 * 60 * 1000) / intervalMs;

  // Base impedance per node
  const baseZ = { "esp32-01": 450, "esp32-02": 520, "esp32-03": 390 }[nodeId] ?? 480;
  let z = baseZ;

  for (let i = 0; i < totalPoints; i++) {
    const recordedAt = new Date(now.getTime() - (totalPoints - i) * intervalMs);
    const hour = recordedAt.getHours();

    // Diurnal drift (higher overnight, lower midday)
    const diurnal = Math.sin((hour - 6) * Math.PI / 12) * 20;
    // Slow trend over 30 days
    const trend   = (i / totalPoints) * 15;
    // Noise
    const noise   = (Math.random() - 0.5) * 8;

    z = baseZ + diurnal + trend + noise;
    const phase = -20 + (Math.random() - 0.5) * 4;
    const zMag  = Math.abs(z);
    const freqHz = 50000; // 50 kHz standard bioimpedance frequency
    const tempC  = 36.5 + (Math.random() - 0.5) * 1.5;

    readings.push({
      nodeId,
      recordedAt,
      zMag:   parseFloat(zMag.toFixed(3)),
      zReal:  parseFloat((zMag * Math.cos((phase * Math.PI) / 180)).toFixed(3)),
      zImag:  parseFloat((zMag * Math.sin((phase * Math.PI) / 180)).toFixed(3)),
      phase:  parseFloat(phase.toFixed(3)),
      freqHz,
      tempC:  parseFloat(tempC.toFixed(2)),
    });
  }
  return readings;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("❌  DATABASE_URL not set"); process.exit(1); }

  const sql = neon(url);
  const db  = drizzle(sql);

  // Create tables (raw SQL for seed script portability)
  console.log("📐  Ensuring schema exists…");
  await sql`
    CREATE TABLE IF NOT EXISTS nodes (
      id          SERIAL PRIMARY KEY,
      node_id     VARCHAR(64) NOT NULL UNIQUE,
      label       TEXT,
      location    TEXT,
      firmware    VARCHAR(32),
      created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      last_seen_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS telemetry (
      id           SERIAL PRIMARY KEY,
      node_id      VARCHAR(64) NOT NULL,
      recorded_at  TIMESTAMPTZ NOT NULL,
      z_real       REAL,
      z_imag       REAL,
      z_mag        REAL NOT NULL,
      phase        REAL,
      freq_hz      INTEGER,
      temp_c       REAL,
      raw_json     TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS telemetry_node_time_idx ON telemetry (node_id, recorded_at)`;
  await sql`CREATE INDEX IF NOT EXISTS telemetry_time_idx ON telemetry (recorded_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id           SERIAL PRIMARY KEY,
      node_id      VARCHAR(64) NOT NULL,
      triggered_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      level        VARCHAR(16) NOT NULL,
      metric       VARCHAR(32) NOT NULL,
      value        REAL NOT NULL,
      threshold    REAL NOT NULL,
      message      TEXT,
      resolved     TIMESTAMPTZ
    )
  `;

  // Upsert nodes
  for (const node of NODES) {
    await sql`
      INSERT INTO nodes (node_id, label, location, firmware)
      VALUES (${node.nodeId}, ${node.label}, ${node.location}, ${node.firmware})
      ON CONFLICT (node_id) DO UPDATE
        SET label = EXCLUDED.label,
            location = EXCLUDED.location,
            firmware = EXCLUDED.firmware,
            last_seen_at = NOW()
    `;
  }
  console.log(`✅  Upserted ${NODES.length} nodes.`);

  // Seed telemetry (batch insert 100 rows at a time)
  for (const { nodeId } of NODES) {
    const readings = generateReadings(nodeId, 30);
    console.log(`📡  Seeding ${readings.length} readings for ${nodeId}…`);

    // Chunk into batches of 100
    for (let i = 0; i < readings.length; i += 100) {
      const batch = readings.slice(i, i + 100);
      for (const r of batch) {
        await sql`
          INSERT INTO telemetry (node_id, recorded_at, z_mag, z_real, z_imag, phase, freq_hz, temp_c)
          VALUES (${r.nodeId}, ${r.recordedAt.toISOString()}, ${r.zMag}, ${r.zReal}, ${r.zImag}, ${r.phase}, ${r.freqHz}, ${r.tempC})
          ON CONFLICT DO NOTHING
        `;
      }
      process.stdout.write(".");
    }
    console.log(` ✓`);
  }

  console.log("\n🎉  Seed complete! Database is ready.");
}

main().catch((err) => { console.error("❌  Seed failed:", err); process.exit(1); });
