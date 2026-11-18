#!/usr/bin/env node
/**
 * BIOS-ARC Root Entry Point
 * Allows running `node .` or `node index.js` directly to start the Next.js telemetry server.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("==========================================");
console.log("  BIOS-ARC Telemetry Platform Initializer  ");
console.log("==========================================");

// Check for build artifact (.next)
const nextDir = path.join(__dirname, ".next");
const hasBuild = fs.existsSync(nextDir);

const script = hasBuild && process.env.NODE_ENV === "production" ? "start" : "dev";
console.log(`Starting Next.js in [${script}] mode...`);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npx, ["next", script], {
  cwd: __dirname,
  stdio: "inherit",
  shell: true,
});

child.on("error", (err) => {
  console.error("Failed to start BIOS-ARC server:", err);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code || 0);
});
