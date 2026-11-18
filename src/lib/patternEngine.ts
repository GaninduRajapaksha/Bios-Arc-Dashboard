import type { CsvTelemetryPoint } from "./csvParser";

export type PatternSource = "auto" | "manual";
export type PatternCategory = "spike" | "drop" | "drift" | "oscillation" | "custom";

export interface IdentifiedPattern {
  id: string;
  nodeId: string;
  name: string;
  source: PatternSource;
  category: PatternCategory;
  startTs: number;
  endTs: number;
  minZ: number;
  maxZ: number;
  avgZ: number;
  deltaZ: number;
  deltaPct: number;
  sampleCount: number;
  summaryNote: string;
  createdAt: string;
}

export interface SimilarityMatch {
  id: string;
  targetNodeId: string;
  targetNodeName: string;
  targetTreeId: string;
  targetTreeName: string;
  startTs: number;
  endTs: number;
  similarityScore: number;
  avgZ: number;
  deltaZ: number;
  deltaPct: number;
  sampleCount: number;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function computePatternFromWindow(params: {
  nodeId: string;
  points: CsvTelemetryPoint[];
  startTs: number;
  endTs: number;
  name: string;
  source: PatternSource;
  category: PatternCategory;
  summaryNote?: string;
}): IdentifiedPattern | null {
  const lo = Math.min(params.startTs, params.endTs);
  const hi = Math.max(params.startTs, params.endTs);
  const slice = params.points.filter((p) => p.ts >= lo && p.ts <= hi);

  if (slice.length < 2) return null;

  const vals = slice.map((p) => p.value);
  const minZ = Math.min(...vals);
  const maxZ = Math.max(...vals);
  const avgZ = vals.reduce((a, b) => a + b, 0) / vals.length;
  const first = vals[0];
  const last = vals[vals.length - 1];
  const deltaZ = last - first;
  const deltaPct = first !== 0 ? (deltaZ / first) * 100 : 0;

  const defaultNote =
    params.category === "spike"
      ? `Peak excursion to ${maxZ.toFixed(1)} Ω across ${slice.length} samples`
      : params.category === "drop"
      ? `Sharp drop to ${minZ.toFixed(1)} Ω (${deltaPct.toFixed(1)}% shift)`
      : params.category === "drift"
      ? `Sustained ${deltaZ >= 0 ? "upward" : "downward"} trend of ${deltaZ >= 0 ? "+" : ""}${deltaZ.toFixed(1)} Ω`
      : params.category === "oscillation"
      ? `High-variance band spanning ${(maxZ - minZ).toFixed(1)} Ω`
      : `User-selected segment (${slice.length} samples, ${deltaZ >= 0 ? "+" : ""}${deltaZ.toFixed(1)} Ω)`;

  return {
    id: makeId("pat"),
    nodeId: params.nodeId,
    name: params.name.trim() || "Unnamed Pattern",
    source: params.source,
    category: params.category,
    startTs: slice[0].ts,
    endTs: slice[slice.length - 1].ts,
    minZ: parseFloat(minZ.toFixed(2)),
    maxZ: parseFloat(maxZ.toFixed(2)),
    avgZ: parseFloat(avgZ.toFixed(2)),
    deltaZ: parseFloat(deltaZ.toFixed(2)),
    deltaPct: parseFloat(deltaPct.toFixed(2)),
    sampleCount: slice.length,
    summaryNote: params.summaryNote || defaultNote,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Automatically detects physiological impedance anomalies & behavioral patterns:
 * spikes, sharp hydration drops, sustained drifts, and oscillation bursts.
 */
export function detectPatternsForNode(
  nodeId: string,
  points: CsvTelemetryPoint[]
): IdentifiedPattern[] {
  if (points.length < 12) return [];

  const values = points.map((p) => p.value);
  const n = values.length;
  const globalMean = values.reduce((a, b) => a + b, 0) / n;
  const globalStd = Math.sqrt(
    values.reduce((acc, v) => acc + (v - globalMean) ** 2, 0) / n
  ) || 1;

  const detected: IdentifiedPattern[] = [];
  const usedRanges: Array<[number, number]> = [];

  const overlaps = (s: number, e: number) =>
    usedRanges.some(([rs, re]) => Math.max(s, rs) <= Math.min(e, re));

  // 1. Detect sharpest local spikes and drops using short-window baseline deviation
  const windowHalf = 4;
  const candidates: Array<{ idx: number; zScore: number; type: "spike" | "drop" }> = [];

  for (let i = windowHalf; i < n - windowHalf; i++) {
    const neighborhood = [
      ...values.slice(Math.max(0, i - 10), i - 2),
      ...values.slice(i + 3, Math.min(n, i + 11)),
    ];
    if (neighborhood.length < 4) continue;
    const localMean = neighborhood.reduce((a, b) => a + b, 0) / neighborhood.length;
    const localStd =
      Math.sqrt(
        neighborhood.reduce((a, v) => a + (v - localMean) ** 2, 0) / neighborhood.length
      ) || globalStd * 0.4;

    const z = (values[i] - localMean) / Math.max(localStd, globalStd * 0.25);
    if (z > 2.2) {
      candidates.push({ idx: i, zScore: z, type: "spike" });
    } else if (z < -2.2) {
      candidates.push({ idx: i, zScore: Math.abs(z), type: "drop" });
    }
  }

  candidates.sort((a, b) => b.zScore - a.zScore);

  let spikeNum = 1;
  let dropNum = 1;
  for (const cand of candidates) {
    const startIdx = Math.max(0, cand.idx - 4);
    const endIdx = Math.min(n - 1, cand.idx + 5);
    if (overlaps(startIdx, endIdx)) continue;

    const name =
      cand.type === "spike"
        ? `Impedance Spike #${spikeNum++}`
        : `Hydration Drop #${dropNum++}`;

    const pat = computePatternFromWindow({
      nodeId,
      points,
      startTs: points[startIdx].ts,
      endTs: points[endIdx].ts,
      name,
      source: "auto",
      category: cand.type,
    });

    if (pat) {
      detected.push(pat);
      usedRanges.push([startIdx, endIdx]);
    }
    if (detected.length >= 4) break;
  }

  // 2. Detect sustained directional drift (multi-point trend)
  const driftSpan = Math.min(24, Math.floor(n / 3));
  if (driftSpan >= 8) {
    let bestDrift = { start: 0, end: 0, score: 0, delta: 0 };
    for (let i = 0; i <= n - driftSpan; i += 3) {
      const startVal = values.slice(i, i + 3).reduce((a, b) => a + b, 0) / 3;
      const endVal =
        values.slice(i + driftSpan - 3, i + driftSpan).reduce((a, b) => a + b, 0) / 3;
      const delta = endVal - startVal;
      const score = Math.abs(delta) / globalStd;
      if (score > 1.35 && score > bestDrift.score && !overlaps(i, i + driftSpan - 1)) {
        bestDrift = { start: i, end: i + driftSpan - 1, score, delta };
      }
    }

    if (bestDrift.score > 0) {
      const dirLabel = bestDrift.delta >= 0 ? "Upward Drift" : "Downward Recovery";
      const pat = computePatternFromWindow({
        nodeId,
        points,
        startTs: points[bestDrift.start].ts,
        endTs: points[bestDrift.end].ts,
        name: `${dirLabel} #1`,
        source: "auto",
        category: "drift",
      });
      if (pat) {
        detected.push(pat);
        usedRanges.push([bestDrift.start, bestDrift.end]);
      }
    }
  }

  // 3. Detect high-variance oscillation burst
  const oscSpan = Math.min(18, Math.floor(n / 4));
  if (oscSpan >= 8) {
    let bestOsc = { start: 0, end: 0, ratio: 0 };
    for (let i = 0; i <= n - oscSpan; i += 3) {
      if (overlaps(i, i + oscSpan - 1)) continue;
      const seg = values.slice(i, i + oscSpan);
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const std = Math.sqrt(seg.reduce((a, v) => a + (v - mean) ** 2, 0) / seg.length);
      const ratio = std / globalStd;
      if (ratio > 1.25 && ratio > bestOsc.ratio) {
        bestOsc = { start: i, end: i + oscSpan - 1, ratio };
      }
    }
    if (bestOsc.ratio > 0) {
      const pat = computePatternFromWindow({
        nodeId,
        points,
        startTs: points[bestOsc.start].ts,
        endTs: points[bestOsc.end].ts,
        name: "Diurnal Stress Oscillation #1",
        source: "auto",
        category: "oscillation",
      });
      if (pat) {
        detected.push(pat);
      }
    }
  }

  return detected.sort((a, b) => a.startTs - b.startTs);
}

function resampleArray(arr: number[], targetLen: number): number[] {
  if (arr.length === 0) return [];
  if (arr.length === 1) return Array(targetLen).fill(arr[0]);
  const out: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * (arr.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(arr.length - 1, Math.ceil(pos));
    const t = pos - lo;
    out.push(arr[lo] * (1 - t) + arr[hi] * t);
  }
  return out;
}

function zNormalize(arr: number[]): number[] {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a, v) => a + (v - mean) ** 2, 0) / arr.length);
  if (std < 1e-6) return arr.map(() => 0);
  return arr.map((v) => (v - mean) / std);
}

function pearsonCorrelation(a: number[], b: number[]): number {
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    num += a[i] * b[i];
    denA += a[i] * a[i];
    denB += b[i] * b[i];
  }
  const den = Math.sqrt(denA * denB);
  if (den < 1e-6) return 0;
  return num / den;
}

function dtwDistance(a: number[], b: number[]): number {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[n][m] / (n + m);
}

export interface SearchableNodeDataset {
  nodeId: string;
  nodeName: string;
  treeId: string;
  treeName: string;
  points: CsvTelemetryPoint[];
}

/**
 * Slides across every node's CSV dataset to find time segments with matching
 * impedance shape & dynamic range.
 */
export function findSimilarPatternsAcrossDatasets(
  queryPattern: IdentifiedPattern,
  sourcePoints: CsvTelemetryPoint[],
  datasets: SearchableNodeDataset[],
  minSimilarity = 65
): SimilarityMatch[] {
  const querySlice = sourcePoints
    .filter((p) => p.ts >= queryPattern.startTs && p.ts <= queryPattern.endTs)
    .map((p) => p.value);

  if (querySlice.length < 3) return [];

  const normLen = 20;
  const queryResampled = resampleArray(querySlice, normLen);
  const queryNorm = zNormalize(queryResampled);
  const queryDelta = querySlice[querySlice.length - 1] - querySlice[0];
  const querySpan = Math.max(...querySlice) - Math.min(...querySlice);

  const rawMatches: SimilarityMatch[] = [];
  const winLen = Math.max(4, querySlice.length);
  const step = Math.max(1, Math.floor(winLen / 4));

  for (const ds of datasets) {
    if (ds.points.length < winLen) continue;

    for (let i = 0; i <= ds.points.length - winLen; i += step) {
      const candidatePts = ds.points.slice(i, i + winLen);
      const startTs = candidatePts[0].ts;
      const endTs = candidatePts[candidatePts.length - 1].ts;

      // Skip the exact same pattern window on the source node
      if (
        ds.nodeId === queryPattern.nodeId &&
        Math.max(startTs, queryPattern.startTs) <= Math.min(endTs, queryPattern.endTs)
      ) {
        continue;
      }

      const candVals = candidatePts.map((p) => p.value);
      const candResampled = resampleArray(candVals, normLen);
      const candNorm = zNormalize(candResampled);

      const corr = pearsonCorrelation(queryNorm, candNorm); // -1..1
      const dtw = dtwDistance(queryNorm, candNorm);
      const dtwSim = Math.exp(-dtw * 1.4); // 0..1

      const candSpan = Math.max(...candVals) - Math.min(...candVals);
      const spanRatio =
        Math.max(querySpan, candSpan) > 0
          ? Math.min(querySpan, candSpan) / Math.max(querySpan, candSpan)
          : 1;

      const candDelta = candVals[candVals.length - 1] - candVals[0];
      const sameDirection =
        Math.abs(queryDelta) < 2 || Math.sign(queryDelta) === Math.sign(candDelta) ? 1 : 0.72;

      const corrScore = Math.max(0, corr);
      const combined = (0.5 * corrScore + 0.32 * dtwSim + 0.18 * spanRatio) * sameDirection * 100;
      const similarityScore = Math.min(99.4, Math.max(0, parseFloat(combined.toFixed(1))));

      if (similarityScore >= minSimilarity) {
        const avgZ = candVals.reduce((a, b) => a + b, 0) / candVals.length;
        const deltaPct = candVals[0] !== 0 ? (candDelta / candVals[0]) * 100 : 0;

        rawMatches.push({
          id: makeId("match"),
          targetNodeId: ds.nodeId,
          targetNodeName: ds.nodeName,
          targetTreeId: ds.treeId,
          targetTreeName: ds.treeName,
          startTs,
          endTs,
          similarityScore,
          avgZ: parseFloat(avgZ.toFixed(2)),
          deltaZ: parseFloat(candDelta.toFixed(2)),
          deltaPct: parseFloat(deltaPct.toFixed(2)),
          sampleCount: candVals.length,
        });
      }
    }
  }

  // Non-maximum suppression per node so overlapping windows don't spam results
  rawMatches.sort((a, b) => b.similarityScore - a.similarityScore);
  const filtered: SimilarityMatch[] = [];

  for (const m of rawMatches) {
    const overlapsExisting = filtered.some(
      (f) =>
        f.targetNodeId === m.targetNodeId &&
        Math.max(f.startTs, m.startTs) <= Math.min(f.endTs, m.endTs)
    );
    if (!overlapsExisting) {
      filtered.push(m);
    }
    if (filtered.length >= 25) break;
  }

  return filtered;
}
