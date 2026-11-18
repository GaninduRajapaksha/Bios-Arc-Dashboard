#!/usr/bin/env node
/**
 * scripts/migrate.js
 * Applies all pending Drizzle migrations to the Neon database.
 * Usage: node scripts/migrate.js
 */
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");
const { migrate } = require("drizzle-orm/neon-http/migrator");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌  DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  console.log("🔗  Connecting to Neon DB…");
  const sql = neon(url);
  const db  = drizzle(sql);

  console.log("🚀  Running migrations…");
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  console.log("✅  Migrations complete.");
}

main().catch((err) => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
