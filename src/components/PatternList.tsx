"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
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
import type {
  IdentifiedPattern,
  PatternCategory,
  SimilarityMatch,
} from "@/lib/patternEngine";

interface PatternListProps {
  nodeName: string;
  patterns: IdentifiedPattern[];
  activeFocusLabel: string | null;
  similaritySourcePattern: IdentifiedPattern | null;
  similarityMatches: SimilarityMatch[];
  minSimilarity: number;
  onChangeMinSimilarity: (val: number) => void;
  onFocusPattern: (pattern: IdentifiedPattern) => void;
  onRenamePattern: (patternId: string, newName: string) => void;
  onDeletePattern: (patternId: string) => void;
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
  const hours = Math.max(1, Math.round((endTs - startTs) / 3600));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export default function PatternList({
  nodeName,
  patterns,
  activeFocusLabel,
  similaritySourcePattern,
  similarityMatches,
  minSimilarity,
  onChangeMinSimilarity,
  onFocusPattern,
  onRenamePattern,
  onDeletePattern,
  onFindSimilar,
  onCloseSimilarity,
  onJumpToMatch,
}: PatternListProps) {
  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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
                      {format(new Date(m.startTs * 1000), "MMM d, yyyy HH:mm")} &rarr;{" "}
                      {format(new Date(m.endTs * 1000), "MMM d, HH:mm")} · {m.sampleCount} pts
                    </div>
                  </div>

                  <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-400 mr-1.5">Avg</span>
                      <span className="font-semibold text-slate-800">{m.avgZ.toFixed(1)} Ω</span>
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
                        {m.deltaZ.toFixed(1)} Ω ({m.deltaPct.toFixed(1)}%)
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

      {/* ── Identified Patterns Detailed List (Under Chart) ── */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Identified Patterns for {nodeName}
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {patterns.length} {patterns.length === 1 ? "pattern" : "patterns"} recorded · Rename, focus on chart, or scan all node datasets for matches
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
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

            {/* Source filter segmented buttons */}
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
        </div>

        {visiblePatterns.length === 0 ? (
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
                  {/* Left: Name + Type + Note */}
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

                  {/* Middle: Detailed tabular metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs font-mono tabular-nums flex-shrink-0">
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Time Window</div>
                      <div className="text-slate-800 font-medium">
                        {format(new Date(pat.startTs * 1000), "MMM d HH:mm")} &rarr;{" "}
                        {format(new Date(pat.endTs * 1000), "MMM d HH:mm")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Duration</div>
                      <div className="text-slate-800 font-medium">
                        {formatDuration(pat.startTs, pat.endTs)} ({pat.sampleCount} pts)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Range / Avg |Z|</div>
                      <div className="text-slate-800 font-medium">
                        {pat.minZ.toFixed(0)}–{pat.maxZ.toFixed(0)} Ω ({pat.avgZ.toFixed(1)})
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">Net Shift Δ|Z|</div>
                      <div
                        className={clsx(
                          "font-semibold",
                          pat.deltaZ >= 0 ? "text-amber-700" : "text-blue-700"
                        )}
                      >
                        {pat.deltaZ >= 0 ? "+" : ""}
                        {pat.deltaZ.toFixed(1)} Ω ({pat.deltaPct >= 0 ? "+" : ""}
                        {pat.deltaPct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
