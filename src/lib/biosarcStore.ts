import {
  buildPointsFromCsv,
  parseCsvText,
  serializePointsToCsv,
  type CsvTelemetryPoint,
  type ImpedanceUnit,
} from "./csvParser";
import {
  computeWindowChannelDeltas,
  detectPatternsForNode,
  type IdentifiedPattern,
  type ReferencePattern,
} from "./patternEngine";

export type { ReferencePattern } from "./patternEngine";

export interface TreeType {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface TreeGroup {
  id: string;
  treeTypeId: string;
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
  csvFiles?: string[];
  intervalLabel: string;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  updatedAt: string;
}

export function getNodeCsvFiles(node: Pick<SensorNode, "csvFileName" | "csvFiles">): string[] {
  if (node.csvFiles && node.csvFiles.length > 0) return node.csvFiles;
  return node.csvFileName ? [node.csvFileName] : [];
}

export interface BiosarcWorkspaceState {
  version: number;
  treeTypes: TreeType[];
  referencePatterns: ReferencePattern[];
  trees: TreeGroup[];
  nodes: SensorNode[];
  patterns: IdentifiedPattern[];
  activeNodeId: string | null;
}

const STORAGE_KEY = "biosarc_workspace_v3";
const LEGACY_STORAGE_KEY_V2 = "biosarc_workspace_v2";
export const ATTACHED_CSV_ASSET_PATH = "/assets/aistudio/dawal_loku_gaha_ca74c983.csv";

export const REFERENCE_PALETTE = [
  "#D97706", // Amber
  "#2563EB", // Cobalt
  "#16A34A", // Emerald
  "#DC2626", // Crimson
  "#7C3AED", // Violet
  "#0891B2", // Teal
];

export function getNextReferenceCode(existingRefs: ReferencePattern[]): string {
  let maxNum = 0;
  for (const r of existingRefs) {
    const m = /^D(\d+)$/i.exec(r.code.trim());
    if (m) {
      maxNum = Math.max(maxNum, Number.parseInt(m[1], 10));
    }
  }
  return `D${maxNum + 1}`;
}

export function pickReferenceColor(index: number): string {
  return REFERENCE_PALETTE[index % REFERENCE_PALETTE.length];
}

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

/**
 * Generates clean 16-sample reference signatures for Mango D1..D4 where
 * Impedance curve shape, Δ DC V, and Δ RAW ADC each encode distinct physiological states.
 */
function buildMangoSignatureSegment(
  kind: "flowers" | "fruit" | "healthy" | "diseased",
  startTs: number,
  intervalSec: number,
  length = 16,
  noiseSeed = 0
): CsvTelemetryPoint[] {
  const pts: CsvTelemetryPoint[] = [];
  for (let i = 0; i < length; i++) {
    const t = i / (length - 1);
    const jitter = Math.sin(i * 1.7 + noiseSeed) * 0.06;
    let z = 27.0;
    let dcV = 2.30;
    let adc = 713;

    if (kind === "flowers") {
      // Flowering sap-hydration drop: Impedance dips smoothly (-2.8 kΩ), DC V & ADC rise noticeably
      z = 29.2 - 2.8 * Math.pow(Math.sin((t * Math.PI) / 2), 0.9) + jitter;
      dcV = 2.26 + 0.095 * t + jitter * 0.004;
      adc = 701 + 29.4 * t + jitter * 1.4;
    } else if (kind === "fruit") {
      // Fruiting translocation pulse: dual oscillatory swell (+1.6 kΩ net) with mild voltage dip
      z = 26.8 + 1.6 * t + Math.sin(t * Math.PI * 2.5) * 1.15 + jitter;
      dcV = 2.38 - 0.068 * t - Math.sin(t * Math.PI * 2.5) * 0.012;
      adc = 738 - 21.1 * t - Math.sin(t * Math.PI * 2.5) * 3.8;
    } else if (kind === "healthy") {
      // Healthy balanced diurnal sine: symmetric oscillation, near-zero net shift across all 3 channels
      z = 27.5 + Math.sin(t * Math.PI * 2) * 0.85 + jitter * 0.6;
      dcV = 2.345 + Math.sin(t * Math.PI * 2) * 0.008;
      adc = 727 + Math.sin(t * Math.PI * 2) * 2.4;
    } else {
      // Diseased vascular occlusion stress: steep upward Impedance surge (+5.4 kΩ) & steep DC V / ADC collapse
      z = 28.0 + 5.4 * (1 / (1 + Math.exp(-8 * (t - 0.45)))) + jitter;
      dcV = 2.41 - 0.19 * (1 / (1 + Math.exp(-8 * (t - 0.45))));
      adc = 747 - 58.9 * (1 / (1 + Math.exp(-8 * (t - 0.45))));
    }

    pts.push({
      ts: startTs + i * intervalSec,
      value: parseFloat(z.toFixed(2)),
      dcV: parseFloat(dcV.toFixed(3)),
      rawAdc: parseFloat(adc.toFixed(1)),
    });
  }
  return pts;
}

function buildNewMangoTreeTimeline(): CsvTelemetryPoint[] {
  const intervalSec = 2 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedEnd = nowSec - (nowSec % intervalSec);
  const totalNeeded = 16 * 4 + 28; // ~12 days at 2h interval
  const startTs = alignedEnd - (totalNeeded - 1) * intervalSec;

  const points: CsvTelemetryPoint[] = [];
  let cursor = 0;

  const pushBridge = (count: number, baseZ: number, baseV: number, baseAdc: number) => {
    for (let i = 0; i < count; i++) {
      const wave = Math.sin((cursor + i) * 0.45) * 0.35;
      points.push({
        ts: startTs + cursor * intervalSec,
        value: parseFloat((baseZ + wave).toFixed(2)),
        dcV: parseFloat((baseV - wave * 0.01).toFixed(3)),
        rawAdc: parseFloat((baseAdc - wave * 3.1).toFixed(1)),
      });
      cursor++;
    }
  };

  const appendSegment = (kind: "flowers" | "fruit" | "healthy" | "diseased", seed: number) => {
    const seg = buildMangoSignatureSegment(
      kind,
      startTs + cursor * intervalSec,
      intervalSec,
      16,
      seed
    );
    for (const p of seg) {
      points.push(p);
      cursor++;
    }
  };

  // Realistic new Mango tree log transitioning across phenological & stress signatures
  pushBridge(6, 27.6, 2.34, 725);
  appendSegment("healthy", 1.2);
  pushBridge(6, 28.9, 2.28, 707);
  appendSegment("flowers", 2.4);
  pushBridge(6, 26.9, 2.37, 735);
  appendSegment("fruit", 3.1);
  pushBridge(6, 28.0, 2.40, 744);
  appendSegment("diseased", 4.7);
  pushBridge(4, 33.1, 2.22, 688);

  return points;
}

function buildSeedTreeTypesAndReferences(nowIso: string): {
  treeTypes: TreeType[];
  referencePatterns: ReferencePattern[];
} {
  const intervalSec = 2 * 3600;
  const refAnchor = Math.floor(Date.now() / 1000) - 30 * 86400;

  const treeTypes: TreeType[] = [
    {
      id: "type-mango",
      name: "Mango",
      description: "Mangifera indica · Phenological & stress diagnostic signatures (D1–D4)",
      createdAt: nowIso,
    },
    {
      id: "type-dawal",
      name: "Dawal Loku Gaha",
      description: "Field logger specimen baseline (Time | RAW ADC | DC V | Impedance kΩ)",
      createdAt: nowIso,
    },
    {
      id: "type-citrus",
      name: "Citrus",
      description: "Citrus sinensis greenhouse monitoring references",
      createdAt: nowIso,
    },
  ];

  const makeRef = (
    id: string,
    treeTypeId: string,
    code: string,
    qualityName: string,
    color: string,
    notes: string,
    sourceFileName: string,
    pts: CsvTelemetryPoint[]
  ): ReferencePattern => {
    const deltas = computeWindowChannelDeltas(pts);
    return {
      id,
      treeTypeId,
      code,
      qualityName,
      color,
      notes,
      sourceFileName,
      unit: "kΩ",
      points: pts,
      deltaZ: deltas.deltaZ,
      deltaDcV: deltas.deltaDcV,
      deltaRawAdc: deltas.deltaRawAdc,
      durationSec: deltas.durationSec,
      createdAt: nowIso,
    };
  };

  const referencePatterns: ReferencePattern[] = [
    makeRef(
      "ref-mango-d1",
      "type-mango",
      "D1",
      "With Flowers",
      "#D97706",
      "Flowering sap-hydration drop: Impedance decreases while DC V & RAW ADC climb.",
      "mango_flowers_ref_D1.csv",
      buildMangoSignatureSegment("flowers", refAnchor, intervalSec, 16, 0.3)
    ),
    makeRef(
      "ref-mango-d2",
      "type-mango",
      "D2",
      "With Fruit",
      "#2563EB",
      "Fruiting translocation wave: rhythmic oscillation with rising Impedance & slight DC V dip.",
      "mango_fruit_ref_D2.csv",
      buildMangoSignatureSegment("fruit", refAnchor + 40 * intervalSec, intervalSec, 16, 0.7)
    ),
    makeRef(
      "ref-mango-d3",
      "type-mango",
      "D3",
      "Healthy",
      "#16A34A",
      "Healthy baseline equilibrium: balanced diurnal cycle with near-zero net Δ across channels.",
      "mango_healthy_ref_D3.csv",
      buildMangoSignatureSegment("healthy", refAnchor + 80 * intervalSec, intervalSec, 16, 0.5)
    ),
    makeRef(
      "ref-mango-d4",
      "type-mango",
      "D4",
      "Diseased",
      "#DC2626",
      "Vascular stress signature: sharp Impedance surge paired with steep DC V & RAW ADC drop.",
      "mango_diseased_ref_D4.csv",
      buildMangoSignatureSegment("diseased", refAnchor + 120 * intervalSec, intervalSec, 16, 0.9)
    ),
  ];

  return { treeTypes, referencePatterns };
}

export function createInitialWorkspace(): BiosarcWorkspaceState {
  const nowIso = new Date().toISOString();
  const { treeTypes, referencePatterns } = buildSeedTreeTypesAndReferences(nowIso);

  const trees: TreeGroup[] = [
    {
      id: "tree-mango-new",
      treeTypeId: "type-mango",
      name: "Mango Plot C (New Tree)",
      species: "Mangifera indica · New Deployment",
      notes: "Newly connected Mango tree evaluated against Mango D1–D4 reference library",
      isExpanded: true,
      createdAt: nowIso,
    },
    {
      id: "tree-dawal-01",
      treeTypeId: "type-dawal",
      name: "Dawal Loku Gaha",
      species: "Field Logger Tree #1",
      notes: "Pipe-delimited ESP32 logger (Time | RAW ADC | DC V | Impedance kΩ)",
      isExpanded: true,
      createdAt: nowIso,
    },
    {
      id: "tree-citrus-02",
      treeTypeId: "type-citrus",
      name: "Citrus Plot Beta",
      species: "Citrus sinensis",
      notes: "Greenhouse Bay B · 2-hour continuous impedance monitoring",
      isExpanded: false,
      createdAt: nowIso,
    },
  ];

  const nodes: SensorNode[] = [
    {
      id: "node-mango-new-01",
      treeId: "tree-mango-new",
      name: "Mango_New_01",
      location: "Main Trunk Collar",
      firmware: "v2.5.0",
      csvFileName: "mango_plot_c_new_tree.csv",
      csvFiles: ["mango_plot_c_new_tree.csv"],
      intervalLabel: "2h interval",
      unit: "kΩ",
      points: buildNewMangoTreeTimeline(),
      updatedAt: nowIso,
    },
    {
      id: "node-dawal-01",
      treeId: "tree-dawal-01",
      name: "Dawal_Node_01",
      location: "Lower Trunk",
      firmware: "v2.4.1",
      csvFileName: "dawal_loku_gaha_ca74c983.csv",
      csvFiles: ["dawal_loku_gaha_ca74c983.csv"],
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
      csvFiles: ["dawal_canopy_30d.csv"],
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
      csvFiles: ["citrus_branch_30d.csv"],
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
      csvFiles: ["citrus_root_14d.csv"],
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
    version: 3,
    treeTypes,
    referencePatterns,
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
            csvFiles: ["dawal_loku_gaha_ca74c983.csv"],
            intervalLabel: built.intervalLabel,
            unit: built.unit,
            points: built.points,
            updatedAt: new Date().toISOString(),
          }
        : n
    );
    const freshPatterns = detectPatternsForNode(targetNodeId, built.points, built.unit);

    // Also add a baseline reference from a slice of the attached CSV under Dawal Loku Gaha if none exists
    const hasDawalRef = workspace.referencePatterns.some((r) => r.treeTypeId === "type-dawal");
    let nextRefs = workspace.referencePatterns;
    if (!hasDawalRef && built.points.length >= 24) {
      const slice = built.points.slice(12, 34);
      const deltas = computeWindowChannelDeltas(slice);
      nextRefs = [
        ...workspace.referencePatterns,
        {
          id: "ref-dawal-d1",
          treeTypeId: "type-dawal",
          code: "D1",
          qualityName: "Logger Baseline Shift",
          color: "#2563EB",
          notes: "Baseline segment extracted from dawal_loku_gaha_ca74c983.csv",
          sourceFileName: "dawal_loku_gaha_ca74c983.csv",
          unit: built.unit,
          points: slice,
          deltaZ: deltas.deltaZ,
          deltaDcV: deltas.deltaDcV,
          deltaRawAdc: deltas.deltaRawAdc,
          durationSec: deltas.durationSec,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    const next: BiosarcWorkspaceState = {
      ...workspace,
      referencePatterns: nextRefs,
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
    if (raw) {
      const parsed = JSON.parse(raw) as BiosarcWorkspaceState;
      if (
        parsed &&
        Array.isArray(parsed.trees) &&
        Array.isArray(parsed.nodes) &&
        Array.isArray(parsed.treeTypes) &&
        Array.isArray(parsed.referencePatterns)
      ) {
        return parsed;
      }
    }

    // Smoothly migrate v2 saved workspace if present while adding TreeTypes + Mango References
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Partial<BiosarcWorkspaceState>;
      const seeded = createInitialWorkspace();
      if (legacy && Array.isArray(legacy.trees) && Array.isArray(legacy.nodes)) {
        const migratedTrees: TreeGroup[] = [
          seeded.trees[0], // Add Mango Plot C (New Tree) so Mango story is ready to explore
          ...legacy.trees.map((t) => ({
            ...t,
            treeTypeId:
              t.treeTypeId ??
              (t.id === "tree-dawal-01"
                ? "type-dawal"
                : t.id === "tree-citrus-02"
                ? "type-citrus"
                : "type-mango"),
          })),
        ];
        const migrated: BiosarcWorkspaceState = {
          version: 3,
          treeTypes: seeded.treeTypes,
          referencePatterns: seeded.referencePatterns,
          trees: migratedTrees,
          nodes: [...seeded.nodes.filter((n) => n.treeId === "tree-mango-new"), ...legacy.nodes],
          patterns: [
            ...seeded.patterns.filter((p) => p.nodeId === "node-mango-new-01"),
            ...(legacy.patterns ?? []),
          ],
          activeNodeId: legacy.activeNodeId ?? seeded.activeNodeId,
        };
        saveWorkspace(migrated);
        return migrated;
      }
    }

    const seeded = createInitialWorkspace();
    saveWorkspace(seeded);
    return seeded;
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
