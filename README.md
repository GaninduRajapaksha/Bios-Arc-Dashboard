# BIOS-ARC

> Bioimpedance Telemetry Platform — ESP32 → Neon DB → TradingView-style Dashboard

## Architecture

```
ESP32 Nodes (2h intervals)
        │
        ▼ POST /api/telemetry
Next.js 15 App Router
        │
        ▼ @neondatabase/serverless (HTTP)
Neon Postgres (little-lab-86635017 / production)
        │
        ▼ Drizzle ORM
  tables: nodes, telemetry, alerts
        │
        ▼ GET /api/telemetry?nodeId=&range=
Lightweight Charts (TradingView-style)
        │
        ▼ Interactive Dashboard
```

## Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 15 (App Router, TypeScript) |
| Database    | Neon Serverless Postgres            |
| ORM         | Drizzle ORM                         |
| Charts      | Lightweight Charts v4 (TradingView) |
| Styling     | Tailwind CSS v3 (dark BIOS-ARC theme)|
| Date utils  | date-fns v4                         |

## Setup

### 1. Prerequisites
- Node.js 20+
- Neon account with project `little-lab-86635017`

### 2. Environment Variables

```bash
# Copy the example and fill in your Neon credentials
cp .env.local.example .env.local
```

After running `neon deploy`, `.env.local` is auto-populated with:
- `DATABASE_URL` — pooled connection string (HTTP)
- `DATABASE_URL_UNPOOLED` — direct connection (for migrations)

### 3. Install

```bash
npm install
```

### 4. Neon CLI Setup

```bash
# Initialize project (already done — config saved to .neon/)
npx neon@latest init -y \
  --org-id org-solitary-wildflower-16531485 \
  --project-id little-lab-86635017 \
  --branch production

# Deploy and populate .env.local
npx neon@latest deploy
```

### 5. Database Migration & Seed

```bash
# Generate migrations from schema
npx drizzle-kit generate

# Apply migrations
npm run db:migrate

# Seed with 30 days of realistic ESP32 telemetry
npm run db:seed
```

### 6. Run

```bash
npm run dev    # http://localhost:3000
npm run build  # Production build
npm start      # Serve production build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/nodes` | List all ESP32 nodes |
| GET | `/api/telemetry?nodeId=esp32-01&range=24H` | Fetch time-series data |
| GET | `/api/telemetry?nodeId=esp32-01&range=custom&from=2026-11-01&to=2026-11-15` | Custom range |
| POST | `/api/telemetry` | Ingest new reading from ESP32 |

### ESP32 Ingest Payload (POST /api/telemetry)
```json
{
  "nodeId":     "esp32-01",
  "recordedAt": "2026-11-17T10:00:00Z",
  "zMag":       482.35,
  "zReal":      479.1,
  "zImag":      -52.4,
  "phase":      -6.24,
  "freqHz":     50000,
  "tempC":      36.7
}
```

## Schema

### `telemetry`
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `node_id` | VARCHAR(64) | ESP32 identifier |
| `recorded_at` | TIMESTAMPTZ | Measurement timestamp |
| `z_mag` | REAL | Impedance magnitude \|Z\| [Ω] |
| `z_real` | REAL | Real (resistive) component [Ω] |
| `z_imag` | REAL | Imaginary (reactive) component [Ω] |
| `phase` | REAL | Phase angle [°] |
| `freq_hz` | INTEGER | Excitation frequency [Hz] |
| `temp_c` | REAL | Ambient temperature [°C] |

## Chart Features

- **TradingView-style** area chart with Lightweight Charts v4
- **Timeframe selectors**: 24H · 7D · 30D · Custom
- **Interactive**: scroll zoom, pinch, pan, scrub
- **Crosshair tooltip**: |Z|, R, jX, φ at hover point  
- **Statistics bar**: samples, min, max, avg |Z|
- **Live indicator**: pulsing node status dot
- **Dark theme**: full BIOS-ARC colour palette
