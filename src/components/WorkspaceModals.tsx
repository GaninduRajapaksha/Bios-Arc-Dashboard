"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import type { SensorNode, TreeGroup, TreeType } from "@/lib/biosarcStore";
import {
  buildPointsFromCsv,
  parseCsvText,
  serializePointsToCsv,
  type CsvColumnMapping,
  type CsvTelemetryPoint,
  type ImpedanceUnit,
  type ParsedCsvPreview,
} from "@/lib/csvParser";

interface TreeModalProps {
  open: boolean;
  initialTree: TreeGroup | null;
  treeTypes: TreeType[];
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    treeTypeId: string;
    newTreeTypeName?: string;
    name: string;
    species: string;
    notes: string;
  }) => void;
}

export function TreeModal({
  open,
  initialTree,
  treeTypes,
  onClose,
  onSave,
}: TreeModalProps) {
  const [name, setName] = useState("");
  const [treeTypeId, setTreeTypeId] = useState("");
  const [newTreeTypeName, setNewTreeTypeName] = useState("");
  const [species, setSpecies] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialTree?.name ?? "");
      setTreeTypeId(initialTree?.treeTypeId ?? treeTypes[0]?.id ?? "__new__");
      setNewTreeTypeName("");
      setSpecies(initialTree?.species ?? "");
      setNotes(initialTree?.notes ?? "");
      setError(null);
    }
  }, [open, initialTree, treeTypes]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Tree name is required.");
      return;
    }
    if (treeTypeId === "__new__" && !newTreeTypeName.trim()) {
      setError("Please enter a name for the new Tree Type.");
      return;
    }
    onSave({
      id: initialTree?.id,
      treeTypeId,
      newTreeTypeName: treeTypeId === "__new__" ? newTreeTypeName.trim() : undefined,
      name: name.trim(),
      species: species.trim(),
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {initialTree ? "Edit Tree" : "Add New Tree"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tree Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mango Plot D (New Tree)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tree Type (Reference Library Group)
            </label>
            <select
              value={treeTypeId}
              onChange={(e) => setTreeTypeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
            >
              {treeTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
              <option value="__new__">+ Create New Tree Type...</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Nodes on this tree automatically compare against all D1–Dn references saved for this Tree Type.
            </p>
          </div>

          {treeTypeId === "__new__" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                New Tree Type Name
              </label>
              <input
                type="text"
                value={newTreeTypeName}
                onChange={(e) => setNewTreeTypeName(e.target.value)}
                placeholder="e.g., Mango, Avocado, Jackfruit"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Species / Variety
            </label>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="e.g., Mangifera indica"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Plot Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Location, logging interval, or experiment context"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-arc-accent hover:bg-arc-accentHover rounded-lg whitespace-nowrap"
            >
              {initialTree ? "Save Changes" : "Create Tree"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface NodeModalProps {
  open: boolean;
  trees: TreeGroup[];
  initialNode: SensorNode | null;
  defaultTreeId: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    treeId: string;
    name: string;
    location: string;
    firmware: string;
    addedCsvFiles?: string[];
    intervalLabel?: string;
    unit?: ImpedanceUnit;
    points?: CsvTelemetryPoint[];
    mergeMode?: "append" | "replace";
  }) => void;
}

interface QueuedCsvFile {
  fileName: string;
  preview: ParsedCsvPreview;
  mapping: CsvColumnMapping;
  unit: ImpedanceUnit;
  points: CsvTelemetryPoint[];
  skipped: number;
  intervalLabel: string;
}

export function NodeModal({
  open,
  trees,
  initialNode,
  defaultTreeId,
  onClose,
  onSave,
}: NodeModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [treeId, setTreeId] = useState(defaultTreeId);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [firmware, setFirmware] = useState("v2.4.1");
  const [queuedFiles, setQueuedFiles] = useState<QueuedCsvFile[]>([]);
  const [mergeMode, setMergeMode] = useState<"append" | "replace">("append");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTreeId(initialNode?.treeId ?? defaultTreeId);
      setName(initialNode?.name ?? "");
      setLocation(initialNode?.location ?? "");
      setFirmware(initialNode?.firmware ?? "v2.4.1");
      setQueuedFiles([]);
      setMergeMode("append");
      setError(null);
    }
  }, [open, initialNode, defaultTreeId]);

  if (!open) return null;

  const existingFiles = initialNode
    ? initialNode.csvFiles && initialNode.csvFiles.length > 0
      ? initialNode.csvFiles
      : initialNode.csvFileName
      ? [initialNode.csvFileName]
      : []
    : [];

  const targetUnit: ImpedanceUnit =
    queuedFiles[0]?.unit ?? initialNode?.unit ?? "kΩ";

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const parsedBatch: QueuedCsvFile[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const preview = parseCsvText(text);
        const preferredUnit = initialNode?.points.length
          ? initialNode.unit
          : preview.detectedUnit;
        const result = buildPointsFromCsv(
          preview.headers,
          preview.rows,
          preview.suggestedMapping,
          preferredUnit
        );
        parsedBatch.push({
          fileName: file.name,
          preview,
          mapping: preview.suggestedMapping,
          unit: result.unit,
          points: result.points,
          skipped: result.skippedRows,
          intervalLabel: result.intervalLabel,
        });
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "Failed to parse"}`
        );
      }
    }

    if (parsedBatch.length > 0) {
      setQueuedFiles((prev) => [...prev, ...parsedBatch]);
    }
    setError(errors.length > 0 ? errors.join(" · ") : null);
  };

  const handleUpdateQueuedMapping = (
    idx: number,
    nextMapping: CsvColumnMapping
  ) => {
    setQueuedFiles((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        try {
          const result = buildPointsFromCsv(
            item.preview.headers,
            item.preview.rows,
            nextMapping,
            item.unit
          );
          setError(null);
          return {
            ...item,
            mapping: nextMapping,
            points: result.points,
            skipped: result.skippedRows,
            intervalLabel: result.intervalLabel,
          };
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Unable to parse CSV columns."
          );
          return { ...item, mapping: nextMapping };
        }
      })
    );
  };

  const handleRemoveQueuedFile = (idx: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDownloadCurrentCsv = () => {
    if (!initialNode || initialNode.points.length === 0) return;
    const csv = serializePointsToCsv(initialNode.points, initialNode.unit);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = initialNode.csvFileName || `${initialNode.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const combinedQueuedPoints = queuedFiles.reduce<CsvTelemetryPoint[]>((acc, f) => {
    const byTs = new Map<number, CsvTelemetryPoint>();
    for (const p of acc) byTs.set(p.ts, p);
    for (const p of f.points) byTs.set(p.ts, p);
    return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
  }, []);

  const previewMergedTotal = (() => {
    if (queuedFiles.length === 0) return initialNode?.points.length ?? 0;
    if (!initialNode || mergeMode === "replace") return combinedQueuedPoints.length;
    const byTs = new Map<number, CsvTelemetryPoint>();
    for (const p of initialNode.points) byTs.set(p.ts, p);
    for (const p of combinedQueuedPoints) byTs.set(p.ts, p);
    return byTs.size;
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Node name is required.");
      return;
    }
    if (!treeId) {
      setError("Please select a parent tree.");
      return;
    }

    onSave({
      id: initialNode?.id,
      treeId,
      name: name.trim(),
      location: location.trim(),
      firmware: firmware.trim() || "v2.4.1",
      addedCsvFiles:
        queuedFiles.length > 0 ? queuedFiles.map((f) => f.fileName) : undefined,
      intervalLabel:
        queuedFiles.length > 0
          ? queuedFiles[queuedFiles.length - 1].intervalLabel
          : initialNode?.intervalLabel,
      unit: targetUnit,
      points: queuedFiles.length > 0 ? combinedQueuedPoints : undefined,
      mergeMode,
    });
    onClose();
  };

  const activePreviewFile =
    queuedFiles.length > 0 ? queuedFiles[queuedFiles.length - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {initialNode ? `Edit ${initialNode.name} · Add CSV Data` : "Add Sensor Node & CSV"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Node Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Dawal_Node_01"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Parent Tree
              </label>
              <select
                value={treeId}
                onChange={(e) => setTreeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              >
                {trees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Placement on Tree
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Lower Trunk, Branch B"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Firmware
              </label>
              <input
                type="text"
                value={firmware}
                onChange={(e) => setFirmware(e.target.value)}
                placeholder="v2.4.1"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              />
            </div>
          </div>

          {/* Existing CSV files already on this node */}
          {initialNode && existingFiles.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-slate-700">
                  Loaded on chart ({initialNode.points.length.toLocaleString()} pts):{" "}
                </span>
                <span className="font-mono text-slate-600">
                  {existingFiles.join(" · ")}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadCurrentCsv}
                className="inline-flex items-center gap-1 text-xs font-medium text-arc-accent hover:underline whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export Combined CSV
              </button>
            </div>
          )}

          {/* Multi-CSV Upload Section */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Add CSV File(s) (Time | RAW ADC | DC V | Impedance)
              </label>
              {initialNode && initialNode.points.length > 0 && queuedFiles.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] bg-slate-100 p-0.5 rounded-md border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setMergeMode("append")}
                    className={`px-2 py-0.5 rounded font-medium ${
                      mergeMode === "append"
                        ? "bg-white text-arc-accent shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Append &amp; Keep Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeMode("replace")}
                    className={`px-2 py-0.5 rounded font-medium ${
                      mergeMode === "replace"
                        ? "bg-white text-red-600 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Replace Existing
                  </button>
                </div>
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) {
                  void handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className="border border-dashed border-slate-300 hover:border-arc-accent bg-slate-50 hover:bg-emerald-50/30 rounded-lg p-4 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="w-5 h-5 text-arc-accent" />
                <div className="text-xs font-medium text-slate-700">
                  Click or drag &amp; drop one or more .csv files to add to this node
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  New CSV files are merged onto the same Time vs. Impedance chart without removing existing data
                </div>
              </div>
            </div>
          </div>

          {/* Queued files list */}
          {queuedFiles.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-arc-accent" />
                  Files Ready to Add ({queuedFiles.length})
                </span>
                <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                  Total on chart after save: {previewMergedTotal.toLocaleString()} pts
                </span>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {queuedFiles.map((qf, idx) => (
                  <div
                    key={`${qf.fileName}-${idx}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="font-mono font-medium text-slate-800 truncate">
                        {qf.fileName}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums whitespace-nowrap">
                        +{qf.points.length} pts · {qf.intervalLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQueuedFile(idx)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Remove from queue"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Column mapping preview for latest queued file */}
              {activePreviewFile && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="text-[11px] font-medium text-slate-600">
                    Column Mapping ({activePreviewFile.fileName} ·{" "}
                    {activePreviewFile.preview.delimiter === "|"
                      ? "Pipe |"
                      : activePreviewFile.preview.delimiter}
                    {activePreviewFile.preview.headerless ? " · Headerless" : ""})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Time
                      </label>
                      <select
                        value={activePreviewFile.mapping.timeCol}
                        onChange={(e) =>
                          handleUpdateQueuedMapping(queuedFiles.length - 1, {
                            ...activePreviewFile.mapping,
                            timeCol: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                      >
                        {activePreviewFile.preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        RAW ADC
                      </label>
                      <select
                        value={activePreviewFile.mapping.rawAdcCol ?? ""}
                        onChange={(e) =>
                          handleUpdateQueuedMapping(queuedFiles.length - 1, {
                            ...activePreviewFile.mapping,
                            rawAdcCol: e.target.value || undefined,
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                      >
                        <option value="">None</option>
                        {activePreviewFile.preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        DC V
                      </label>
                      <select
                        value={activePreviewFile.mapping.dcVCol ?? ""}
                        onChange={(e) =>
                          handleUpdateQueuedMapping(queuedFiles.length - 1, {
                            ...activePreviewFile.mapping,
                            dcVCol: e.target.value || undefined,
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                      >
                        <option value="">None</option>
                        {activePreviewFile.preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Impedance ({activePreviewFile.unit})
                      </label>
                      <select
                        value={activePreviewFile.mapping.impedanceCol}
                        onChange={(e) =>
                          handleUpdateQueuedMapping(queuedFiles.length - 1, {
                            ...activePreviewFile.mapping,
                            impedanceCol: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                      >
                        {activePreviewFile.preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-arc-accent hover:bg-arc-accentHover rounded-lg whitespace-nowrap"
            >
              {queuedFiles.length > 0 && initialNode && mergeMode === "append"
                ? `Append ${queuedFiles.length} CSV & Save`
                : initialNode
                ? "Save Node"
                : "Create Node"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
