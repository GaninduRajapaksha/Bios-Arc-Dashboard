export interface CsvTelemetryPoint {
  ts: number; // Unix timestamp in seconds
  value: number; // |Z| impedance magnitude in Ohms
  zReal?: number;
  zImag?: number;
  phase?: number;
  tempC?: number;
  freqHz?: number;
}

export interface CsvColumnMapping {
  timeCol: string;
  impedanceCol: string;
  zRealCol?: string;
  zImagCol?: string;
  phaseCol?: string;
  tempCol?: string;
  freqCol?: string;
}

export interface ParsedCsvPreview {
  headers: string[];
  rows: string[][];
  delimiter: string;
  suggestedMapping: CsvColumnMapping;
}

export interface CsvBuildResult {
  points: CsvTelemetryPoint[];
  skippedRows: number;
  intervalLabel: string;
}

function detectDelimiter(firstLines: string[]): string {
  const sample = firstLines.slice(0, 5).join("\n");
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  if (tabCount > commaCount && tabCount >= semiCount) return "\t";
  if (semiCount > commaCount) return ";";
  return ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findBestHeader(headers: string[], candidates: string[]): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  for (const cand of candidates) {
    const exact = normalized.find((h) => h.norm === cand);
    if (exact) return exact.raw;
  }
  for (const cand of candidates) {
    const partial = normalized.find((h) => h.norm.includes(cand));
    if (partial) return partial.raw;
  }
  return undefined;
}

export function parseCsvText(rawText: string): ParsedCsvPreview {
  const clean = rawText.replace(/^\uFEFF/, "").trim();
  if (!clean) {
    throw new Error("CSV file is empty.");
  }

  const rawLines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const delimiter = detectDelimiter(rawLines);
  const headers = splitCsvLine(rawLines[0], delimiter).map((h, idx) =>
    h || `Column_${idx + 1}`
  );
  const rows = rawLines.slice(1).map((line) => splitCsvLine(line, delimiter));

  const timeCol =
    findBestHeader(headers, [
      "recordedat",
      "timestamp",
      "datetime",
      "time",
      "date",
      "ts",
      "hours",
      "hour",
    ]) ?? headers[0];

  const impedanceCol =
    findBestHeader(headers, [
      "zmag",
      "impedance",
      "impedancemag",
      "magnitude",
      "zohm",
      "ohms",
      "ohm",
      "z",
      "value",
      "val",
    ]) ?? (headers[1] || headers[0]);

  const zRealCol = findBestHeader(headers, ["zreal", "real", "resistance", "r"]);
  const zImagCol = findBestHeader(headers, ["zimag", "imag", "reactance", "jx", "x"]);
  const phaseCol = findBestHeader(headers, ["phase", "theta", "angle", "phaseangle"]);
  const tempCol = findBestHeader(headers, ["tempc", "temp", "temperature"]);
  const freqCol = findBestHeader(headers, ["freqhz", "freq", "frequency"]);

  return {
    headers,
    rows,
    delimiter,
    suggestedMapping: {
      timeCol,
      impedanceCol,
      zRealCol,
      zImagCol,
      phaseCol,
      tempCol,
      freqCol,
    },
  };
}

function parseTimestampValue(raw: string, baseAnchorSec: number): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Numeric timestamps: Unix ms, Unix s, or relative hours
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    if (num > 1e12) return Math.floor(num / 1000); // ms -> s
    if (num > 1e9) return Math.floor(num); // unix seconds
    // Treat small positive numbers as hours offset from baseAnchorSec
    return Math.floor(baseAnchorSec + num * 3600);
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) {
    return Math.floor(parsedMs / 1000);
  }

  return null;
}

function parseNumericValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9eE.+\-]/g, "");
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function inferIntervalLabel(points: CsvTelemetryPoint[]): string {
  if (points.length < 2) return "Single sample";
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(points.length, 40); i++) {
    const d = points[i].ts - points[i - 1].ts;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return "Custom interval";
  diffs.sort((a, b) => a - b);
  const medianSec = diffs[Math.floor(diffs.length / 2)];
  if (medianSec < 120) return `${medianSec}s interval`;
  if (medianSec < 3600) return `${Math.round(medianSec / 60)}m interval`;
  const hours = medianSec / 3600;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours}h interval` : `${hours.toFixed(1)}h interval`;
  }
  return `${(hours / 24).toFixed(1)}d interval`;
}

export function buildPointsFromCsv(
  headers: string[],
  rows: string[][],
  mapping: CsvColumnMapping
): CsvBuildResult {
  const timeIdx = headers.indexOf(mapping.timeCol);
  const impIdx = headers.indexOf(mapping.impedanceCol);

  if (timeIdx === -1 || impIdx === -1) {
    throw new Error("Please select valid Time and Impedance columns.");
  }

  const zRealIdx = mapping.zRealCol ? headers.indexOf(mapping.zRealCol) : -1;
  const zImagIdx = mapping.zImagCol ? headers.indexOf(mapping.zImagCol) : -1;
  const phaseIdx = mapping.phaseCol ? headers.indexOf(mapping.phaseCol) : -1;
  const tempIdx = mapping.tempCol ? headers.indexOf(mapping.tempCol) : -1;
  const freqIdx = mapping.freqCol ? headers.indexOf(mapping.freqCol) : -1;

  // Anchor relative hour numbers so the latest reading lands near now
  const baseAnchorSec = Math.floor(Date.now() / 1000) - rows.length * 2 * 3600;

  const byTs = new Map<number, CsvTelemetryPoint>();
  let skippedRows = 0;

  for (const row of rows) {
    const ts = parseTimestampValue(row[timeIdx] ?? "", baseAnchorSec);
    const val = parseNumericValue(row[impIdx]);
    if (ts === null || val === undefined) {
      skippedRows++;
      continue;
    }

    byTs.set(ts, {
      ts,
      value: parseFloat(val.toFixed(3)),
      zReal: zRealIdx >= 0 ? parseNumericValue(row[zRealIdx]) : undefined,
      zImag: zImagIdx >= 0 ? parseNumericValue(row[zImagIdx]) : undefined,
      phase: phaseIdx >= 0 ? parseNumericValue(row[phaseIdx]) : undefined,
      tempC: tempIdx >= 0 ? parseNumericValue(row[tempIdx]) : undefined,
      freqHz: freqIdx >= 0 ? parseNumericValue(row[freqIdx]) : undefined,
    });
  }

  const points = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
  if (points.length === 0) {
    throw new Error("No valid Time + Impedance rows could be parsed from this CSV.");
  }

  return {
    points,
    skippedRows,
    intervalLabel: inferIntervalLabel(points),
  };
}

export function serializePointsToCsv(points: CsvTelemetryPoint[]): string {
  const header = "recorded_at,z_mag,z_real,z_imag,phase,freq_hz,temp_c";
  const lines = points.map((p) =>
    [
      new Date(p.ts * 1000).toISOString(),
      p.value.toFixed(3),
      p.zReal !== undefined ? p.zReal.toFixed(3) : "",
      p.zImag !== undefined ? p.zImag.toFixed(3) : "",
      p.phase !== undefined ? p.phase.toFixed(3) : "",
      p.freqHz !== undefined ? Math.round(p.freqHz).toString() : "",
      p.tempC !== undefined ? p.tempC.toFixed(2) : "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
