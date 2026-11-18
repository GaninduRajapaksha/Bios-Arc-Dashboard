import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  integer,
  index,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// ESP32 Node Registry
// ---------------------------------------------------------------------------
export const nodes = pgTable("nodes", {
  id:          serial("id").primaryKey(),
  nodeId:      varchar("node_id", { length: 64 }).notNull().unique(),
  label:       text("label"),
  location:    text("location"),
  firmware:    varchar("firmware", { length: 32 }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt:  timestamp("last_seen_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Telemetry Readings — 2-hour interval samples from each ESP32 node
// Fields correspond to bio-impedance measurement channels:
//   z_real   = real (resistive) part of impedance [Ω]
//   z_imag   = imaginary (reactive) part [Ω]
//   z_mag    = magnitude |Z| [Ω]
//   phase    = phase angle [°]
//   freq_hz  = excitation frequency [Hz]
//   temp_c   = ambient temperature [°C]
// ---------------------------------------------------------------------------
export const telemetry = pgTable(
  "telemetry",
  {
    id:        serial("id").primaryKey(),
    nodeId:    varchar("node_id", { length: 64 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    zReal:     real("z_real"),
    zImag:     real("z_imag"),
    zMag:      real("z_mag").notNull(),
    phase:     real("phase"),
    freqHz:    integer("freq_hz"),
    tempC:     real("temp_c"),
    rawJson:   text("raw_json"),
  },
  (t) => ({
    nodeTimeIdx: index("telemetry_node_time_idx").on(t.nodeId, t.recordedAt),
    timeIdx:     index("telemetry_time_idx").on(t.recordedAt),
  })
);

// ---------------------------------------------------------------------------
// Alerts — triggered when impedance crosses thresholds
// ---------------------------------------------------------------------------
export const alerts = pgTable("alerts", {
  id:          serial("id").primaryKey(),
  nodeId:      varchar("node_id", { length: 64 }).notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
  level:       varchar("level", { length: 16 }).notNull(), // "warn" | "critical"
  metric:      varchar("metric", { length: 32 }).notNull(),
  value:       real("value").notNull(),
  threshold:   real("threshold").notNull(),
  message:     text("message"),
  resolved:    timestamp("resolved", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------
export type Node       = typeof nodes.$inferSelect;
export type NewNode    = typeof nodes.$inferInsert;
export type Telemetry  = typeof telemetry.$inferSelect;
export type NewTelemetry = typeof telemetry.$inferInsert;
export type Alert      = typeof alerts.$inferSelect;
