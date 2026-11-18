import {
  buildPointsFromCsv,
  parseCsvText,
  serializePointsToCsv,
  type CsvTelemetryPoint,
  type ImpedanceUnit,
} from "./csvParser";
import { detectPatternsForNode, type IdentifiedPattern } from "./patternEngine";

export interface TreeGroup {
  id: string;
  name: string;
  species: string;
  notes: string;
  isExpanded: boolean;
  createdAt: string;
}

export interface SensorNode {
  id: string;
  treeId: string;
  name: string;
  location: string;
  firmware: string;
  csvFileName: string;
  intervalLabel: string;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  updatedAt: string;
}

export interface BiosarcWorkspaceState {
  version: number;
  trees: TreeGroup[];
  nodes: SensorNode[];
  patterns: IdentifiedPattern[];
  activeNodeId: string | null;
}

const STORAGE_KEY = "biosarc_workspace_v2";
export const ATTACHED_CSV_ASSET_PATH = "/assets/aistudio/dawal_loku_gaha_ca74c983.csv";

function generateRealisticLoggerSeries(params: {
  daysBack: number;
  baseZ: number; // in kΩ
  seedOffset: number;
  includeSpikeAt?: number;
  includeDropAt?: number;
  includeDriftFrom?: number;
  includeOscAt?: number;
}): CsvTelemetryPoint[] {
  const points: CsvTelemetryPoint[] = [];
  const intervalSec = 2 * 3600; // 2-hour intervals
  const totalPoints = params.daysBack * 12;
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = nowSec - (nowSec % intervalSec);

  for (let i = 0; i < totalPoints; i++) {
    const progress = i / totalPoints;
    const ts = endSec - (totalPoints - 1 - i) * intervalSec;
    const hour = new Date(ts * 1000).getHours();

    const diurnal = Math.sin(((hour - 6) * Math.PI) / 12) * 0.9;
    const noise = Math.sin(i * 1.47 + params.seedOffset) * 0.22 + Math.cos(i * 0.63) * 0.14;
    let z = params.baseZ + diurnal + noise;

    if (params.includeSpikeAt !== undefined) {
      const dist = (progress - params.includeSpikeAt) * totalPoints;
      if (Math.abs(dist) < 5) {
        z += 4.2 * Math.exp(-(dist * dist) / 4.5);
      }
    }

    if (params.includeDropAt !== undefined) {
      const dist = (progress - params.includeDropAt) * totalPoints;
      if (Math.abs(dist) < 5.5) {
        z -= 4.6 * Math.exp(-(dist * dist) / 5.2);
      }
    }

    if (params.includeDriftFrom !== undefined && progress > params.includeDriftFrom) {
      const driftProgress = (progress - params.includeDriftFrom) / (1 - params.includeDriftFrom);
      z += Math.min(1, driftProgress * 1.5) * 3.1;
    }

    if (params.includeOscAt !== undefined && Math.abs(progress - params.includeOscAt) < 0.08) {
      z += Math.sin(i * 2.4) * 1.9;
    }

    const zKOhm = Math.max(8.0, z);
    // Realistic relationship matching 732..746 ADC <-> 2.361..2.406 V <-> 28.50..30.51 kOhm
    const dcV = Math.min(3.25, Math.max(0.5, 2.04 + (zKOhm - 20.0) * 0.036));
    const rawAdc = (dcV / 3.3) * 1023;

    points.push({
      ts,
      value: parseFloat(zKOhm.toFixed(2)),
      rawAdc: parseFloat(rawAdc.toFixed(1)),
      dcV: parseFloat(dcV.toFixed(3)),
    });
  }

  return points;
}

export function createInitialWorkspace(): BiosarcWorkspaceState {
  const nowIso = new Date().toISOString();

  const trees: TreeGroup[] = [
    {
      id: "tree-dawal-01",
      name: "Dawal Loku Gaha",
      species: "Field Logger Tree #1",
      notes: "Pipe-delimited ESP32 logger (Time | RAW ADC | DC V | Impedance kΩ)",
      isExpanded: true,
      createdAt: nowIso,
    },
    {
      id: "tree-citrus-02",
      name: "Citrus Plot Beta",
      species: "Citrus sinensis",
      notes: "Greenhouse Bay B · 2-hour continuous impedance monitoring",
      isExpanded: true,
      createdAt: nowIso,
    },
  ];

  const nodes: SensorNode[] = [
    {
      id: "node-dawal-01",
      treeId: "tree-dawal-01",
      name: "Dawal_Node_01",
      location: "Lower Trunk",
      firmware: "v2.4.1",
      csvFileName: "dawal_loku_gaha_ca74c983.csv",
      intervalLabel: "2s interval",
      unit: "kΩ",
      points: generateRealisticLoggerSeries({
        daysBack: 14,
        baseZ: 28.5,
        seedOffset: 1.0,
        includeDriftFrom: 0.45,
        includeSpikeAt: 0.72,
      }),
      updatedAt: nowIso,
    },
    {
      id: "node-dawal-02",
      treeId: "tree-dawal-01",
      name: "Dawal_Node_02",
      location: "Upper Canopy",
      firmware: "v2.4.1",
      csvFileName: "dawal_canopy_30d.csv",
      intervalLabel: "2h interval",
      unit: "kΩ",
      points: generateRealisticLoggerSeries({
        daysBack: 30,
        baseZ: 29.4,
        seedOffset: 2.3,
        includeDropAt: 0.31,
        includeDriftFrom: 0.68,
        includeOscAt: 0.16,
      }),
      updatedAt: nowIso,
    },
    {
      id: "node-esp32-03",
      treeId: "tree-citrus-02",
      name: "Node_ESP32_03",
      location: "Primary Branch",
      firmware: "v2.4.1",
      csvFileName: "citrus_branch_30d.csv",
      intervalLabel: "2h interval",
      unit: "kΩ",
      points: generateRealisticLoggerSeries({
        daysBack: 30,
        baseZ: 31.2,
        seedOffset: 3.7,
        includeSpikeAt: 0.42,
        includeDropAt: 0.65,
        includeOscAt: 0.85,
      }),
      updatedAt: nowIso,
    },
    {
      id: "node-esp32-04",
      treeId: "tree-citrus-02",
      name: "Node_ESP32_04",
      location: "Root Crown",
      firmware: "v2.3.9",
      csvFileName: "citrus_root_14d.csv",
      intervalLabel: "2h interval",
      unit: "kΩ",
      points: generateRealisticLoggerSeries({
        daysBack: 14,
        baseZ: 26.8,
        seedOffset: 4.9,
        includeDropAt: 0.48,
        includeSpikeAt: 0.78,
      }),
      updatedAt: nowIso,
    },
  ];

  const patterns: IdentifiedPattern[] = nodes.flatMap((n) =>
    detectPatternsForNode(n.id, n.points, n.unit)
  );

  return {
    version: 2,
    trees,
    nodes,
    patterns,
    activeNodeId: nodes[0].id,
  };
}

export function hasSavedWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(STORAGE_KEY));
}

export async function hydrateDefaultNodeFromAttachedCsv(
  workspace: BiosarcWorkspaceState
): Promise<BiosarcWorkspaceState> {
  try {
    const res = await fetch(ATTACHED_CSV_ASSET_PATH);
    if (!res.ok) return workspace;
    const text = await res.text();
    const preview = parseCsvText(text);
    const built = buildPointsFromCsv(
      preview.headers,
      preview.rows,
      preview.suggestedMapping,
      preview.detectedUnit
    );
    const targetNodeId = "node-dawal-01";
    const updatedNodes = workspace.nodes.map((n) =>
      n.id === targetNodeId
        ? {
            ...n,
            csvFileName: "dawal_loku_gaha_ca74c983.csv",
            intervalLabel: built.intervalLabel,
            unit: built.unit,
            points: built.points,
            updatedAt: new Date().toISOString(),
          }
        : n
    );
    const freshPatterns = detectPatternsForNode(targetNodeId, built.points, built.unit);
    const next: BiosarcWorkspaceState = {
      ...workspace,
      nodes: updatedNodes,
      patterns: [
        ...workspace.patterns.filter((p) => p.nodeId !== targetNodeId),
        ...freshPatterns,
      ],
    };
    saveWorkspace(next);
    return next;
  } catch {
    return workspace;
  }
}

export function loadWorkspace(): BiosarcWorkspaceState {
  if (typeof window === "undefined") {
    return createInitialWorkspace();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createInitialWorkspace();
      saveWorkspace(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as BiosarcWorkspaceState;
    if (!parsed || !Array.isArray(parsed.trees) || !Array.isArray(parsed.nodes)) {
      throw new Error("Invalid workspace shape");
    }
    return parsed;
  } catch {
    const seeded = createInitialWorkspace();
    saveWorkspace(seeded);
    return seeded;
  }
}

export function saveWorkspace(state: BiosarcWorkspaceState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[BIOS-ARC] Failed to persist workspace to localStorage:", err);
  }
}

export function resetWorkspace(): BiosarcWorkspaceState {
  const seeded = createInitialWorkspace();
  saveWorkspace(seeded);
  return seeded;
}

export function generateSampleCsvDownload(): string {
  const pts = generateRealisticLoggerSeries({
    daysBack: 7,
    baseZ: 28.5,
    seedOffset: 7.4,
    includeDropAt: 0.35,
    includeSpikeAt: 0.65,
    includeDriftFrom: 0.75,
  });
  return serializePointsToCsv(pts, "kΩ");
}
