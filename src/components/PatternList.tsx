"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  Crosshair,
  GitCompareArrows,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import type { CsvTelemetryPoint, ImpedanceUnit } from "@/lib/csvParser";
import type {
  IdentifiedPattern,
  PatternCategory,
  ReferenceMatchResult,
  ReferencePattern,
  SimilarityMatch,
} from "@/lib/patternEngine";

interface PatternListProps {
  nodeName: string;
  treeTypeName?: string;
  nextRefCode?: string;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  patterns: IdentifiedPattern[];
  references: ReferencePattern[];
  referenceMatches: ReferenceMatchResult[];
  activeFocusLabel: string | null;
  similaritySourcePattern: IdentifiedPattern | null;
  similarityMatches: SimilarityMatch[];
  minSimilarity: number;
  onChangeMinSimilarity: (val: number) => void;
  onFocusPattern: (pattern: IdentifiedPattern) => void;
  onFocusReferenceMatch: (match: ReferenceMatchResult) => void;
  onRenamePattern: (patternId: string, newName: string) => void;
  onDeletePattern: (patternId: string) => void;
  onPinPatternAsReference: (pattern: IdentifiedPattern) => void;
  onFindSimilar: (pattern: IdentifiedPattern) => void;
  onCloseSimilarity: () => void;
  onJumpToMatch: (match: SimilarityMatch) => void;
}

const CATEGORY_META: Record<
  PatternCategory,
  { label: string; toneClass: string; Icon: typeof Activity }
> = {
  spike: { label: "Spike", toneClass: "text-amber-700", Icon: ArrowUpRight },
  drop: { label: "Drop", toneClass: "text-blue-700", Icon: ArrowDownRight },
  drift: { label: "Drift", toneClass: "text-violet-700", Icon: TrendingUp },
  oscillation: { label: "Oscillation", toneClass: "text-red-700", Icon: Activity },
  custom: { label: "Custom", toneClass: "text-arc-accent", Icon: Sparkles },
};

function formatDuration(startTs: number, endTs: number): string {
  const sec = Math.max(1, endTs - startTs);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = Math.round(sec / 3600);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function formatWindowRange(startTs: number, endTs: number): string {
  const shortSpan = endTs - startTs < 24 * 3600;
  const fmt = shortSpan ? "MMM d HH:mm:ss" : "MMM d HH:mm";
  return `${format(new Date(startTs * 1000), fmt)} → ${format(new Date(endTs * 1000), fmt)}`;
}

export default function PatternList({
  nodeName,
  treeTypeName,
  nextRefCode = "D1",
  unit,
  points,
  patterns,
  references,
  referenceMatches,
  activeFocusLabel,
  similaritySourcePattern,
  similarityMatches,
  minSimilarity,
  onChangeMinSimilarity,
  onFocusPattern,
  onFocusReferenceMatch,
  onRenamePattern,
  onDeletePattern,
  onPinPatternAsReference,
  onFindSimilar,
  onCloseSimilarity,
  onJumpToMatch,
}: PatternListProps) {
  const [bottomView, setBottomView] = useState<"references" | "patterns" | "csv">(
    references.length > 0 ? "references" : "patterns"
  );
  const [refFilterId, setRefFilterId] = useState<string>("all");
  const [refSort, setRefSort] = useState<"score" | "time">("score");

  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    setRefFilterId("all");
  }, [treeTypeName]);

  const visibleRefMatches = useMemo(() => {
    const filtered = referenceMatches.filter((m) =>
      refFilterId === "all" ? true : m.referenceId === refFilterId
    );
    return [...filtered].sort((a, b) =>
      refSort === "score" ? b.overallScore - a.overallScore : a.startTs - b.startTs
    );
  }, [referenceMatches, refFilterId, refSort]);

  const visiblePatterns = useMemo(() => {
    return patterns.filter((p) => {
      if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.summaryNote.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [patterns, sourceFilter, searchQuery]);

  const startRename = (pat: IdentifiedPattern) => {
    setEditingId(pat.id);
    setEditingName(pat.name);
  };

  const commitRename = (patternId: string) => {
    if (editingName.trim()) {
      onRenamePattern(patternId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="space-y-4">
      {/* ── Cross-Dataset Similarity Results Panel ── */}
      {similaritySourcePattern && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <GitCompareArrows className="w-4 h-4 text-arc-accent flex-shrink-0" />
                <span>Cross-Dataset Pattern Match</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {similarityMatches.length}{" "}
                  {similarityMatches.length === 1 ? "match" : "matches"} across all nodes
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
                Similar to &ldquo;{similaritySourcePattern.name}&rdquo;
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
                {[60, 70, 80].map((thresh) => (
                  <button
                    key={thresh}
                    type="button"
                    onClick={() => onChangeMinSimilarity(thresh)}
                    className={clsx(
                      "px-2 py-1 rounded-md transition-colors whitespace-nowrap",
                      minSimilarity === thresh
                        ? "bg-arc-accent text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    &ge;{thresh}%
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onCloseSimilarity}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>
          </div>

          {similarityMatches.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-slate-500">
              No segments matched at &ge;{minSimilarity}% similarity. Try lowering the threshold to 60% or adding more node CSV datasets.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {similarityMatches.map((m) => (
                <div
                  key={m.id}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">{m.targetTreeName}</span>
                      <span aria-hidden="true">/</span>
                      <span className="font-medium text-arc-accent">{m.targetNodeName}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-600 tabular-nums mt-0.5">
                      {formatWindowRange(m.startTs, m.endTs)} · {m.sampleCount} pts
                    </div>
                  </div>

                  <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-400 mr-1.5">Avg</span>
                      <span className="font-semibold text-slate-800">
                        {m.avgZ.toFixed(2)} {m.targetUnit}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 mr-1.5">Δ</span>
                      <span
                        className={clsx(
                          "font-semibold",
                          m.deltaZ >= 0 ? "text-amber-700" : "text-blue-700"
                        )}
                      >
                        {m.deltaZ >= 0 ? "+" : ""}
                        {m.deltaZ.toFixed(2)} {m.targetUnit} ({m.deltaPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="text-right min-w-[68px]">
                      <span className="text-sm font-bold text-arc-accent">
                        {m.similarityScore.toFixed(1)}%
                      </span>
                      <div className="text-[10px] text-slate-400 font-sans">match</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToMatch(m)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white font-sans text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Inspect on Chart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Under-Chart Inspection Panel: Reference Matches | Identified Patterns | CSV Log ── */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {bottomView === "references"
                  ? `${treeTypeName ?? "Tree Type"} Reference Matches for ${nodeName}`
                  : bottomView === "patterns"
                  ? `Identified Patterns for ${nodeName}`
                  : `CSV Readings for ${nodeName}`}
              </h2>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {bottomView === "references"
                  ? `${referenceMatches.length} matched windows · Scored by Impedance shape + Δ DC V + Δ RAW ADC`
                  : bottomView === "patterns"
                  ? `${patterns.length} ${patterns.length === 1 ? "pattern" : "patterns"} · Rename, pin as reference, or scan across datasets`
                  : `${points.length.toLocaleString()} rows · Time | RAW ADC | DC V | Impedance (${unit})`}
              </p>
            </div>

            <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setBottomView("references")}
                className={clsx(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                  bottomView === "references"
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Reference Matches ({referenceMatches.length})
              </button>
              <button
                type="button"
                onClick={() => setBottomView("patterns")}
                className={clsx(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                  bottomView === "patterns"
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Identified Patterns ({patterns.length})
              </button>
              <button
                type="button"
                onClick={() => setBottomView("csv")}
                className={clsx(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                  bottomView === "csv"
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                CSV Log ({points.length})
              </button>
            </div>
          </div>

          {bottomView === "references" && references.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={refFilterId}
                onChange={(e) => setRefFilterId(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700"
              >
                <option value="all">All References ({references.length})</option>
                {references.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.qualityName}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRefSort("score")}
                  className={clsx(
                    "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap",
                    refSort === "score"
                      ? "bg-white text-slate-900 shadow-sm font-semibold"
                      : "text-slate-600"
                  )}
                >
                  Best Match %
                </button>
                <button
                  type="button"
                  onClick={() => setRefSort("time")}
                  className={clsx(
                    "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap",
                    refSort === "time"
                      ? "bg-white text-slate-900 shadow-sm font-semibold"
                      : "text-slate-600"
                  )}
                >
                  Chronological
                </button>
              </div>
            </div>
          )}

          {bottomView === "patterns" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter patterns..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-arc-accent/20 focus:border-arc-accent w-44"
                />
              </div>

              <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "auto", label: "Auto" },
                    { id: "manual", label: "Manual" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSourceFilter(tab.id)}
                    className={clsx(
                      "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                      sourceFilter === tab.id
                        ? "bg-white text-slate-900 shadow-sm font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab 1: Reference Matches */}
        {bottomView === "references" ? (
          references.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-700">
                No reference signatures defined for {treeTypeName ?? "this Tree Type"}
              </p>
              <p className="text-xs text-slate-500">
                Open the Reference Library or use &ldquo;Select Pattern&rdquo; above the chart to add D1–Dn references.
              </p>
            </div>
          ) : visibleRefMatches.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-700">
                No segments matched the current reference filter or similarity threshold
              </p>
              <p className="text-xs text-slate-500">
                Try lowering the threshold to 60% in the Reference Similarity Summary strip above or switching filter to All References.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleRefMatches.map((m) => {
                const focusTag = `${m.referenceCode} · ${m.qualityName}`;
                const isFocused = activeFocusLabel?.startsWith(focusTag);

                return (
                  <div
                    key={m.id}
                    className={clsx(
                      "px-5 py-3.5 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-4",
                      isFocused ? "bg-blue-50/40" : "hover:bg-slate-50/80"
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: m.color }}
                        />
                        <span
                          className="text-xs font-mono font-bold"
                          style={{ color: m.color }}
                        >
                          {m.referenceCode}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onFocusReferenceMatch(m)}
                          className="text-sm font-bold text-slate-900 hover:text-arc-accent2 text-left"
                        >
                          {m.qualityName}
                        </button>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatWindowRange(m.startTs, m.endTs)} ({formatDuration(m.startTs, m.endTs)} ·{" "}
                          {m.sampleCount} pts)
                        </span>
                      </div>

                      <div className="text-xs font-mono tabular-nums text-slate-500">
                        Ref baseline: ΔZ {m.refDeltaZ >= 0 ? "+" : ""}
                        {m.refDeltaZ.toFixed(2)} {unit}
                        {m.refDeltaDcV !== undefined
                          ? ` · ΔDC V ${m.refDeltaDcV >= 0 ? "+" : ""}${m.refDeltaDcV.toFixed(3)}V`
                          : ""}
                        {m.refDeltaRawAdc !== undefined
                          ? ` · ΔADC ${m.refDeltaRawAdc >= 0 ? "+" : ""}${m.refDeltaRawAdc.toFixed(1)}`
                          : ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-xs font-mono tabular-nums flex-shrink-0">
                      <div>
                        <div className="text-[11px] font-sans text-slate-400">Impedance Shape</div>
                        <div className="font-semibold text-arc-accent2">
                          {m.impedanceScore.toFixed(1)}%{" "}
                          <span className="text-slate-500 font-normal">
                            ({m.deltaZ >= 0 ? "+" : ""}
                            {m.deltaZ.toFixed(2)} {unit})
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-sans text-slate-400">DC V Change</div>
                        <div className="font-semibold text-arc-accent">
                          {m.dcVScore !== null ? `${m.dcVScore.toFixed(1)}%` : "—"}{" "}
                          <span className="text-slate-500 font-normal">
                            {m.deltaDcV !== undefined
                              ? `(${m.deltaDcV >= 0 ? "+" : ""}${m.deltaDcV.toFixed(3)}V)`
                              : ""}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-sans text-slate-400">RAW ADC Change</div>
                        <div className="font-semibold text-violet-700">
                          {m.rawAdcScore !== null ? `${m.rawAdcScore.toFixed(1)}%` : "—"}{" "}
                          <span className="text-slate-500 font-normal">
                            {m.deltaRawAdc !== undefined
                              ? `(${m.deltaRawAdc >= 0 ? "+" : ""}${m.deltaRawAdc.toFixed(1)})`
                              : ""}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-sans text-slate-400">Overall Match</div>
                        <div className="text-sm font-bold text-slate-900">
                          {m.overallScore.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onFocusReferenceMatch(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Inspect on Chart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : bottomView === "csv" ? (
          points.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-slate-500">
              No CSV rows loaded for this node.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-sans font-semibold">
                  <tr>
                    <th className="px-5 py-2.5">Time</th>
                    <th className="px-5 py-2.5 text-right">RAW ADC</th>
                    <th className="px-5 py-2.5 text-right">DC V</th>
                    <th className="px-5 py-2.5 text-right">Impedance ({unit})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {points.slice(0, 500).map((pt) => (
                    <tr key={pt.ts} className="hover:bg-slate-50/80">
                      <td className="px-5 py-2 text-slate-700">
                        {format(new Date(pt.ts * 1000), "yyyy-MM-dd HH:mm:ss")}
                      </td>
                      <td className="px-5 py-2 text-right text-violet-700 font-medium">
                        {pt.rawAdc !== undefined ? pt.rawAdc.toFixed(1) : "—"}
                      </td>
                      <td className="px-5 py-2 text-right text-arc-accent font-medium">
                        {pt.dcV !== undefined ? `${pt.dcV.toFixed(3)} V` : "—"}
                      </td>
                      <td className="px-5 py-2 text-right text-arc-accent2 font-semibold">
                        {pt.value.toFixed(2)} {unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {points.length > 500 && (
                <div className="px-5 py-2.5 text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
                  Showing first 500 of {points.length.toLocaleString()} rows.
                </div>
              )}
            </div>
          )
        ) : visiblePatterns.length === 0 ? (
          <div className="px-5 py-10 text-center space-y-1.5">
            <p className="text-sm font-medium text-slate-700">
              {patterns.length === 0
                ? "No patterns identified yet for this node"
                : "No patterns match your current filter"}
            </p>
            <p className="text-xs text-slate-500">
              Use &ldquo;Scan Patterns&rdquo; to auto-detect anomalies or click &ldquo;Select Pattern&rdquo; above the chart to highlight and name a custom window.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visiblePatterns.map((pat) => {
              const meta = CATEGORY_META[pat.category] ?? CATEGORY_META.custom;
              const CategoryIcon = meta.Icon;
              const isEditing = editingId === pat.id;
              const isFocused = activeFocusLabel === pat.name;

              return (
                <div
                  key={pat.id}
                  className={clsx(
                    "px-5 py-3.5 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-4",
                    isFocused ? "bg-blue-50/40" : "hover:bg-slate-50/80"
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(pat.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="px-2.5 py-1 text-sm font-semibold border border-arc-accent rounded-md bg-white text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitRename(pat.id)}
                            className="p-1 rounded-md bg-arc-accent text-white hover:bg-arc-accentHover"
                            title="Save name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-900"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onFocusPattern(pat)}
                          className="text-sm font-semibold text-slate-900 hover:text-arc-accent2 transition-colors text-left"
                        >
                          {pat.name}
                        </button>
                      )}

                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>

                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          meta.toneClass
                        )}
                      >
                        <CategoryIcon className="w-3.5 h-3.5" />
                        {pat.source === "auto" ? "Auto" : "Manual"} · {meta.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">{pat.summaryNote}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-5 gap-y-2 text-xs font-mono tabular-nums flex-shrink-0">
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Time Window</div>
                      <div className="text-slate-800 font-medium">
                        {formatWindowRange(pat.startTs, pat.endTs)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Duration</div>
                      <div className="text-slate-800 font-medium">
                        {formatDuration(pat.startTs, pat.endTs)} ({pat.sampleCount} pts)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">RAW ADC / DC V</div>
                      <div className="text-slate-800 font-medium">
                        {pat.avgRawAdc !== undefined ? pat.avgRawAdc.toFixed(1) : "—"} ·{" "}
                        {pat.avgDcV !== undefined ? `${pat.avgDcV.toFixed(3)}V` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Impedance ({unit})</div>
                      <div className="text-slate-800 font-medium">
                        {pat.minZ.toFixed(2)}–{pat.maxZ.toFixed(2)} ({pat.avgZ.toFixed(2)})
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Net Shift Δ</div>
                      <div
                        className={clsx(
                          "font-semibold",
                          pat.deltaZ >= 0 ? "text-amber-700" : "text-blue-700"
                        )}
                      >
                        {pat.deltaZ >= 0 ? "+" : ""}
                        {pat.deltaZ.toFixed(2)} {unit} ({pat.deltaPct >= 0 ? "+" : ""}
                        {pat.deltaPct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onFocusPattern(pat)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(pat)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onPinPatternAsReference(pat)}
                      title={`Save as ${nextRefCode} Reference under ${treeTypeName ?? "Tree Type"}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/70 whitespace-nowrap shrink-0"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      Pin as {nextRefCode}
                    </button>
                    <button
                      type="button"
                      onClick={() => onFindSimilar(pat)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <GitCompareArrows className="w-3.5 h-3.5" />
                      Find Similar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePattern(pat.id)}
                      title="Delete pattern"
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
