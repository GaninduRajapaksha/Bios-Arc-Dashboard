export type ImpedanceUnit = "kΩ" | "Ω";

export interface CsvTelemetryPoint {
  ts: number; // Unix timestamp in seconds
  value: number; // Impedance magnitude (in node's unit, default kΩ)
  rawAdc?: number; // RAW ADC count
  dcV?: number; // DC Voltage (V)
  zReal?: number;
  zImag?: number;
  phase?: number;
  tempC?: number;
  freqHz?: number;
}

export interface CsvColumnMapping {
  timeCol: string;
  impedanceCol: string;
  rawAdcCol?: string;
  dcVCol?: string;
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
  headerless: boolean;
  detectedUnit: ImpedanceUnit;
  suggestedMapping: CsvColumnMapping;
}

export interface CsvBuildResult {
  points: CsvTelemetryPoint[];
  skippedRows: number;
  intervalLabel: string;
  unit: ImpedanceUnit;
}

function detectDelimiter(firstLines: string[]): string {
  const sample = firstLines.slice(0, 5).join("\n");
  const pipeCount = (sample.match(/\|/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;

  if (pipeCount >= commaCount && pipeCount >= semiCount && pipeCount >= tabCount && pipeCount > 0) {
    return "|";
  }
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

function looksLikeDataCell(cell: string): boolean {
  const trimmed = cell.trim();
  if (!trimmed) return false;
  // Timestamp like 2026-11-18 15:08:04 or ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true;
  // Numeric or numeric with engineering units (e.g., 732.0, 2.361 V, 28.50 kOhm)
  if (/^-?\d+(\.\d+)?(\s*(v|mv|kv|ohm|kohm|mohm|ω|kω|hz|khz|c|°c))?$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function isHeaderlessRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const dataLikeCount = cells.filter(looksLikeDataCell).length;
  return dataLikeCount >= Math.max(2, Math.ceil(cells.length * 0.6));
}

function inferUnitFromSample(rows: string[][], impIdx: number): ImpedanceUnit {
  if (impIdx < 0) return "kΩ";
  for (const row of rows.slice(0, 15)) {
    const cell = (row[impIdx] ?? "").toLowerCase();
    if (cell.includes("kohm") || cell.includes("kω")) return "kΩ";
    if (cell.includes("ohm") || cell.includes("ω")) return "Ω";
  }
  // Check header or numeric scale
  return "kΩ";
}

function inferHeadersForHeaderless(firstRow: string[]): string[] {
  // Exact 4-column BIOS-ARC logger layout: Time | RAW ADC | DC V | Impedance
  if (firstRow.length === 4) {
    const c1 = firstRow[1]?.toLowerCase() ?? "";
    const c2 = firstRow[2]?.toLowerCase() ?? "";
    const c3 = firstRow[3]?.toLowerCase() ?? "";
    if (
      (c2.includes("v") || Number.parseFloat(c2) < 10) &&
      (c3.includes("ohm") || c3.includes("ω") || !Number.isNaN(Number.parseFloat(c3))) &&
      !c1.includes("ohm")
    ) {
      return ["Time", "RAW ADC", "DC V", "Impedance"];
    }
  }
  return firstRow.map((_, idx) => (idx === 0 ? "Time" : `Column_${idx + 1}`));
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

  if (rawLines.length < 1) {
    throw new Error("CSV contains no data rows.");
  }

  const delimiter = detectDelimiter(rawLines);
  const firstRow = splitCsvLine(rawLines[0], delimiter);
  const headerless = isHeaderlessRow(firstRow);

  let headers: string[];
  let rows: string[][];

  if (headerless) {
    headers = inferHeadersForHeaderless(firstRow);
    rows = rawLines.map((line) => splitCsvLine(line, delimiter));
  } else {
    if (rawLines.length < 2) {
      throw new Error("CSV must include at least one data row below the header.");
    }
    headers = firstRow.map((h, idx) => h || `Column_${idx + 1}`);
    rows = rawLines.slice(1).map((line) => splitCsvLine(line, delimiter));
  }

  const timeCol =
    findBestHeader(headers, [
      "time",
      "recordedat",
      "timestamp",
      "datetime",
      "date",
      "ts",
      "hours",
      "hour",
    ]) ?? headers[0];

  const rawAdcCol = findBestHeader(headers, ["rawadc", "adc", "raw"]);
  const dcVCol = findBestHeader(headers, ["dcv", "dcvoltage", "voltage", "volt", "vdc"]);

  const impedanceCol =
    findBestHeader(headers, [
      "impedance",
      "impedence",
      "zmag",
      "impedancemag",
      "kohm",
      "magnitude",
      "zohm",
      "ohms",
      "ohm",
      "z",
      "value",
      "val",
    ]) ?? headers[headers.length - 1];

  const zRealCol = findBestHeader(headers, ["zreal", "real", "resistance", "r"]);
  const zImagCol = findBestHeader(headers, ["zimag", "imag", "reactance", "jx", "x"]);
  const phaseCol = findBestHeader(headers, ["phase", "theta", "angle", "phaseangle"]);
  const tempCol = findBestHeader(headers, ["tempc", "temp", "temperature"]);
  const freqCol = findBestHeader(headers, ["freqhz", "freq", "frequency"]);

  const impIdx = headers.indexOf(impedanceCol);
  const headerLower = impedanceCol.toLowerCase();
  let detectedUnit: ImpedanceUnit = inferUnitFromSample(rows, impIdx);
  if (headerLower.includes("kohm") || headerLower.includes("kω")) {
    detectedUnit = "kΩ";
  } else if (
    (headerLower.includes("ohm") || headerLower.includes("ω")) &&
    !headerLower.includes("kohm") &&
    !headerLower.includes("kω")
  ) {
    // Verify sample cells don't explicitly say kOhm
    const sampleCell = (rows[0]?.[impIdx] ?? "").toLowerCase();
    detectedUnit = sampleCell.includes("kohm") || sampleCell.includes("kω") ? "kΩ" : "Ω";
  }

  return {
    headers,
    rows,
    delimiter,
    headerless,
    detectedUnit,
    suggestedMapping: {
      timeCol,
      impedanceCol,
      rawAdcCol,
      dcVCol,
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

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    if (num > 1e12) return Math.floor(num / 1000);
    if (num > 1e9) return Math.floor(num);
    return Math.floor(baseAnchorSec + num * 3600);
  }

  // Handle "YYYY-MM-DD HH:mm:ss" reliably across browsers by replacing space with 'T'
  const isoCandidate = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(/\s+/, "T")
    : trimmed;

  const parsedMs = Date.parse(isoCandidate);
  if (!Number.isNaN(parsedMs)) {
    return Math.floor(parsedMs / 1000);
  }

  return null;
}

function parseNumericValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : undefined;
}

function parseImpedanceWithUnit(
  raw: string | undefined,
  targetUnit: ImpedanceUnit
): number | undefined {
  const num = parseNumericValue(raw);
  if (num === undefined) return undefined;
  const lower = (raw ?? "").toLowerCase();

  if (targetUnit === "kΩ") {
    // Convert plain Ohm values into kOhm only if explicitly tagged Ohm (not kOhm)
    if ((lower.includes("ohm") || lower.includes("ω")) && !lower.includes("kohm") && !lower.includes("kω")) {
      return num / 1000;
    }
    return num;
  }

  // targetUnit === "Ω"
  if (lower.includes("kohm") || lower.includes("kω")) {
    return num * 1000;
  }
  return num;
}

export function inferIntervalLabel(points: CsvTelemetryPoint[]): string {
  if (points.length < 2) return "Single sample";
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(points.length, 60); i++) {
    const d = points[i].ts - points[i - 1].ts;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return "Custom interval";
  diffs.sort((a, b) => a - b);
  const medianSec = diffs[Math.floor(diffs.length / 2)];
  if (medianSec < 60) return `${medianSec}s interval`;
  if (medianSec < 3600) return `${Math.round(medianSec / 60)}m interval`;
  const hours = medianSec / 3600;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours}h interval` : `${hours.toFixed(1)}h interval`;
  }
  return `${(hours / 24).toFixed(1)}d interval`;
}

export function mergeTelemetryPoints(
  existing: CsvTelemetryPoint[],
  incoming: CsvTelemetryPoint[]
): CsvTelemetryPoint[] {
  const byTs = new Map<number, CsvTelemetryPoint>();
  for (const pt of existing) {
    byTs.set(pt.ts, pt);
  }
  for (const pt of incoming) {
    byTs.set(pt.ts, pt);
  }
  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
}

export function buildPointsFromCsv(
  headers: string[],
  rows: string[][],
  mapping: CsvColumnMapping,
  targetUnit: ImpedanceUnit = "kΩ"
): CsvBuildResult {
  const timeIdx = headers.indexOf(mapping.timeCol);
  const impIdx = headers.indexOf(mapping.impedanceCol);

  if (timeIdx === -1 || impIdx === -1) {
    throw new Error("Please select valid Time and Impedance columns.");
  }

  const rawAdcIdx = mapping.rawAdcCol ? headers.indexOf(mapping.rawAdcCol) : -1;
  const dcVIdx = mapping.dcVCol ? headers.indexOf(mapping.dcVCol) : -1;
  const zRealIdx = mapping.zRealCol ? headers.indexOf(mapping.zRealCol) : -1;
  const zImagIdx = mapping.zImagCol ? headers.indexOf(mapping.zImagCol) : -1;
  const phaseIdx = mapping.phaseCol ? headers.indexOf(mapping.phaseCol) : -1;
  const tempIdx = mapping.tempCol ? headers.indexOf(mapping.tempCol) : -1;
  const freqIdx = mapping.freqCol ? headers.indexOf(mapping.freqCol) : -1;

  const baseAnchorSec = Math.floor(Date.now() / 1000) - rows.length * 2 * 3600;

  const byTs = new Map<number, CsvTelemetryPoint>();
  let skippedRows = 0;

  for (const row of rows) {
    const ts = parseTimestampValue(row[timeIdx] ?? "", baseAnchorSec);
    const val = parseImpedanceWithUnit(row[impIdx], targetUnit);
    if (ts === null || val === undefined) {
      skippedRows++;
      continue;
    }

    byTs.set(ts, {
      ts,
      value: parseFloat(val.toFixed(3)),
      rawAdc: rawAdcIdx >= 0 ? parseNumericValue(row[rawAdcIdx]) : undefined,
      dcV: dcVIdx >= 0 ? parseNumericValue(row[dcVIdx]) : undefined,
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
    unit: targetUnit,
  };
}

function formatLocalTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function serializePointsToCsv(
  points: CsvTelemetryPoint[],
  unit: ImpedanceUnit = "kΩ"
): string {
  const unitText = unit === "kΩ" ? "kOhm" : "Ohm";
  const lines = points.map((p) => {
    const t = formatLocalTimestamp(p.ts);
    const adc = (p.rawAdc ?? Math.round(p.value * 24.5)).toFixed(1).padStart(7, " ");
    const v = `${(p.dcV ?? p.value * 0.08).toFixed(3)} V`.padStart(9, " ");
    const imp = `${p.value.toFixed(2)} ${unitText}`;
    return `${t}    | ${adc} | ${v} | ${imp}`;
  });
  return lines.join("\n");
}
