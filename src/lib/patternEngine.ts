import type { CsvTelemetryPoint, ImpedanceUnit } from "./csvParser";

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
  avgDcV?: number;
  avgRawAdc?: number;
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
  targetUnit: ImpedanceUnit;
  startTs: number;
  endTs: number;
  similarityScore: number;
  avgZ: number;
  deltaZ: number;
  deltaPct: number;
  sampleCount: number;
}

export interface ReferencePattern {
  id: string;
  treeTypeId: string;
  code: string; // e.g., "D1", "D2", "D3", "D4"
  qualityName: string; // e.g., "With Flowers", "With Fruit", "Healthy", "Diseased"
  color: string;
  notes: string;
  sourceFileName: string;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  deltaZ: number;
  deltaDcV?: number;
  deltaRawAdc?: number;
  durationSec: number;
  createdAt: string;
}

export interface ReferenceMatchResult {
  id: string;
  referenceId: string;
  referenceCode: string;
  qualityName: string;
  color: string;
  nodeId: string;
  startTs: number;
  endTs: number;
  overallScore: number;
  impedanceScore: number;
  dcVScore: number | null;
  rawAdcScore: number | null;
  deltaZ: number;
  deltaDcV?: number;
  deltaRawAdc?: number;
  refDeltaZ: number;
  refDeltaDcV?: number;
  refDeltaRawAdc?: number;
  sampleCount: number;
}

export interface ReferenceQualitySummary {
  referenceId: string;
  code: string;
  qualityName: string;
  color: string;
  matchCount: number;
  bestScore: number | null;
  bestMatch: ReferenceMatchResult | null;
  refDeltaZ: number;
  refDeltaDcV?: number;
  refDeltaRawAdc?: number;
  unit: ImpedanceUnit;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function computeWindowChannelDeltas(points: CsvTelemetryPoint[]): {
  deltaZ: number;
  deltaDcV?: number;
  deltaRawAdc?: number;
  durationSec: number;
} {
  if (points.length === 0) {
    return { deltaZ: 0, durationSec: 0 };
  }
  const first = points[0];
  const last = points[points.length - 1];
  const deltaZ = parseFloat((last.value - first.value).toFixed(2));

  const dcVals = points.map((p) => p.dcV).filter((v): v is number => v !== undefined);
  const deltaDcV =
    dcVals.length >= 2
      ? parseFloat((dcVals[dcVals.length - 1] - dcVals[0]).toFixed(3))
      : undefined;

  const adcVals = points.map((p) => p.rawAdc).filter((v): v is number => v !== undefined);
  const deltaRawAdc =
    adcVals.length >= 2
      ? parseFloat((adcVals[adcVals.length - 1] - adcVals[0]).toFixed(1))
      : undefined;

  const durationSec = Math.max(0, last.ts - first.ts);
  return { deltaZ, deltaDcV, deltaRawAdc, durationSec };
}

export function computePatternFromWindow(params: {
  nodeId: string;
  points: CsvTelemetryPoint[];
  startTs: number;
  endTs: number;
  name: string;
  source: PatternSource;
  category: PatternCategory;
  unit?: ImpedanceUnit;
  summaryNote?: string;
}): IdentifiedPattern | null {
  const unit = params.unit ?? "kΩ";
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

  const dcVals = slice.map((p) => p.dcV).filter((v): v is number => v !== undefined);
  const adcVals = slice.map((p) => p.rawAdc).filter((v): v is number => v !== undefined);
  const avgDcV =
    dcVals.length > 0
      ? parseFloat((dcVals.reduce((a, b) => a + b, 0) / dcVals.length).toFixed(3))
      : undefined;
  const avgRawAdc =
    adcVals.length > 0
      ? parseFloat((adcVals.reduce((a, b) => a + b, 0) / adcVals.length).toFixed(1))
      : undefined;

  const defaultNote =
    params.category === "spike"
      ? `Peak excursion to ${maxZ.toFixed(2)} ${unit} across ${slice.length} samples`
      : params.category === "drop"
      ? `Sharp drop to ${minZ.toFixed(2)} ${unit} (${deltaPct.toFixed(1)}% shift)`
      : params.category === "drift"
      ? `Sustained ${deltaZ >= 0 ? "upward" : "downward"} drift of ${deltaZ >= 0 ? "+" : ""}${deltaZ.toFixed(2)} ${unit}`
      : params.category === "oscillation"
      ? `High-variance band spanning ${(maxZ - minZ).toFixed(2)} ${unit}`
      : `User-selected segment (${slice.length} samples, ${deltaZ >= 0 ? "+" : ""}${deltaZ.toFixed(2)} ${unit})`;

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
    avgDcV,
    avgRawAdc,
    deltaZ: parseFloat(deltaZ.toFixed(2)),
    deltaPct: parseFloat(deltaPct.toFixed(2)),
    sampleCount: slice.length,
    summaryNote: params.summaryNote || defaultNote,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Automatically detects physiological impedance anomalies & behavioral patterns:
 * spikes, sharp drops, sustained drifts, and oscillation bursts.
 */
export function detectPatternsForNode(
  nodeId: string,
  points: CsvTelemetryPoint[],
  unit: ImpedanceUnit = "kΩ"
): IdentifiedPattern[] {
  if (points.length < 10) return [];

  const values = points.map((p) => p.value);
  const n = values.length;
  const globalMean = values.reduce((a, b) => a + b, 0) / n;
  const globalStd =
    Math.sqrt(values.reduce((acc, v) => acc + (v - globalMean) ** 2, 0) / n) || 0.01;

  const detected: IdentifiedPattern[] = [];
  const usedRanges: Array<[number, number]> = [];

  const overlaps = (s: number, e: number) =>
    usedRanges.some(([rs, re]) => Math.max(s, rs) <= Math.min(e, re));

  // 1. Detect sharpest local spikes and drops (or rapid step jumps)
  const windowHalf = Math.min(4, Math.floor(n / 6));
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
      ) || globalStd * 0.35;

    const z = (values[i] - localMean) / Math.max(localStd, globalStd * 0.2);
    if (z > 2.0) {
      candidates.push({ idx: i, zScore: z, type: "spike" });
    } else if (z < -2.0) {
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
        : `Impedance Drop #${dropNum++}`;

    const pat = computePatternFromWindow({
      nodeId,
      points,
      startTs: points[startIdx].ts,
      endTs: points[endIdx].ts,
      name,
      source: "auto",
      category: cand.type,
      unit,
    });

    if (pat) {
      detected.push(pat);
      usedRanges.push([startIdx, endIdx]);
    }
    if (detected.length >= 4) break;
  }

  // 2. Detect sustained directional drift (multi-point trend)
  const driftSpan = Math.min(28, Math.max(8, Math.floor(n / 3)));
  if (n >= driftSpan) {
    let bestDrift = { start: 0, end: 0, score: 0, delta: 0 };
    for (let i = 0; i <= n - driftSpan; i += Math.max(2, Math.floor(driftSpan / 6))) {
      const startVal = values.slice(i, i + 3).reduce((a, b) => a + b, 0) / 3;
      const endVal =
        values.slice(i + driftSpan - 3, i + driftSpan).reduce((a, b) => a + b, 0) / 3;
      const delta = endVal - startVal;
      const score = Math.abs(delta) / globalStd;
      if (score > 1.15 && score > bestDrift.score && !overlaps(i, i + driftSpan - 1)) {
        bestDrift = { start: i, end: i + driftSpan - 1, score, delta };
      }
    }

    if (bestDrift.score > 0) {
      const dirLabel = bestDrift.delta >= 0 ? "Upward Impedance Drift" : "Downward Recovery Drift";
      const pat = computePatternFromWindow({
        nodeId,
        points,
        startTs: points[bestDrift.start].ts,
        endTs: points[bestDrift.end].ts,
        name: `${dirLabel} #1`,
        source: "auto",
        category: "drift",
        unit,
      });
      if (pat) {
        detected.push(pat);
        usedRanges.push([bestDrift.start, bestDrift.end]);
      }
    }
  }

  // 3. Detect steepest local step/ramp or oscillation burst
  const stepSpan = Math.min(16, Math.max(6, Math.floor(n / 5)));
  if (n >= stepSpan) {
    let bestStep = { start: 0, end: 0, ratio: 0, delta: 0 };
    for (let i = 0; i <= n - stepSpan; i += 2) {
      if (overlaps(i, i + stepSpan - 1)) continue;
      const seg = values.slice(i, i + stepSpan);
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const std = Math.sqrt(seg.reduce((a, v) => a + (v - mean) ** 2, 0) / seg.length);
      const ratio = std / globalStd;
      if (ratio > 0.75 && ratio > bestStep.ratio) {
        bestStep = {
          start: i,
          end: i + stepSpan - 1,
          ratio,
          delta: seg[seg.length - 1] - seg[0],
        };
      }
    }
    if (bestStep.ratio > 0) {
      const isRamp = Math.abs(bestStep.delta) > globalStd * 0.8;
      const pat = computePatternFromWindow({
        nodeId,
        points,
        startTs: points[bestStep.start].ts,
        endTs: points[bestStep.end].ts,
        name: isRamp ? "Rapid Impedance Shift #1" : "Variance Oscillation #1",
        source: "auto",
        category: isRamp ? "drift" : "oscillation",
        unit,
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
  if (den < 1e-6) {
    // Both nearly flat curves should match on flatness rather than zeroing out
    const maxAbsA = Math.max(...a.map(Math.abs));
    const maxAbsB = Math.max(...b.map(Math.abs));
    if (maxAbsA < 1e-4 && maxAbsB < 1e-4) return 0.92;
    return 0;
  }
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
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
}

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

      if (
        ds.nodeId === queryPattern.nodeId &&
        Math.max(startTs, queryPattern.startTs) <= Math.min(endTs, queryPattern.endTs)
      ) {
        continue;
      }

      const candVals = candidatePts.map((p) => p.value);
      const candResampled = resampleArray(candVals, normLen);
      const candNorm = zNormalize(candResampled);

      const corr = pearsonCorrelation(queryNorm, candNorm);
      const dtw = dtwDistance(queryNorm, candNorm);
      const dtwSim = Math.exp(-dtw * 1.4);

      const candSpan = Math.max(...candVals) - Math.min(...candVals);
      const spanRatio =
        Math.max(querySpan, candSpan) > 0
          ? Math.min(querySpan, candSpan) / Math.max(querySpan, candSpan)
          : 1;

      const candDelta = candVals[candVals.length - 1] - candVals[0];
      const sameDirection =
        Math.abs(queryDelta) < 0.05 || Math.sign(queryDelta) === Math.sign(candDelta) ? 1 : 0.72;

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
          targetUnit: ds.unit,
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

function toKOhm(val: number, unit: ImpedanceUnit): number {
  return unit === "Ω" ? val / 1000 : val;
}

function computeDeltaChannelSimilarity(
  refVals: number[],
  candVals: number[],
  flatThreshold: number,
  scaleFloor: number,
  normLen: number
): { score: number; candDelta: number; refDelta: number } {
  const refDelta = refVals[refVals.length - 1] - refVals[0];
  const candDelta = candVals[candVals.length - 1] - candVals[0];

  const bothFlat = Math.abs(refDelta) < flatThreshold && Math.abs(candDelta) < flatThreshold;
  let deltaAgreement: number;

  if (bothFlat) {
    const diff = Math.abs(candDelta - refDelta);
    deltaAgreement = Math.max(0.65, 1 - diff / (flatThreshold * 2.5));
  } else {
    const sameSign =
      Math.abs(refDelta) < flatThreshold * 0.5 ||
      Math.abs(candDelta) < flatThreshold * 0.5 ||
      Math.sign(refDelta) === Math.sign(candDelta);
    const denom = Math.max(scaleFloor, Math.abs(refDelta) + Math.abs(candDelta));
    const magClose = Math.max(0, 1 - Math.abs(candDelta - refDelta) / denom);
    deltaAgreement = sameSign ? 0.25 + 0.75 * magClose : 0.15 * magClose;
  }

  const refCurve = zNormalize(resampleArray(refVals, normLen));
  const candCurve = zNormalize(resampleArray(candVals, normLen));
  const shapeCorr = Math.max(0, pearsonCorrelation(refCurve, candCurve));

  const combined = (0.68 * deltaAgreement + 0.32 * shapeCorr) * 100;
  return {
    score: Math.min(99.5, Math.max(0, parseFloat(combined.toFixed(1)))),
    candDelta,
    refDelta,
  };
}

/**
 * Multi-channel similarity matching against a Tree Type's curated Reference Library (D1..Dn).
 * Evaluates:
 *   1. Impedance curve shape (Pearson correlation + DTW + amplitude span)
 *   2. DC V change (Δ DC V + voltage trajectory between selected endpoints)
 *   3. RAW ADC change (Δ RAW ADC + ADC trajectory between selected endpoints)
 */
export function matchNodeAgainstReferences(
  nodeId: string,
  nodePoints: CsvTelemetryPoint[],
  nodeUnit: ImpedanceUnit,
  references: ReferencePattern[],
  minScore = 62
): ReferenceMatchResult[] {
  if (nodePoints.length < 4 || references.length === 0) return [];

  const normLen = 20;
  const allMatches: ReferenceMatchResult[] = [];

  for (const ref of references) {
    if (ref.points.length < 3) continue;

    const refImps = ref.points.map((p) =>
      ref.unit === nodeUnit ? p.value : nodeUnit === "kΩ" ? toKOhm(p.value, ref.unit) : p.value * 1000
    );
    const refResampled = resampleArray(refImps, normLen);
    const refNorm = zNormalize(refResampled);
    const refDeltaZ = refImps[refImps.length - 1] - refImps[0];
    const refSpanZ = Math.max(...refImps) - Math.min(...refImps);

    const refDcVals = ref.points.map((p) => p.dcV).filter((v): v is number => v !== undefined);
    const refAdcVals = ref.points.map((p) => p.rawAdc).filter((v): v is number => v !== undefined);
    const hasRefDc = refDcVals.length >= 2;
    const hasRefAdc = refAdcVals.length >= 2;

    const baseLen = Math.max(4, Math.min(nodePoints.length, ref.points.length));
    const winCandidates = Array.from(
      new Set([
        Math.max(4, Math.round(baseLen * 0.85)),
        baseLen,
        Math.min(nodePoints.length, Math.round(baseLen * 1.15)),
      ])
    ).filter((w) => w >= 4 && w <= nodePoints.length);

    const refMatches: ReferenceMatchResult[] = [];

    for (const winLen of winCandidates) {
      const step = Math.max(1, Math.floor(winLen / 4));
      for (let i = 0; i <= nodePoints.length - winLen; i += step) {
        const slice = nodePoints.slice(i, i + winLen);
        const candImps = slice.map((p) => p.value);
        const candNorm = zNormalize(resampleArray(candImps, normLen));

        const corr = pearsonCorrelation(refNorm, candNorm);
        const dtw = dtwDistance(refNorm, candNorm);
        const dtwSim = Math.exp(-dtw * 1.35);

        const candSpanZ = Math.max(...candImps) - Math.min(...candImps);
        const spanRatio =
          Math.max(refSpanZ, candSpanZ) > 0.05
            ? Math.min(refSpanZ, candSpanZ) / Math.max(refSpanZ, candSpanZ)
            : 1;

        const candDeltaZ = candImps[candImps.length - 1] - candImps[0];
        const sameZDir =
          Math.abs(refDeltaZ) < 0.25 ||
          Math.abs(candDeltaZ) < 0.25 ||
          Math.sign(refDeltaZ) === Math.sign(candDeltaZ)
            ? 1
            : 0.68;

        const impRaw =
          (0.48 * Math.max(0, corr) + 0.34 * dtwSim + 0.18 * spanRatio) * sameZDir * 100;
        const impedanceScore = Math.min(99.5, Math.max(0, parseFloat(impRaw.toFixed(1))));

        // Early pruning for speed when Impedance shape is completely unrelated
        if (impedanceScore < 35) continue;

        const candDcVals = slice.map((p) => p.dcV).filter((v): v is number => v !== undefined);
        const candAdcVals = slice.map((p) => p.rawAdc).filter((v): v is number => v !== undefined);

        let dcVScore: number | null = null;
        let candDeltaDcV: number | undefined;
        let refDeltaDcV: number | undefined;
        if (hasRefDc && candDcVals.length >= 2) {
          const dcSim = computeDeltaChannelSimilarity(refDcVals, candDcVals, 0.015, 0.05, normLen);
          dcVScore = dcSim.score;
          candDeltaDcV = parseFloat(dcSim.candDelta.toFixed(3));
          refDeltaDcV = parseFloat(dcSim.refDelta.toFixed(3));
        }

        let rawAdcScore: number | null = null;
        let candDeltaRawAdc: number | undefined;
        let refDeltaRawAdc: number | undefined;
        if (hasRefAdc && candAdcVals.length >= 2) {
          const adcSim = computeDeltaChannelSimilarity(refAdcVals, candAdcVals, 4.5, 14, normLen);
          rawAdcScore = adcSim.score;
          candDeltaRawAdc = parseFloat(adcSim.candDelta.toFixed(1));
          refDeltaRawAdc = parseFloat(adcSim.refDelta.toFixed(1));
        }

        // Dynamic weighted combination across Impedance shape + Δ DC V + Δ RAW ADC
        let weightSum = 0.5;
        let weightedTotal = impedanceScore * 0.5;
        if (dcVScore !== null) {
          weightSum += 0.25;
          weightedTotal += dcVScore * 0.25;
        }
        if (rawAdcScore !== null) {
          weightSum += 0.25;
          weightedTotal += rawAdcScore * 0.25;
        }

        let overall = weightedTotal / weightSum;
        if (dcVScore !== null && dcVScore < 35) overall *= 0.85;
        if (rawAdcScore !== null && rawAdcScore < 35) overall *= 0.85;
        const overallScore = Math.min(99.4, Math.max(0, parseFloat(overall.toFixed(1))));

        if (overallScore >= minScore) {
          refMatches.push({
            id: makeId("refm"),
            referenceId: ref.id,
            referenceCode: ref.code,
            qualityName: ref.qualityName,
            color: ref.color,
            nodeId,
            startTs: slice[0].ts,
            endTs: slice[slice.length - 1].ts,
            overallScore,
            impedanceScore,
            dcVScore,
            rawAdcScore,
            deltaZ: parseFloat(candDeltaZ.toFixed(2)),
            deltaDcV: candDeltaDcV,
            deltaRawAdc: candDeltaRawAdc,
            refDeltaZ: parseFloat(refDeltaZ.toFixed(2)),
            refDeltaDcV: refDeltaDcV ?? ref.deltaDcV,
            refDeltaRawAdc: refDeltaRawAdc ?? ref.deltaRawAdc,
            sampleCount: slice.length,
          });
        }
      }
    }

    // Per-reference non-maximum suppression so distinct windows for D1..Dn stay crisp
    refMatches.sort((a, b) => b.overallScore - a.overallScore);
    const keptForRef: ReferenceMatchResult[] = [];
    for (const m of refMatches) {
      const overlaps = keptForRef.some(
        (k) => Math.max(k.startTs, m.startTs) <= Math.min(k.endTs, m.endTs)
      );
      if (!overlaps) {
        keptForRef.push(m);
      }
      if (keptForRef.length >= 4) break;
    }

    allMatches.push(...keptForRef);
  }

  return allMatches.sort((a, b) => b.overallScore - a.overallScore);
}

export function summarizeQualityMatches(
  references: ReferencePattern[],
  matches: ReferenceMatchResult[]
): ReferenceQualitySummary[] {
  return references.map((ref) => {
    const forRef = matches
      .filter((m) => m.referenceId === ref.id)
      .sort((a, b) => b.overallScore - a.overallScore);
    return {
      referenceId: ref.id,
      code: ref.code,
      qualityName: ref.qualityName,
      color: ref.color,
      matchCount: forRef.length,
      bestScore: forRef.length > 0 ? forRef[0].overallScore : null,
      bestMatch: forRef.length > 0 ? forRef[0] : null,
      refDeltaZ: ref.deltaZ,
      refDeltaDcV: ref.deltaDcV,
      refDeltaRawAdc: ref.deltaRawAdc,
      unit: ref.unit,
    };
  });
}
