import type { CsvTelemetryPoint } from "./csvParser";
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

const STORAGE_KEY = "biosarc_workspace_v1";

function generateRealisticCsvSeries(params: {
  daysBack: number;
  baseZ: number;
  seedOffset: number;
  includeSpikeAt?: number; // 0..1 progress
  includeDropAt?: number;  // 0..1 progress
  includeDriftFrom?: number; // 0..1 progress
  includeOscAt?: number;   // 0..1 progress
}): CsvTelemetryPoint[] {
  const points: CsvTelemetryPoint[] = [];
  const intervalSec = 2 * 3600; // 2-hour intervals
  const totalPoints = params.daysBack * 12;
  const nowSec = Math.floor(Date.now() / 1000);
  // Align to clean 2-hour boundary
  const endSec = nowSec - (nowSec % intervalSec);

  for (let i = 0; i < totalPoints; i++) {
    const progress = i / totalPoints;
    const ts = endSec - (totalPoints - 1 - i) * intervalSec;
    const hour = new Date(ts * 1000).getHours();

    // Base diurnal hydration cycle
    const diurnal = Math.sin(((hour - 6) * Math.PI) / 12) * 16;
    const noise = Math.sin(i * 1.47 + params.seedOffset) * 3.5 + Math.cos(i * 0.63) * 2.2;
    let z = params.baseZ + diurnal + noise;

    // Sharp impedance spike (thermal / stress shock)
    if (params.includeSpikeAt !== undefined) {
      const dist = (progress - params.includeSpikeAt) * totalPoints;
      if (Math.abs(dist) < 5) {
        z += 85 * Math.exp(-(dist * dist) / 4.5);
      }
    }

    // Sharp impedance drop (irrigation / hydration surge)
    if (params.includeDropAt !== undefined) {
      const dist = (progress - params.includeDropAt) * totalPoints;
      if (Math.abs(dist) < 5.5) {
        z -= 92 * Math.exp(-(dist * dist) / 5.2);
      }
    }

    // Sustained upward dehydration drift
    if (params.includeDriftFrom !== undefined && progress > params.includeDriftFrom) {
      const driftProgress = (progress - params.includeDriftFrom) / (1 - params.includeDriftFrom);
      z += Math.min(1, driftProgress * 1.6) * 64;
    }

    // High-frequency oscillation burst
    if (params.includeOscAt !== undefined && Math.abs(progress - params.includeOscAt) < 0.08) {
      z += Math.sin(i * 2.4) * 34;
    }

    const zMag = Math.max(120, z);
    const phase = -22 + Math.sin(i * 0.5 + params.seedOffset) * 4.5;
    const rad = (phase * Math.PI) / 180;

    points.push({
      ts,
      value: parseFloat(zMag.toFixed(2)),
      zReal: parseFloat((zMag * Math.cos(rad)).toFixed(2)),
      zImag: parseFloat((zMag * Math.sin(rad)).toFixed(2)),
      phase: parseFloat(phase.toFixed(2)),
      freqHz: 50000,
      tempC: parseFloat((29.5 + Math.sin(((hour - 8) * Math.PI) / 12) * 4.2).toFixed(1)),
    });
  }

  return points;
}

export function createInitialWorkspace(): BiosarcWorkspaceState {
  const nowIso = new Date().toISOString();

  const trees: TreeGroup[] = [
    {
      id: "tree-oak-01",
      name: "Specimen Oak Alpha",
      species: "Quercus robur",
      notes: "North field calibration plot · 2-hour continuous logging",
      isExpanded: true,
      createdAt: nowIso,
    },
    {
      id: "tree-citrus-02",
      name: "Citrus Plot Beta",
      species: "Citrus sinensis",
      notes: "Greenhouse Bay B · irrigation response monitoring",
      isExpanded: true,
      createdAt: nowIso,
    },
  ];

  const nodes: SensorNode[] = [
    {
      id: "node-esp32-01",
      treeId: "tree-oak-01",
      name: "Node_ESP32_01",
      location: "Upper Trunk",
      firmware: "v2.4.1",
      csvFileName: "oak_upper_trunk_30d.csv",
      intervalLabel: "2h interval",
      points: generateRealisticCsvSeries({
        daysBack: 30,
        baseZ: 465,
        seedOffset: 1.1,
        includeDropAt: 0.28,
        includeSpikeAt: 0.56,
        includeDriftFrom: 0.72,
      }),
      updatedAt: nowIso,
    },
    {
      id: "node-esp32-02",
      treeId: "tree-oak-01",
      name: "Node_ESP32_02",
      location: "Lower Stem",
      firmware: "v2.4.1",
      csvFileName: "oak_lower_stem_30d.csv",
      intervalLabel: "2h interval",
      points: generateRealisticCsvSeries({
        daysBack: 30,
        baseZ: 420,
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
      points: generateRealisticCsvSeries({
        daysBack: 30,
        baseZ: 515,
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
      points: generateRealisticCsvSeries({
        daysBack: 14,
        baseZ: 385,
        seedOffset: 4.9,
        includeDropAt: 0.48,
        includeSpikeAt: 0.78,
      }),
      updatedAt: nowIso,
    },
  ];

  const patterns: IdentifiedPattern[] = nodes.flatMap((n) =>
    detectPatternsForNode(n.id, n.points)
  );

  return {
    version: 1,
    trees,
    nodes,
    patterns,
    activeNodeId: nodes[0].id,
  };
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
  const pts = generateRealisticCsvSeries({
    daysBack: 14,
    baseZ: 475,
    seedOffset: 7.4,
    includeDropAt: 0.35,
    includeSpikeAt: 0.65,
    includeDriftFrom: 0.75,
  });
  const header = "recorded_at,z_mag,z_real,z_imag,phase,freq_hz,temp_c";
  const rows = pts.map((p) =>
    [
      new Date(p.ts * 1000).toISOString(),
      p.value,
      p.zReal ?? "",
      p.zImag ?? "",
      p.phase ?? "",
      p.freqHz ?? 50000,
      p.tempC ?? 28.5,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
