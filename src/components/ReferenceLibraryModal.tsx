"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  BookMarked,
  Check,
  FolderPlus,
  Pencil,
  Plus,
  ScanSearch,
  Scissors,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  getNextReferenceCode,
  pickReferenceColor,
  REFERENCE_PALETTE,
  type ReferencePattern,
  type TreeGroup,
  type TreeType,
} from "@/lib/biosarcStore";
import {
  buildPointsFromCsv,
  parseCsvText,
  type CsvTelemetryPoint,
  type ImpedanceUnit,
} from "@/lib/csvParser";
import {
  computeWindowChannelDeltas,
  detectPatternsForNode,
  type IdentifiedPattern,
} from "@/lib/patternEngine";

interface ReferenceLibraryModalProps {
  open: boolean;
  initialTreeTypeId?: string | null;
  treeTypes: TreeType[];
  trees: TreeGroup[];
  referencePatterns: ReferencePattern[];
  onClose: () => void;
  onSaveTreeType: (payload: { id?: string; name: string; description: string }) => string;
  onDeleteTreeType: (treeTypeId: string) => void;
  onSaveReferencePattern: (payload: Omit<ReferencePattern, "id" | "createdAt">) => void;
  onRenameReferencePattern: (refId: string, qualityName: string, code?: string, notes?: string) => void;
  onDeleteReferencePattern: (refId: string) => void;
}

function MiniCurveSvg({
  points,
  color,
  highlightRange,
}: {
  points: CsvTelemetryPoint[];
  color: string;
  highlightRange?: [number, number] | null;
}) {
  if (points.length < 2) return null;
  const w = 220;
  const h = 44;
  const pad = 4;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const coords = points.map((p, idx) => {
    const x = pad + (idx / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
    return { x, y };
  });

  const pathD = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  let highlightEl: React.ReactNode = null;
  if (highlightRange) {
    const [sIdx, eIdx] = highlightRange;
    const x1 = coords[Math.max(0, Math.min(coords.length - 1, sIdx))].x;
    const x2 = coords[Math.max(0, Math.min(coords.length - 1, eIdx))].x;
    const left = Math.min(x1, x2);
    const width = Math.max(4, Math.abs(x2 - x1));
    highlightEl = (
      <rect
        x={left}
        y={1}
        width={width}
        height={h - 2}
        rx={2}
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.45}
      />
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 overflow-visible">
      {highlightEl}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ReferenceLibraryModal({
  open,
  initialTreeTypeId,
  treeTypes,
  trees,
  referencePatterns,
  onClose,
  onSaveTreeType,
  onDeleteTreeType,
  onSaveReferencePattern,
  onRenameReferencePattern,
  onDeleteReferencePattern,
}: ReferenceLibraryModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState("");

  // Inline reference rename state
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [editingRefCode, setEditingRefCode] = useState("");
  const [editingRefQuality, setEditingRefQuality] = useState("");

  // Add new reference workflow state
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedUnit, setUploadedUnit] = useState<ImpedanceUnit>("kΩ");
  const [uploadedPoints, setUploadedPoints] = useState<CsvTelemetryPoint[]>([]);
  const [autoScannedSegments, setAutoScannedSegments] = useState<IdentifiedPattern[]>([]);
  const [useFullCsv, setUseFullCsv] = useState(false);
  const [segStartIdx, setSegStartIdx] = useState(0);
  const [segEndIdx, setSegEndIdx] = useState(0);

  const [refCode, setRefCode] = useState("D1");
  const [qualityName, setQualityName] = useState("");
  const [refColor, setRefColor] = useState(REFERENCE_PALETTE[0]);
  const [refNotes, setRefNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const targetId =
      (initialTreeTypeId && treeTypes.some((t) => t.id === initialTreeTypeId)
        ? initialTreeTypeId
        : treeTypes[0]?.id) ?? "";
    setSelectedTypeId(targetId);
    setShowAddForm(false);
    setCreatingType(false);
    setEditingTypeId(null);
    setEditingRefId(null);
    setError(null);
  }, [open, initialTreeTypeId, treeTypes]);

  const activeType = useMemo(
    () => treeTypes.find((t) => t.id === selectedTypeId) ?? treeTypes[0] ?? null,
    [treeTypes, selectedTypeId]
  );

  const refsForActiveType = useMemo(() => {
    if (!activeType) return [];
    return referencePatterns.filter((r) => r.treeTypeId === activeType.id);
  }, [referencePatterns, activeType]);

  const resetAddForm = (refsCount: number, existing: ReferencePattern[]) => {
    setUploadedFileName("");
    setUploadedPoints([]);
    setAutoScannedSegments([]);
    setUseFullCsv(false);
    setSegStartIdx(0);
    setSegEndIdx(0);
    setRefCode(getNextReferenceCode(existing));
    setQualityName("");
    setRefColor(pickReferenceColor(refsCount));
    setRefNotes("");
    setError(null);
  };

  const activeSlicePoints = useMemo(() => {
    if (uploadedPoints.length === 0) return [];
    if (useFullCsv) return uploadedPoints;
    const lo = Math.max(0, Math.min(segStartIdx, segEndIdx));
    const hi = Math.min(uploadedPoints.length - 1, Math.max(segStartIdx, segEndIdx));
    return uploadedPoints.slice(lo, hi + 1);
  }, [uploadedPoints, useFullCsv, segStartIdx, segEndIdx]);

  const sliceDeltas = useMemo(
    () => computeWindowChannelDeltas(activeSlicePoints),
    [activeSlicePoints]
  );

  if (!open) return null;

  const handleUploadReferenceCsv = async (file: File) => {
    try {
      const text = await file.text();
      const preview = parseCsvText(text);
      const built = buildPointsFromCsv(
        preview.headers,
        preview.rows,
        preview.suggestedMapping,
        preview.detectedUnit
      );
      if (built.points.length < 3) {
        setError("Reference CSV must contain at least 3 valid telemetry samples.");
        return;
      }
      setUploadedFileName(file.name);
      setUploadedUnit(built.unit);
      setUploadedPoints(built.points);
      setUseFullCsv(built.points.length <= 24);
      setSegStartIdx(0);
      setSegEndIdx(Math.min(built.points.length - 1, Math.max(15, Math.floor(built.points.length * 0.45))));
      setAutoScannedSegments(detectPatternsForNode("ref-upload", built.points, built.unit));
      if (!qualityName.trim()) {
        const cleanBase = file.name.replace(/\.(csv|txt)$/i, "").replace(/[_-]+/g, " ");
        setQualityName(cleanBase.slice(0, 32));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse CSV file.");
    }
  };

  const handleApplyAutoSegment = (pat: IdentifiedPattern) => {
    const lo = uploadedPoints.findIndex((p) => p.ts >= pat.startTs);
    let hi = uploadedPoints.length - 1;
    for (let i = uploadedPoints.length - 1; i >= 0; i--) {
      if (uploadedPoints[i].ts <= pat.endTs) {
        hi = i;
        break;
      }
    }
    if (lo >= 0 && hi > lo) {
      setUseFullCsv(false);
      setSegStartIdx(lo);
      setSegEndIdx(hi);
      if (!qualityName.trim()) {
        setQualityName(pat.name);
      }
    }
  };

  const handleSaveNewReference = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeType) return;
    if (!qualityName.trim()) {
      setError("Please enter a quality name (e.g., With Flowers, With Fruit, Healthy, Diseased).");
      return;
    }
    if (activeSlicePoints.length < 3) {
      setError("Please upload a CSV and choose a segment with at least 3 samples.");
      return;
    }

    const deltas = computeWindowChannelDeltas(activeSlicePoints);
    onSaveReferencePattern({
      treeTypeId: activeType.id,
      code: refCode.trim() || getNextReferenceCode(refsForActiveType),
      qualityName: qualityName.trim(),
      color: refColor,
      notes: refNotes.trim() || `${activeSlicePoints.length} samples · ${uploadedFileName}`,
      sourceFileName: uploadedFileName || "manual_reference.csv",
      unit: uploadedUnit,
      points: activeSlicePoints,
      deltaZ: deltas.deltaZ,
      deltaDcV: deltas.deltaDcV,
      deltaRawAdc: deltas.deltaRawAdc,
      durationSec: deltas.durationSec,
    });
    setShowAddForm(false);
    resetAddForm(refsForActiveType.length + 1, refsForActiveType);
  };

  const handleCreateTreeType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    const createdId = onSaveTreeType({
      name: newTypeName.trim(),
      description: newTypeDesc.trim(),
    });
    setSelectedTypeId(createdId);
    setCreatingType(false);
    setNewTypeName("");
    setNewTypeDesc("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookMarked className="w-5 h-5 text-arc-accent flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                Tree Type Reference Library (D1–Dn)
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Curate species-level reference patterns by uploading CSVs, cropping segments, or auto-scanning curves
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close reference library"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left column: Tree Types */}
          <aside className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 p-4 flex flex-col min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Tree Types
              </span>
              <button
                type="button"
                onClick={() => setCreatingType((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Type
              </button>
            </div>

            {creatingType && (
              <form
                onSubmit={handleCreateTreeType}
                className="mb-3 p-3 rounded-lg bg-white border border-slate-200 space-y-2"
              >
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Tree type (e.g., Mango, Coconut)"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-arc-accent"
                  autoFocus
                />
                <input
                  type="text"
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-arc-accent"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCreatingType(false)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-semibold bg-arc-accent text-white rounded-md"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              {treeTypes.map((tt) => {
                const isSelected = activeType?.id === tt.id;
                const refCount = referencePatterns.filter((r) => r.treeTypeId === tt.id).length;
                const treeCount = trees.filter((t) => t.treeTypeId === tt.id).length;
                const isEditingThis = editingTypeId === tt.id;

                return (
                  <div
                    key={tt.id}
                    className={clsx(
                      "rounded-lg border px-3 py-2.5 transition-colors",
                      isSelected
                        ? "bg-white border-arc-accent shadow-sm"
                        : "bg-white/70 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingTypeName}
                          onChange={(e) => setEditingTypeName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingTypeName.trim()) {
                              onSaveTreeType({
                                id: tt.id,
                                name: editingTypeName.trim(),
                                description: tt.description,
                              });
                              setEditingTypeId(null);
                            }
                            if (e.key === "Escape") setEditingTypeId(null);
                          }}
                          className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold border border-arc-accent rounded"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editingTypeName.trim()) {
                              onSaveTreeType({
                                id: tt.id,
                                name: editingTypeName.trim(),
                                description: tt.description,
                              });
                            }
                            setEditingTypeId(null);
                          }}
                          className="p-1 bg-arc-accent text-white rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTypeId(tt.id);
                            setShowAddForm(false);
                          }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {tt.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                            {refCount} {refCount === 1 ? "ref" : "refs"} · {treeCount}{" "}
                            {treeCount === 1 ? "tree" : "trees"}
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTypeId(tt.id);
                              setEditingTypeName(tt.name);
                            }}
                            title="Rename tree type"
                            className="p-1 rounded text-slate-400 hover:text-slate-700"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {treeTypes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteTreeType(tt.id)}
                              title="Delete tree type"
                              className="p-1 rounded text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right column: Reference Patterns for selected Tree Type */}
          <div className="md:col-span-8 p-5 overflow-y-auto space-y-4">
            {activeType ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900">
                      {activeType.name} References ({refsForActiveType.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      {activeType.description ||
                        "New trees assigned to this type will automatically highlight similarities against these references."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!showAddForm) {
                        resetAddForm(refsForActiveType.length, refsForActiveType);
                      }
                      setShowAddForm((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAddForm
                      ? "Close Uploader"
                      : `Add Reference (${getNextReferenceCode(refsForActiveType)})`}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Direct CSV Upload + Segment Picker + Auto-Scan Form */}
                {showAddForm && (
                  <form
                    onSubmit={handleSaveNewReference}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Upload CSV &amp; Select Reference Segment for {activeType.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        Compares Impedance + Δ DC V + Δ RAW ADC
                      </span>
                    </div>

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) void handleUploadReferenceCsv(f);
                      }}
                      className="border border-dashed border-slate-300 hover:border-arc-accent bg-white rounded-lg p-3.5 text-center cursor-pointer transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            void handleUploadReferenceCsv(f);
                            e.target.value = "";
                          }
                        }}
                      />
                      <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-700">
                        <Upload className="w-4 h-4 text-arc-accent" />
                        <span>
                          {uploadedFileName
                            ? `Loaded ${uploadedFileName} (${uploadedPoints.length} samples) — Click to replace CSV`
                            : "Click or drop a reference CSV (Time | RAW ADC | DC V | Impedance)"}
                        </span>
                      </div>
                    </div>

                    {uploadedPoints.length >= 3 && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                            <Scissors className="w-3.5 h-3.5 text-arc-accent" />
                            <span>
                              Segment Selection ({activeSlicePoints.length} / {uploadedPoints.length} pts)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setUseFullCsv(false)}
                              className={clsx(
                                "px-2 py-0.5 rounded font-medium",
                                !useFullCsv ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                              )}
                            >
                              Crop Segment
                            </button>
                            <button
                              type="button"
                              onClick={() => setUseFullCsv(true)}
                              className={clsx(
                                "px-2 py-0.5 rounded font-medium",
                                useFullCsv ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                              )}
                            >
                              Use Full CSV
                            </button>
                          </div>
                        </div>

                        <MiniCurveSvg
                          points={uploadedPoints}
                          color={refColor}
                          highlightRange={
                            useFullCsv
                              ? [0, uploadedPoints.length - 1]
                              : [segStartIdx, segEndIdx]
                          }
                        />

                        {!useFullCsv && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <label className="space-y-1">
                              <div className="flex justify-between font-mono text-[11px] text-slate-600">
                                <span>Start Sample</span>
                                <span>#{segStartIdx + 1}</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={Math.max(0, uploadedPoints.length - 3)}
                                value={segStartIdx}
                                onChange={(e) => {
                                  const nextStart = Number(e.target.value);
                                  setSegStartIdx(nextStart);
                                  if (segEndIdx <= nextStart + 1) {
                                    setSegEndIdx(Math.min(uploadedPoints.length - 1, nextStart + 2));
                                  }
                                }}
                                className="w-full accent-emerald-700"
                              />
                            </label>
                            <label className="space-y-1">
                              <div className="flex justify-between font-mono text-[11px] text-slate-600">
                                <span>End Sample</span>
                                <span>#{segEndIdx + 1}</span>
                              </div>
                              <input
                                type="range"
                                min={Math.min(uploadedPoints.length - 1, segStartIdx + 2)}
                                max={uploadedPoints.length - 1}
                                value={segEndIdx}
                                onChange={(e) => setSegEndIdx(Number(e.target.value))}
                                className="w-full accent-emerald-700"
                              />
                            </label>
                          </div>
                        )}

                        {/* Live 3-Channel Delta Preview */}
                        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums text-slate-700">
                          <span>
                            Δ Impedance:{" "}
                            <strong className={sliceDeltas.deltaZ >= 0 ? "text-amber-700" : "text-blue-700"}>
                              {sliceDeltas.deltaZ >= 0 ? "+" : ""}
                              {sliceDeltas.deltaZ.toFixed(2)} {uploadedUnit}
                            </strong>
                          </span>
                          <span>
                            Δ DC V:{" "}
                            <strong className="text-arc-accent">
                              {sliceDeltas.deltaDcV !== undefined
                                ? `${sliceDeltas.deltaDcV >= 0 ? "+" : ""}${sliceDeltas.deltaDcV.toFixed(3)} V`
                                : "—"}
                            </strong>
                          </span>
                          <span>
                            Δ RAW ADC:{" "}
                            <strong className="text-violet-700">
                              {sliceDeltas.deltaRawAdc !== undefined
                                ? `${sliceDeltas.deltaRawAdc >= 0 ? "+" : ""}${sliceDeltas.deltaRawAdc.toFixed(1)}`
                                : "—"}
                            </strong>
                          </span>
                        </div>

                        {/* Auto-scanned candidate segments */}
                        {autoScannedSegments.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                              <ScanSearch className="w-3.5 h-3.5 text-arc-accent" />
                              Auto-Scanned Candidate Segments (click to snap selection):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {autoScannedSegments.map((seg) => (
                                <button
                                  key={seg.id}
                                  type="button"
                                  onClick={() => handleApplyAutoSegment(seg)}
                                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-arc-accent hover:bg-emerald-50/40 text-[11px] font-mono text-slate-700"
                                >
                                  {seg.name} ({seg.deltaZ >= 0 ? "+" : ""}
                                  {seg.deltaZ.toFixed(1)} {uploadedUnit})
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Code
                        </label>
                        <input
                          type="text"
                          value={refCode}
                          onChange={(e) => setRefCode(e.target.value)}
                          placeholder="D1"
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Quality Name
                        </label>
                        <input
                          type="text"
                          value={qualityName}
                          onChange={(e) => setQualityName(e.target.value)}
                          placeholder="e.g., With Flowers, With Fruit, Healthy, Diseased"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Highlight Color
                        </label>
                        <div className="flex items-center gap-1.5 h-8">
                          {REFERENCE_PALETTE.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => setRefColor(hex)}
                              className={clsx(
                                "w-5 h-5 rounded-full border-2 transition-transform",
                                refColor === hex ? "border-slate-900 scale-110" : "border-white"
                              )}
                              style={{ backgroundColor: hex }}
                              aria-label={`Select color ${hex}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Diagnostic Notes (optional)
                      </label>
                      <input
                        type="text"
                        value={refNotes}
                        onChange={(e) => setRefNotes(e.target.value)}
                        placeholder="Describe physiological state or collection conditions"
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddForm(false)}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={activeSlicePoints.length < 3}
                        className="px-4 py-1.5 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold disabled:opacity-40"
                      >
                        Save Reference to {activeType.name}
                      </button>
                    </div>
                  </form>
                )}

                {/* Saved Reference Patterns List */}
                {refsForActiveType.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      No reference signatures saved for {activeType.name} yet
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Click &ldquo;Add Reference&rdquo; above to upload a CSV and select a segment, or use &ldquo;Select Pattern&rdquo; on any node chart to pin a signature here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {refsForActiveType.map((ref) => {
                      const isEditing = editingRefId === ref.id;
                      return (
                        <div
                          key={ref.id}
                          className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: ref.color }}
                              />
                              {isEditing ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingRefCode}
                                    onChange={(e) => setEditingRefCode(e.target.value)}
                                    className="w-16 px-2 py-1 text-xs font-mono font-bold border border-arc-accent rounded"
                                    placeholder="D1"
                                  />
                                  <input
                                    type="text"
                                    value={editingRefQuality}
                                    onChange={(e) => setEditingRefQuality(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && editingRefQuality.trim()) {
                                        onRenameReferencePattern(
                                          ref.id,
                                          editingRefQuality.trim(),
                                          editingRefCode.trim() || ref.code
                                        );
                                        setEditingRefId(null);
                                      }
                                      if (e.key === "Escape") setEditingRefId(null);
                                    }}
                                    className="w-48 px-2 py-1 text-xs font-semibold border border-arc-accent rounded"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editingRefQuality.trim()) {
                                        onRenameReferencePattern(
                                          ref.id,
                                          editingRefQuality.trim(),
                                          editingRefCode.trim() || ref.code
                                        );
                                      }
                                      setEditingRefId(null);
                                    }}
                                    className="p-1 bg-arc-accent text-white rounded"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingRefId(null)}
                                    className="p-1 border border-slate-200 rounded text-slate-500"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span
                                    className="text-xs font-mono font-bold"
                                    style={{ color: ref.color }}
                                  >
                                    {ref.code}
                                  </span>
                                  <span className="text-slate-300" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="text-sm font-bold text-slate-900">
                                    {ref.qualityName}
                                  </span>
                                </>
                              )}
                              <span className="text-xs font-mono text-slate-400 tabular-nums">
                                ({ref.points.length} pts · {ref.sourceFileName})
                              </span>
                            </div>

                            {ref.notes && (
                              <p className="text-xs text-slate-500">{ref.notes}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums pt-0.5">
                              <span className="text-slate-600">
                                ΔZ{" "}
                                <strong className={ref.deltaZ >= 0 ? "text-amber-700" : "text-blue-700"}>
                                  {ref.deltaZ >= 0 ? "+" : ""}
                                  {ref.deltaZ.toFixed(2)} {ref.unit}
                                </strong>
                              </span>
                              <span className="text-slate-600">
                                ΔDC V{" "}
                                <strong className="text-arc-accent">
                                  {ref.deltaDcV !== undefined
                                    ? `${ref.deltaDcV >= 0 ? "+" : ""}${ref.deltaDcV.toFixed(3)}V`
                                    : "—"}
                                </strong>
                              </span>
                              <span className="text-slate-600">
                                ΔADC{" "}
                                <strong className="text-violet-700">
                                  {ref.deltaRawAdc !== undefined
                                    ? `${ref.deltaRawAdc >= 0 ? "+" : ""}${ref.deltaRawAdc.toFixed(1)}`
                                    : "—"}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="w-28">
                              <MiniCurveSvg points={ref.points} color={ref.color} />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRefId(ref.id);
                                setEditingRefCode(ref.code);
                                setEditingRefQuality(ref.qualityName);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteReferencePattern(ref.id)}
                              title="Delete reference"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-500">Create a Tree Type to begin.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
