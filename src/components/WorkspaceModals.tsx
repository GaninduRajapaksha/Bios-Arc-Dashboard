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
import type { SensorNode, TreeGroup } from "@/lib/biosarcStore";
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
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; species: string; notes: string }) => void;
}

export function TreeModal({ open, initialTree, onClose, onSave }: TreeModalProps) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialTree?.name ?? "");
      setSpecies(initialTree?.species ?? "");
      setNotes(initialTree?.notes ?? "");
      setError(null);
    }
  }, [open, initialTree]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Tree name is required.");
      return;
    }
    onSave({
      id: initialTree?.id,
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
              placeholder="e.g., Dawal Loku Gaha"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arc-accent/25 focus:border-arc-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Species / Variety
            </label>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="e.g., Field Specimen"
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
    csvFileName?: string;
    intervalLabel?: string;
    unit?: ImpedanceUnit;
    points?: CsvTelemetryPoint[];
  }) => void;
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
  const [csvFileName, setCsvFileName] = useState("");
  const [csvPreview, setCsvPreview] = useState<ParsedCsvPreview | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping | null>(null);
  const [unit, setUnit] = useState<ImpedanceUnit>("kΩ");
  const [parseStatus, setParseStatus] = useState<{
    count: number;
    skipped: number;
    intervalLabel: string;
  } | null>(null);
  const [parsedPoints, setParsedPoints] = useState<CsvTelemetryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTreeId(initialNode?.treeId ?? defaultTreeId);
      setName(initialNode?.name ?? "");
      setLocation(initialNode?.location ?? "");
      setFirmware(initialNode?.firmware ?? "v2.4.1");
      setCsvFileName(initialNode?.csvFileName ?? "");
      setUnit(initialNode?.unit ?? "kΩ");
      setCsvPreview(null);
      setMapping(null);
      setParseStatus(null);
      setParsedPoints(null);
      setError(null);
    }
  }, [open, initialNode, defaultTreeId]);

  if (!open) return null;

  const applyPreviewMapping = (
    preview: ParsedCsvPreview,
    nextMapping: CsvColumnMapping,
    nextUnit: ImpedanceUnit
  ) => {
    try {
      const result = buildPointsFromCsv(
        preview.headers,
        preview.rows,
        nextMapping,
        nextUnit
      );
      setParsedPoints(result.points);
      setParseStatus({
        count: result.points.length,
        skipped: result.skippedRows,
        intervalLabel: result.intervalLabel,
      });
      setError(null);
    } catch (err) {
      setParsedPoints(null);
      setParseStatus(null);
      setError(err instanceof Error ? err.message : "Unable to parse CSV columns.");
    }
  };

  const handleFileSelected = async (file: File) => {
    try {
      const text = await file.text();
      const preview = parseCsvText(text);
      setCsvFileName(file.name);
      setCsvPreview(preview);
      setMapping(preview.suggestedMapping);
      setUnit(preview.detectedUnit);
      applyPreviewMapping(preview, preview.suggestedMapping, preview.detectedUnit);
    } catch (err) {
      setCsvPreview(null);
      setParsedPoints(null);
      setParseStatus(null);
      setError(err instanceof Error ? err.message : "Failed to read CSV file.");
    }
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
      csvFileName: parsedPoints ? csvFileName : initialNode?.csvFileName,
      intervalLabel: parseStatus?.intervalLabel ?? initialNode?.intervalLabel,
      unit: parsedPoints ? unit : initialNode?.unit ?? "kΩ",
      points: parsedPoints ?? undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {initialNode ? `Edit ${initialNode.name}` : "Add Sensor Node & CSV"}
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

          {/* CSV Upload Section */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Logger CSV Data (Time | RAW ADC | DC V | Impedance)
              </label>
              {initialNode && initialNode.points.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadCurrentCsv}
                  className="inline-flex items-center gap-1 text-xs font-medium text-arc-accent hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Current ({initialNode.points.length} pts)
                </button>
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFileSelected(file);
              }}
              className="border border-dashed border-slate-300 hover:border-arc-accent bg-slate-50 hover:bg-emerald-50/30 rounded-lg p-4 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileSelected(file);
                }}
              />
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="w-5 h-5 text-arc-accent" />
                <div className="text-xs font-medium text-slate-700">
                  {csvFileName
                    ? `Selected: ${csvFileName}`
                    : "Click or drag & drop your .csv logger file"}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Direct support for pipe-delimited &ldquo;2026-11-18 15:08:04 | 732.0 | 2.361 V | 28.50 kOhm&rdquo; &amp; standard CSV
                </div>
              </div>
            </div>
          </div>

          {/* Column mapping & validation feedback */}
          {csvPreview && mapping && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-arc-accent" />
                  Detected Columns ({csvPreview.delimiter === "|" ? "Pipe |" : csvPreview.delimiter}
                  {csvPreview.headerless ? " · Headerless" : ""})
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {csvPreview.rows.length} rows
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Time
                  </label>
                  <select
                    value={mapping.timeCol}
                    onChange={(e) => {
                      const next = { ...mapping, timeCol: e.target.value };
                      setMapping(next);
                      applyPreviewMapping(csvPreview, next, unit);
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                  >
                    {csvPreview.headers.map((h) => (
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
                    value={mapping.rawAdcCol ?? ""}
                    onChange={(e) => {
                      const next = {
                        ...mapping,
                        rawAdcCol: e.target.value || undefined,
                      };
                      setMapping(next);
                      applyPreviewMapping(csvPreview, next, unit);
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">None</option>
                    {csvPreview.headers.map((h) => (
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
                    value={mapping.dcVCol ?? ""}
                    onChange={(e) => {
                      const next = {
                        ...mapping,
                        dcVCol: e.target.value || undefined,
                      };
                      setMapping(next);
                      applyPreviewMapping(csvPreview, next, unit);
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">None</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Impedance ({unit})
                  </label>
                  <select
                    value={mapping.impedanceCol}
                    onChange={(e) => {
                      const next = { ...mapping, impedanceCol: e.target.value };
                      setMapping(next);
                      applyPreviewMapping(csvPreview, next, unit);
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
                  >
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {parseStatus && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="tabular-nums">
                    Ready: {parseStatus.count.toLocaleString()} valid points ·{" "}
                    {parseStatus.intervalLabel} · Unit: {unit}
                    {parseStatus.skipped > 0
                      ? ` · ${parseStatus.skipped} skipped`
                      : ""}
                  </span>
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
              {initialNode ? "Save Node" : "Create Node"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
