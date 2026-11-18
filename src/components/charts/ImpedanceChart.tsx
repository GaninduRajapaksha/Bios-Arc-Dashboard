"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  LineData,
  SeriesMarker,
  CrosshairMode,
  ColorType,
  LineStyle,
  Time,
} from "lightweight-charts";
import { format } from "date-fns";
import clsx from "clsx";
import {
  Check,
  Maximize2,
  MousePointerClick,
  ScanSearch,
  Upload,
  X,
} from "lucide-react";
import type { CsvTelemetryPoint } from "@/lib/csvParser";
import type { IdentifiedPattern } from "@/lib/patternEngine";
import { computePatternFromWindow } from "@/lib/patternEngine";

export type ChartTimeRange = "24H" | "7D" | "30D" | "90D" | "ALL" | "custom";

export interface FocusedChartWindow {
  startTs: number;
  endTs: number;
  label: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  time: string;
  zMag: string;
  zReal?: string;
  zImag?: string;
  phase?: string;
  tempC?: string;
}

interface ImpedanceChartProps {
  nodeId: string;
  nodeName: string;
  treeName: string;
  location: string;
  csvFileName: string;
  intervalLabel: string;
  points: CsvTelemetryPoint[];
  patterns: IdentifiedPattern[];
  focusedWindow: FocusedChartWindow | null;
  onClearFocus: () => void;
  onSaveManualPattern: (pattern: IdentifiedPattern) => void;
  onAutoScanPatterns: () => void;
  onOpenCsvModal: () => void;
}

const CHART_THEME = {
  bg: "#FFFFFF",
  surface: "#F8FAFC",
  border: "#E2E8F0",
  line: "#2563EB",
  topFill: "rgba(37, 99, 235, 0.14)",
  bottomFill: "rgba(37, 99, 235, 0.0)",
  muted: "#64748B",
  text: "#0F172A",
  textDim: "#475569",
  grid: "#F1F5F9",
};

const RANGE_BUTTONS: { label: string; value: ChartTimeRange }[] = [
  { label: "24H", value: "24H" },
  { label: "7D", value: "7D" },
  { label: "30D", value: "30D" },
  { label: "90D", value: "90D" },
  { label: "ALL", value: "ALL" },
  { label: "Custom", value: "custom" },
];

export default function ImpedanceChart({
  nodeId,
  nodeName,
  treeName,
  location,
  csvFileName,
  intervalLabel,
  points,
  patterns,
  focusedWindow,
  onClearFocus,
  onSaveManualPattern,
  onAutoScanPatterns,
  onOpenCsvModal,
}: ImpedanceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  const [range, setRange] = useState<ChartTimeRange>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Manual pattern selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [pickStartTs, setPickStartTs] = useState<number | null>(null);
  const [pickEndTs, setPickEndTs] = useState<number | null>(null);
  const [draftPatternName, setDraftPatternName] = useState("");

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    time: "",
    zMag: "",
  });

  // Reset manual selection draft when switching nodes
  useEffect(() => {
    setSelectionMode(false);
    setPickStartTs(null);
    setPickEndTs(null);
    setDraftPatternName("");
  }, [nodeId]);

  // Initialize default custom date bounds whenever node points change
  useEffect(() => {
    if (points.length === 0) return;
    const minDate = new Date(points[0].ts * 1000);
    const maxDate = new Date(points[points.length - 1].ts * 1000);
    setCustomFrom(format(minDate, "yyyy-MM-dd"));
    setCustomTo(format(maxDate, "yyyy-MM-dd"));
  }, [nodeId, points]);

  // Filter visible points based on active timeframe
  const filteredPoints = useMemo(() => {
    if (points.length === 0) return [];
    const latestTs = points[points.length - 1].ts;

    if (range === "ALL") return points;
    if (range === "24H") return points.filter((p) => p.ts >= latestTs - 24 * 3600);
    if (range === "7D") return points.filter((p) => p.ts >= latestTs - 7 * 86400);
    if (range === "30D") return points.filter((p) => p.ts >= latestTs - 30 * 86400);
    if (range === "90D") return points.filter((p) => p.ts >= latestTs - 90 * 86400);

    // Custom date range
    const fromSec = customFrom ? Math.floor(new Date(`${customFrom}T00:00:00`).getTime() / 1000) : 0;
    const toSec = customTo ? Math.floor(new Date(`${customTo}T23:59:59`).getTime() / 1000) : Number.MAX_SAFE_INTEGER;
    return points.filter((p) => p.ts >= fromSec && p.ts <= toSec);
  }, [points, range, customFrom, customTo]);

  // Keep refs for chart event listeners
  const filteredPointsRef = useRef<CsvTelemetryPoint[]>(filteredPoints);
  filteredPointsRef.current = filteredPoints;

  const selectionModeRef = useRef(selectionMode);
  selectionModeRef.current = selectionMode;

  const pickStartRef = useRef(pickStartTs);
  pickStartRef.current = pickStartTs;

  const pickEndRef = useRef(pickEndTs);
  pickEndRef.current = pickEndTs;

  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Create chart instance once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.bg },
        textColor: CHART_THEME.textDim,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid, style: LineStyle.Dotted },
        horzLines: { color: CHART_THEME.grid, style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#94A3B8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0F172A",
        },
        horzLine: {
          color: "#94A3B8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0F172A",
        },
      },
      rightPriceScale: {
        borderColor: CHART_THEME.border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: CHART_THEME.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          if (rangeRef.current === "24H") return format(d, "HH:mm");
          if (rangeRef.current === "7D") return format(d, "MMM d HH:mm");
          return format(d, "MMM d");
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    const series = chart.addAreaSeries({
      lineColor: CHART_THEME.line,
      topColor: CHART_THEME.topFill,
      bottomColor: CHART_THEME.bottomFill,
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: CHART_THEME.line,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: CHART_THEME.line,
      crosshairMarkerBackgroundColor: "#FFFFFF",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    resizeObserver.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.resize(width, height);
        }
      }
    });
    resizeObserver.current.observe(containerRef.current);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || !seriesRef.current) {
        setTooltip((t) => ({ ...t, visible: false }));
        return;
      }

      const point = param.seriesData.get(seriesRef.current) as { value: number } | undefined;
      if (!point) {
        setTooltip((t) => ({ ...t, visible: false }));
        return;
      }

      const tsSec = param.time as number;
      const full = filteredPointsRef.current.find((d) => d.ts === tsSec) ?? null;

      setTooltip({
        visible: true,
        x: param.point.x,
        y: param.point.y,
        time: format(new Date(tsSec * 1000), "MMM d, yyyy · HH:mm"),
        zMag: `${point.value.toFixed(2)} Ω`,
        zReal: full?.zReal != null ? `${full.zReal.toFixed(2)} Ω` : undefined,
        zImag: full?.zImag != null ? `${full.zImag.toFixed(2)} Ω` : undefined,
        phase: full?.phase != null ? `${full.phase.toFixed(2)}°` : undefined,
        tempC: full?.tempC != null ? `${full.tempC.toFixed(1)} °C` : undefined,
      });
    });

    chart.subscribeClick((param) => {
      if (!selectionModeRef.current || !param.time) return;
      const clickedTs = param.time as number;
      if (pickStartRef.current === null || (pickStartRef.current !== null && pickEndRef.current !== null)) {
        setPickStartTs(clickedTs);
        setPickEndTs(null);
      } else {
        setPickEndTs(clickedTs);
      }
    });

    return () => {
      resizeObserver.current?.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed data & pattern markers into chart
  useEffect(() => {
    if (!seriesRef.current) return;

    if (filteredPoints.length === 0) {
      seriesRef.current.setData([]);
      seriesRef.current.setMarkers([]);
      return;
    }

    const lineData: LineData[] = filteredPoints.map((pt) => ({
      time: pt.ts as UTCTimestamp,
      value: pt.value,
    }));
    seriesRef.current.setData(lineData);

    // Build markers for identified patterns + draft manual endpoints
    const minTs = filteredPoints[0].ts;
    const maxTs = filteredPoints[filteredPoints.length - 1].ts;

    const markers: SeriesMarker<Time>[] = [];

    for (const pat of patterns) {
      if (pat.endTs < minTs || pat.startTs > maxTs) continue;
      const anchorTs =
        filteredPoints.find((p) => p.ts >= pat.startTs && p.ts <= pat.endTs)?.ts ??
        pat.startTs;

      const color =
        pat.category === "spike"
          ? "#D97706"
          : pat.category === "drop"
          ? "#2563EB"
          : pat.category === "drift"
          ? "#7C3AED"
          : pat.category === "oscillation"
          ? "#DC2626"
          : "#2D6A4F";

      markers.push({
        time: anchorTs as UTCTimestamp,
        position: pat.deltaZ < 0 ? "belowBar" : "aboveBar",
        color,
        shape: pat.source === "manual" ? "square" : "circle",
        text: pat.name.slice(0, 18),
      });
    }

    if (focusedWindow) {
      const focusStart = filteredPoints.find((p) => p.ts >= focusedWindow.startTs)?.ts;
      const focusEnd = [...filteredPoints].reverse().find((p) => p.ts <= focusedWindow.endTs)?.ts;
      if (focusStart) {
        markers.push({
          time: focusStart as UTCTimestamp,
          position: "aboveBar",
          color: "#2D6A4F",
          shape: "arrowDown",
          text: `${focusedWindow.label} Start`,
        });
      }
      if (focusEnd && focusEnd !== focusStart) {
        markers.push({
          time: focusEnd as UTCTimestamp,
          position: "aboveBar",
          color: "#2D6A4F",
          shape: "arrowDown",
          text: "End",
        });
      }
    }

    if (pickStartTs !== null) {
      markers.push({
        time: pickStartTs as UTCTimestamp,
        position: "aboveBar",
        color: "#0F172A",
        shape: "arrowDown",
        text: "Start",
      });
    }
    if (pickEndTs !== null) {
      markers.push({
        time: pickEndTs as UTCTimestamp,
        position: "aboveBar",
        color: "#0F172A",
        shape: "arrowDown",
        text: "End",
      });
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    seriesRef.current.setMarkers(markers);

    if (!focusedWindow) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [filteredPoints, patterns, focusedWindow, pickStartTs, pickEndTs]);

  // Zoom chart smoothly when a pattern or similarity match is focused
  useEffect(() => {
    if (!focusedWindow || !chartRef.current || points.length === 0) return;

    // Ensure full points are visible if focused window sits outside current short timeframe
    const firstVisible = filteredPoints[0]?.ts ?? 0;
    const lastVisible = filteredPoints[filteredPoints.length - 1]?.ts ?? 0;
    if (focusedWindow.startTs < firstVisible || focusedWindow.endTs > lastVisible) {
      setRange("ALL");
      return;
    }

    const span = Math.max(3600 * 6, focusedWindow.endTs - focusedWindow.startTs);
    const pad = Math.round(span * 0.65);
    const minAll = points[0].ts;
    const maxAll = points[points.length - 1].ts;

    chartRef.current.timeScale().setVisibleRange({
      from: Math.max(minAll, focusedWindow.startTs - pad) as UTCTimestamp,
      to: Math.min(maxAll, focusedWindow.endTs + pad) as UTCTimestamp,
    });
  }, [focusedWindow, filteredPoints, points]);

  const handleFitContent = useCallback(() => {
    onClearFocus();
    chartRef.current?.timeScale().fitContent();
  }, [onClearFocus]);

  // Summary metrics for currently filtered dataset
  const summary = useMemo(() => {
    if (filteredPoints.length === 0) return null;
    const vals = filteredPoints.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const first = vals[0];
    const last = vals[vals.length - 1];
    const pct = first !== 0 ? ((last - first) / first) * 100 : 0;
    return {
      latest: last,
      min,
      max,
      avg,
      pct,
    };
  }, [filteredPoints]);

  // Draft pattern preview when 2 endpoints are clicked
  const draftPatternPreview = useMemo(() => {
    if (pickStartTs === null || pickEndTs === null) return null;
    return computePatternFromWindow({
      nodeId,
      points,
      startTs: pickStartTs,
      endTs: pickEndTs,
      name: draftPatternName || "Custom Pattern",
      source: "manual",
      category: "custom",
    });
  }, [nodeId, points, pickStartTs, pickEndTs, draftPatternName]);

  const handleConfirmManualPattern = () => {
    if (!draftPatternPreview) return;
    const finalName = draftPatternName.trim() || `Pattern (${format(new Date(draftPatternPreview.startTs * 1000), "MMM d HH:mm")})`;
    onSaveManualPattern({
      ...draftPatternPreview,
      name: finalName,
    });
    setSelectionMode(false);
    setPickStartTs(null);
    setPickEndTs(null);
    setDraftPatternName("");
  };

  return (
    <section className="flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* ── Chart Header Toolbar ── */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Node identity & latest reading */}
        <div className="flex items-center gap-5 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-arc-accent truncate">{treeName}</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{location || "Sensor Node"}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                {nodeName}
              </h1>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {csvFileName || "No CSV"} · {intervalLabel} · {points.length.toLocaleString()} pts
              </span>
            </div>
          </div>

          {summary && (
            <div className="hidden sm:flex items-baseline gap-2.5 pl-5 border-l border-slate-200">
              <span className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
                {summary.latest.toFixed(1)}
                <span className="text-xs font-medium text-slate-400 ml-1">Ω</span>
              </span>
              <span
                className={clsx(
                  "text-xs font-mono font-semibold tabular-nums",
                  summary.pct > 0.1
                    ? "text-amber-600"
                    : summary.pct < -0.1
                    ? "text-emerald-600"
                    : "text-slate-500"
                )}
              >
                {summary.pct >= 0 ? "+" : ""}
                {summary.pct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Right: Timeframe selector + Pattern & CSV tools */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 border border-slate-200">
            {RANGE_BUTTONS.map((btn) => (
              <button
                key={btn.value}
                type="button"
                onClick={() => {
                  onClearFocus();
                  setRange(btn.value);
                }}
                className={clsx(
                  "px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                  range === btn.value
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectionMode((prev) => !prev);
              setPickStartTs(null);
              setPickEndTs(null);
            }}
            disabled={points.length < 2}
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 disabled:opacity-40",
              selectionMode
                ? "bg-arc-accent text-white border-arc-accent"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            {selectionMode ? "Cancel Select" : "Select Pattern"}
          </button>

          <button
            type="button"
            onClick={onAutoScanPatterns}
            disabled={points.length < 12}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
          >
            <ScanSearch className="w-3.5 h-3.5 text-arc-accent" />
            Scan Patterns
          </button>

          <button
            type="button"
            onClick={onOpenCsvModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            CSV
          </button>

          <button
            type="button"
            onClick={handleFitContent}
            title="Reset zoom & fit all visible data"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shrink-0"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Custom Date Range Sub-bar */}
      {range === "custom" && (
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-700">Custom Range</span>
          <label className="flex items-center gap-1.5 text-slate-600">
            <span>From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2 py-1 font-mono text-xs border border-slate-300 rounded-md bg-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <span>To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2 py-1 font-mono text-xs border border-slate-300 rounded-md bg-white"
            />
          </label>
          <span className="font-mono text-slate-500 tabular-nums ml-auto">
            {filteredPoints.length.toLocaleString()} samples in range
          </span>
        </div>
      )}

      {/* Interactive Manual Pattern Selection Sub-bar */}
      {selectionMode && (
        <div className="px-5 py-2.5 bg-emerald-50/70 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-emerald-950 font-medium">
            {pickStartTs === null && (
              <span>Step 1: Click the start point of the pattern directly on the impedance curve.</span>
            )}
            {pickStartTs !== null && pickEndTs === null && (
              <span className="font-mono tabular-nums">
                Start set at {format(new Date(pickStartTs * 1000), "MMM d, HH:mm")} — Step 2: Click the end point on the chart.
              </span>
            )}
            {draftPatternPreview && (
              <span className="font-mono tabular-nums">
                Selected {draftPatternPreview.sampleCount} pts ·{" "}
                {format(new Date(draftPatternPreview.startTs * 1000), "MMM d HH:mm")} →{" "}
                {format(new Date(draftPatternPreview.endTs * 1000), "MMM d HH:mm")} · Δ
                {draftPatternPreview.deltaZ >= 0 ? "+" : ""}
                {draftPatternPreview.deltaZ.toFixed(1)} Ω
              </span>
            )}
          </div>

          {draftPatternPreview && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftPatternName}
                onChange={(e) => setDraftPatternName(e.target.value)}
                placeholder="Name this pattern..."
                className="px-2.5 py-1 text-xs border border-emerald-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-arc-accent/25 w-48"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmManualPattern();
                }}
              />
              <button
                type="button"
                onClick={handleConfirmManualPattern}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Save Pattern
              </button>
            </div>
          )}
        </div>
      )}

      {/* Focused pattern / similarity match indicator */}
      {focusedWindow && !selectionMode && (
        <div className="px-5 py-2 bg-blue-50/70 border-b border-blue-200 flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-blue-900 font-mono tabular-nums">
            Focused: {focusedWindow.label} ({format(new Date(focusedWindow.startTs * 1000), "MMM d, yyyy HH:mm")} →{" "}
            {format(new Date(focusedWindow.endTs * 1000), "MMM d, yyyy HH:mm")})
          </span>
          <button
            type="button"
            onClick={handleFitContent}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear Focus
          </button>
        </div>
      )}

      {/* ── Main Chart Canvas ── */}
      <div
        className={clsx(
          "relative w-full h-[360px] sm:h-[400px]",
          selectionMode && "cursor-crosshair"
        )}
      >
        {points.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 p-6">
            <div className="max-w-sm text-center space-y-3">
              <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-arc-accent">
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                No CSV telemetry attached to {nodeName}
              </h3>
              <p className="text-xs text-slate-500">
                Upload a Time vs. Impedance CSV file to plot the curve and identify recurring patterns.
              </p>
              <button
                type="button"
                onClick={onOpenCsvModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload CSV File
              </button>
            </div>
          </div>
        ) : filteredPoints.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">
                No readings in this timeframe
              </p>
              <button
                type="button"
                onClick={() => setRange("ALL")}
                className="text-xs font-semibold text-arc-accent hover:underline"
              >
                Switch to ALL data
              </button>
            </div>
          </div>
        ) : null}

        <div ref={containerRef} className="w-full h-full" />

        {/* Crosshair tooltip */}
        {tooltip.visible && points.length > 0 && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth ?? 500) - 195),
              top: Math.max(tooltip.y - 84, 10),
            }}
          >
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-lg min-w-[175px]">
              <div className="text-[11px] font-mono font-semibold text-slate-900 mb-1.5">
                {tooltip.time}
              </div>
              <div className="space-y-0.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">|Z|</span>
                  <span className="font-bold text-arc-accent2">{tooltip.zMag}</span>
                </div>
                {tooltip.zReal && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">R</span>
                    <span className="text-slate-800">{tooltip.zReal}</span>
                  </div>
                )}
                {tooltip.zImag && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">jX</span>
                    <span className="text-slate-800">{tooltip.zImag}</span>
                  </div>
                )}
                {tooltip.phase && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Phase</span>
                    <span className="text-slate-800">{tooltip.phase}</span>
                  </div>
                )}
                {tooltip.tempC && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Temp</span>
                    <span className="text-slate-800">{tooltip.tempC}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Stats Bar ── */}
      <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-mono tabular-nums">
        {summary ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Samples:</span>
              <span className="font-semibold text-slate-800">
                {filteredPoints.length.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Min |Z|:</span>
              <span className="font-semibold text-slate-800">{summary.min.toFixed(2)} Ω</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Max |Z|:</span>
              <span className="font-semibold text-slate-800">{summary.max.toFixed(2)} Ω</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Avg |Z|:</span>
              <span className="font-semibold text-slate-800">{summary.avg.toFixed(2)} Ω</span>
            </div>
          </>
        ) : (
          <span className="text-slate-400">Awaiting CSV telemetry</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-slate-500">
          <span className="w-3 h-0.5 bg-arc-accent2 inline-block" />
          <span>Time vs. Impedance |Z| (Ω)</span>
        </div>
      </div>
    </section>
  );
}
