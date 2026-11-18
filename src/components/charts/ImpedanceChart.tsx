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
import type { CsvTelemetryPoint, ImpedanceUnit } from "@/lib/csvParser";
import type { IdentifiedPattern } from "@/lib/patternEngine";
import { computePatternFromWindow } from "@/lib/patternEngine";

export type ChartTimeRange = "15M" | "1H" | "24H" | "7D" | "30D" | "ALL" | "custom";
export type ChartChannel = "impedance" | "dcV" | "rawAdc";

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
  impedance: string;
  dcV?: string;
  rawAdc?: string;
}

interface ImpedanceChartProps {
  nodeId: string;
  nodeName: string;
  treeName: string;
  location: string;
  csvFileName: string;
  intervalLabel: string;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  patterns: IdentifiedPattern[];
  focusedWindow: FocusedChartWindow | null;
  onClearFocus: () => void;
  onSaveManualPattern: (pattern: IdentifiedPattern) => void;
  onAutoScanPatterns: () => void;
  onOpenCsvModal: () => void;
}

const CHANNEL_CONFIG: Record<
  ChartChannel,
  { label: string; shortLabel: string; line: string; topFill: string; bottomFill: string }
> = {
  impedance: {
    label: "Impedance",
    shortLabel: "Impedance",
    line: "#2563EB",
    topFill: "rgba(37, 99, 235, 0.14)",
    bottomFill: "rgba(37, 99, 235, 0.0)",
  },
  dcV: {
    label: "DC V",
    shortLabel: "DC V",
    line: "#2D6A4F",
    topFill: "rgba(45, 106, 79, 0.14)",
    bottomFill: "rgba(45, 106, 79, 0.0)",
  },
  rawAdc: {
    label: "RAW ADC",
    shortLabel: "RAW ADC",
    line: "#7C3AED",
    topFill: "rgba(124, 58, 237, 0.12)",
    bottomFill: "rgba(124, 58, 237, 0.0)",
  },
};

const RANGE_BUTTONS: { label: string; value: ChartTimeRange }[] = [
  { label: "15M", value: "15M" },
  { label: "1H", value: "1H" },
  { label: "24H", value: "24H" },
  { label: "7D", value: "7D" },
  { label: "30D", value: "30D" },
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
  unit,
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

  const [channel, setChannel] = useState<ChartChannel>("impedance");
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
    impedance: "",
  });

  const hasRawAdc = useMemo(() => points.some((p) => p.rawAdc !== undefined), [points]);
  const hasDcV = useMemo(() => points.some((p) => p.dcV !== undefined), [points]);

  // Reset to Impedance if switched node lacks selected secondary channel
  useEffect(() => {
    setSelectionMode(false);
    setPickStartTs(null);
    setPickEndTs(null);
    setDraftPatternName("");
    if (channel === "rawAdc" && !hasRawAdc) setChannel("impedance");
    if (channel === "dcV" && !hasDcV) setChannel("impedance");
  }, [nodeId, channel, hasRawAdc, hasDcV]);

  useEffect(() => {
    if (points.length === 0) return;
    const minDate = new Date(points[0].ts * 1000);
    const maxDate = new Date(points[points.length - 1].ts * 1000);
    setCustomFrom(format(minDate, "yyyy-MM-dd"));
    setCustomTo(format(maxDate, "yyyy-MM-dd"));
  }, [nodeId, points]);

  const filteredPoints = useMemo(() => {
    if (points.length === 0) return [];
    const latestTs = points[points.length - 1].ts;

    if (range === "ALL") return points;
    if (range === "15M") return points.filter((p) => p.ts >= latestTs - 15 * 60);
    if (range === "1H") return points.filter((p) => p.ts >= latestTs - 3600);
    if (range === "24H") return points.filter((p) => p.ts >= latestTs - 24 * 3600);
    if (range === "7D") return points.filter((p) => p.ts >= latestTs - 7 * 86400);
    if (range === "30D") return points.filter((p) => p.ts >= latestTs - 30 * 86400);

    const fromSec = customFrom
      ? Math.floor(new Date(`${customFrom}T00:00:00`).getTime() / 1000)
      : 0;
    const toSec = customTo
      ? Math.floor(new Date(`${customTo}T23:59:59`).getTime() / 1000)
      : Number.MAX_SAFE_INTEGER;
    return points.filter((p) => p.ts >= fromSec && p.ts <= toSec);
  }, [points, range, customFrom, customTo]);

  const spanSeconds = useMemo(() => {
    if (filteredPoints.length < 2) return 0;
    return filteredPoints[filteredPoints.length - 1].ts - filteredPoints[0].ts;
  }, [filteredPoints]);

  const filteredPointsRef = useRef<CsvTelemetryPoint[]>(filteredPoints);
  filteredPointsRef.current = filteredPoints;

  const selectionModeRef = useRef(selectionMode);
  selectionModeRef.current = selectionMode;

  const pickStartRef = useRef(pickStartTs);
  pickStartRef.current = pickStartTs;

  const pickEndRef = useRef(pickEndTs);
  pickEndRef.current = pickEndTs;

  const spanSecondsRef = useRef(spanSeconds);
  spanSecondsRef.current = spanSeconds;

  const unitRef = useRef(unit);
  unitRef.current = unit;

  // Create chart instance once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#FFFFFF" },
        textColor: "#475569",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#F1F5F9", style: LineStyle.Dotted },
        horzLines: { color: "#F1F5F9", style: LineStyle.Dotted },
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
        borderColor: "#E2E8F0",
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#E2E8F0",
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          const span = spanSecondsRef.current;
          if (span > 0 && span <= 6 * 3600) return format(d, "HH:mm:ss");
          if (span > 0 && span <= 48 * 3600) return format(d, "HH:mm");
          if (span > 0 && span <= 14 * 86400) return format(d, "MMM d HH:mm");
          return format(d, "MMM d");
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    const series = chart.addAreaSeries({
      lineColor: CHANNEL_CONFIG.impedance.line,
      topColor: CHANNEL_CONFIG.impedance.topFill,
      bottomColor: CHANNEL_CONFIG.impedance.bottomFill,
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: CHANNEL_CONFIG.impedance.line,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: CHANNEL_CONFIG.impedance.line,
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
        time: format(new Date(tsSec * 1000), "yyyy-MM-dd HH:mm:ss"),
        impedance: `${(full?.value ?? point.value).toFixed(2)} ${unitRef.current}`,
        dcV: full?.dcV != null ? `${full.dcV.toFixed(3)} V` : undefined,
        rawAdc: full?.rawAdc != null ? `${full.rawAdc.toFixed(1)}` : undefined,
      });
    });

    chart.subscribeClick((param) => {
      if (!selectionModeRef.current || !param.time) return;
      const clickedTs = param.time as number;
      if (
        pickStartRef.current === null ||
        (pickStartRef.current !== null && pickEndRef.current !== null)
      ) {
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

  // Update series color, precision, and data when channel / points / markers change
  useEffect(() => {
    if (!seriesRef.current) return;

    const cfg = CHANNEL_CONFIG[channel];
    seriesRef.current.applyOptions({
      lineColor: cfg.line,
      topColor: cfg.topFill,
      bottomColor: cfg.bottomFill,
      priceLineColor: cfg.line,
      crosshairMarkerBorderColor: cfg.line,
      priceFormat:
        channel === "dcV"
          ? { type: "price", precision: 3, minMove: 0.001 }
          : channel === "rawAdc"
          ? { type: "price", precision: 1, minMove: 0.1 }
          : { type: "price", precision: 2, minMove: 0.01 },
    });

    if (filteredPoints.length === 0) {
      seriesRef.current.setData([]);
      seriesRef.current.setMarkers([]);
      return;
    }

    const lineData: LineData[] = [];
    for (const pt of filteredPoints) {
      const val =
        channel === "dcV"
          ? pt.dcV
          : channel === "rawAdc"
          ? pt.rawAdc
          : pt.value;
      if (val !== undefined) {
        lineData.push({ time: pt.ts as UTCTimestamp, value: val });
      }
    }

    seriesRef.current.setData(lineData);

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
  }, [filteredPoints, channel, patterns, focusedWindow, pickStartTs, pickEndTs]);

  useEffect(() => {
    if (!focusedWindow || !chartRef.current || points.length === 0) return;

    const firstVisible = filteredPoints[0]?.ts ?? 0;
    const lastVisible = filteredPoints[filteredPoints.length - 1]?.ts ?? 0;
    if (focusedWindow.startTs < firstVisible || focusedWindow.endTs > lastVisible) {
      setRange("ALL");
      return;
    }

    const span = Math.max(30, focusedWindow.endTs - focusedWindow.startTs);
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

  const channelUnit = channel === "dcV" ? "V" : channel === "rawAdc" ? "ADC" : unit;
  const channelPrecision = channel === "dcV" ? 3 : channel === "rawAdc" ? 1 : 2;

  const summary = useMemo(() => {
    if (filteredPoints.length === 0) return null;
    const vals = filteredPoints
      .map((p) =>
        channel === "dcV" ? p.dcV : channel === "rawAdc" ? p.rawAdc : p.value
      )
      .filter((v): v is number => v !== undefined);
    if (vals.length === 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const first = vals[0];
    const last = vals[vals.length - 1];
    const pct = first !== 0 ? ((last - first) / first) * 100 : 0;
    return { latest: last, min, max, avg, pct };
  }, [filteredPoints, channel]);

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
      unit,
    });
  }, [nodeId, points, pickStartTs, pickEndTs, draftPatternName, unit]);

  const handleConfirmManualPattern = () => {
    if (!draftPatternPreview) return;
    const finalName =
      draftPatternName.trim() ||
      `Pattern (${format(new Date(draftPatternPreview.startTs * 1000), "HH:mm:ss")})`;
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
                {summary.latest.toFixed(channelPrecision)}
                <span className="text-xs font-medium text-slate-400 ml-1">
                  {channelUnit}
                </span>
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

        {/* Right: Channel Switcher + Timeframe Switcher + Pattern & CSV Tools */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric channel selector (Impedance | DC V | RAW ADC) */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setChannel("impedance")}
              className={clsx(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                channel === "impedance"
                  ? "bg-white text-arc-accent2 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Impedance ({unit})
            </button>
            <button
              type="button"
              onClick={() => setChannel("dcV")}
              disabled={!hasDcV}
              className={clsx(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40",
                channel === "dcV"
                  ? "bg-white text-arc-accent shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              DC V
            </button>
            <button
              type="button"
              onClick={() => setChannel("rawAdc")}
              disabled={!hasRawAdc}
              className={clsx(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40",
                channel === "rawAdc"
                  ? "bg-white text-violet-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              RAW ADC
            </button>
          </div>

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
                  "px-2 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
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
            disabled={points.length < 10}
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
              <span>Step 1: Click the start point of the pattern directly on the curve.</span>
            )}
            {pickStartTs !== null && pickEndTs === null && (
              <span className="font-mono tabular-nums">
                Start set at {format(new Date(pickStartTs * 1000), "MMM d, HH:mm:ss")} — Step 2: Click the end point on the chart.
              </span>
            )}
            {draftPatternPreview && (
              <span className="font-mono tabular-nums">
                Selected {draftPatternPreview.sampleCount} pts ·{" "}
                {format(new Date(draftPatternPreview.startTs * 1000), "HH:mm:ss")} →{" "}
                {format(new Date(draftPatternPreview.endTs * 1000), "HH:mm:ss")} · Δ
                {draftPatternPreview.deltaZ >= 0 ? "+" : ""}
                {draftPatternPreview.deltaZ.toFixed(2)} {unit}
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
            Focused: {focusedWindow.label} ({format(new Date(focusedWindow.startTs * 1000), "MMM d, HH:mm:ss")} →{" "}
            {format(new Date(focusedWindow.endTs * 1000), "MMM d, HH:mm:ss")})
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
                Upload a Time | RAW ADC | DC V | Impedance CSV file to plot the curve and identify recurring patterns.
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

        {/* Crosshair tooltip displaying Time | RAW ADC | DC V | Impedance */}
        {tooltip.visible && points.length > 0 && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth ?? 500) - 210),
              top: Math.max(tooltip.y - 92, 10),
            }}
          >
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-lg min-w-[195px]">
              <div className="text-[11px] font-mono font-semibold text-slate-900 mb-1.5">
                {tooltip.time}
              </div>
              <div className="space-y-0.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Impedance</span>
                  <span className="font-bold text-arc-accent2">{tooltip.impedance}</span>
                </div>
                {tooltip.dcV && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">DC V</span>
                    <span className="font-semibold text-arc-accent">{tooltip.dcV}</span>
                  </div>
                )}
                {tooltip.rawAdc && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">RAW ADC</span>
                    <span className="font-semibold text-violet-700">{tooltip.rawAdc}</span>
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
              <span className="text-slate-500">Min:</span>
              <span className="font-semibold text-slate-800">
                {summary.min.toFixed(channelPrecision)} {channelUnit}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Max:</span>
              <span className="font-semibold text-slate-800">
                {summary.max.toFixed(channelPrecision)} {channelUnit}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Avg:</span>
              <span className="font-semibold text-slate-800">
                {summary.avg.toFixed(channelPrecision)} {channelUnit}
              </span>
            </div>
          </>
        ) : (
          <span className="text-slate-400">Awaiting CSV telemetry</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-slate-500">
          <span
            className="w-3 h-0.5 inline-block"
            style={{ backgroundColor: CHANNEL_CONFIG[channel].line }}
          />
          <span>
            Time vs. {CHANNEL_CONFIG[channel].label} ({channelUnit})
          </span>
        </div>
      </div>
    </section>
  );
}
