"use client";

import clsx from "clsx";
import { BookMarked, Crosshair, Sparkles } from "lucide-react";
import type { TreeType } from "@/lib/biosarcStore";
import type { ReferenceMatchResult, ReferenceQualitySummary } from "@/lib/patternEngine";

interface QualitySummaryStripProps {
  treeType: TreeType | null;
  nodeName: string;
  summaries: ReferenceQualitySummary[];
  matches: ReferenceMatchResult[];
  minScore: number;
  activeFocusLabel: string | null;
  onChangeMinScore: (val: number) => void;
  onFocusMatch: (match: ReferenceMatchResult) => void;
  onOpenLibrary: () => void;
}

export default function QualitySummaryStrip({
  treeType,
  nodeName,
  summaries,
  matches,
  minScore,
  activeFocusLabel,
  onChangeMinScore,
  onFocusMatch,
  onOpenLibrary,
}: QualitySummaryStripProps) {
  if (!treeType) return null;

  const matchedSummaries = summaries
    .filter((s) => s.bestScore !== null)
    .sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));

  const topSummary = matchedSummaries[0] ?? null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-arc-accent flex-shrink-0" />
            <span className="font-bold text-slate-900">
              {treeType.name} Reference Similarity Summary
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-slate-500 tabular-nums">
              {matches.length} {matches.length === 1 ? "window" : "windows"} highlighted on {nodeName}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            {summaries.length === 0 ? (
              <>
                No reference signatures (D1–Dn) saved under <strong>{treeType.name}</strong> yet.
              </>
            ) : topSummary ? (
              <>
                Dominant similarity:{" "}
                <strong style={{ color: topSummary.color }}>
                  {topSummary.code} · {topSummary.qualityName}
                </strong>{" "}
                at{" "}
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {topSummary.bestScore?.toFixed(1)}%
                </span>{" "}
                across Impedance curve shape, Δ DC V, and Δ RAW ADC
                {matchedSummaries.length > 1
                  ? ` (+ ${matchedSummaries.length - 1} other matching ${
                      matchedSummaries.length - 1 === 1 ? "quality" : "qualities"
                    })`
                  : ""}
                .
              </>
            ) : (
              <>
                No segments matched {treeType.name} references at &ge;{minScore}%. Lower threshold or add more CSV data.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {summaries.length > 0 && (
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 text-xs font-mono">
              {[60, 70, 80].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChangeMinScore(t)}
                  className={clsx(
                    "px-2 py-1 rounded-md transition-colors whitespace-nowrap",
                    minScore === t
                      ? "bg-arc-accent text-white font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  &ge;{t}%
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onOpenLibrary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
          >
            <BookMarked className="w-3.5 h-3.5 text-arc-accent" />
            Manage References ({summaries.length})
          </button>
        </div>
      </div>

      {summaries.length > 0 && (
        <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {summaries.map((item) => {
            const hasMatch = item.bestMatch !== null && item.bestScore !== null;
            const matchLabel = `${item.code} · ${item.qualityName}`;
            const isFocused = activeFocusLabel?.startsWith(matchLabel);

            return (
              <button
                key={item.referenceId}
                type="button"
                disabled={!hasMatch}
                onClick={() => item.bestMatch && onFocusMatch(item.bestMatch)}
                className={clsx(
                  "text-left rounded-lg border p-3 transition-colors flex flex-col justify-between gap-2",
                  hasMatch
                    ? isFocused
                      ? "border-blue-500 bg-blue-50/40"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                    : "border-slate-200/80 bg-slate-50/60 opacity-75 cursor-default"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: item.color }}
                      >
                        {item.code}
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.qualityName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 font-mono tabular-nums">
                    {hasMatch ? (
                      <span className="text-sm font-bold text-slate-900">
                        {item.bestScore?.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                  <span>
                    ΔZ {item.refDeltaZ >= 0 ? "+" : ""}
                    {item.refDeltaZ.toFixed(1)}
                    {item.unit}
                    {item.refDeltaDcV !== undefined
                      ? ` · ${item.refDeltaDcV >= 0 ? "+" : ""}${item.refDeltaDcV.toFixed(2)}V`
                      : ""}
                  </span>
                  {hasMatch ? (
                    <span className="inline-flex items-center gap-1 text-arc-accent font-sans font-semibold">
                      <Crosshair className="w-3 h-3" />
                      {item.matchCount} {item.matchCount === 1 ? "match" : "matches"}
                    </span>
                  ) : (
                    <span>No match</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
