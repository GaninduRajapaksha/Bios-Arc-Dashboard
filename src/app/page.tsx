"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BookMarked, Menu, Plus } from "lucide-react";
import TreeSidebar from "@/components/TreeSidebar";
import QualitySummaryStrip from "@/components/QualitySummaryStrip";
import PatternList from "@/components/PatternList";
import ReferenceLibraryModal from "@/components/ReferenceLibraryModal";
import { NodeModal, TreeModal } from "@/components/WorkspaceModals";
import type { FocusedChartWindow } from "@/components/charts/ImpedanceChart";
import {
  type BiosarcWorkspaceState,
  generateSampleCsvDownload,
  getNextReferenceCode,
  getNodeCsvFiles,
  hasSavedWorkspace,
  hydrateDefaultNodeFromAttachedCsv,
  loadWorkspace,
  pickReferenceColor,
  resetWorkspace,
  saveWorkspace,
  type ReferencePattern,
  type SensorNode,
  type TreeGroup,
  type TreeType,
} from "@/lib/biosarcStore";
import {
  computeWindowChannelDeltas,
  detectPatternsForNode,
  findSimilarPatternsAcrossDatasets,
  matchNodeAgainstReferences,
  summarizeQualityMatches,
  type IdentifiedPattern,
  type ReferenceMatchResult,
  type SimilarityMatch,
} from "@/lib/patternEngine";
import {
  type CsvTelemetryPoint,
  type ImpedanceUnit,
  inferIntervalLabel,
  mergeTelemetryPoints,
} from "@/lib/csvParser";

const ImpedanceChart = dynamic(
  () => import("@/components/charts/ImpedanceChart"),
  { ssr: false }
);

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function HomePage() {
  const [workspace, setWorkspace] = useState<BiosarcWorkspaceState | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [editingTree, setEditingTree] = useState<TreeGroup | null>(null);
  const [nodeModalOpen, setNodeModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<SensorNode | null>(null);
  const [defaultNodeTreeId, setDefaultNodeTreeId] = useState("");

  const [refLibraryOpen, setRefLibraryOpen] = useState(false);
  const [refLibraryTypeId, setRefLibraryTypeId] = useState<string | null>(null);

  const [focusedWindow, setFocusedWindow] = useState<FocusedChartWindow | null>(null);
  const [similaritySource, setSimilaritySource] = useState<IdentifiedPattern | null>(null);
  const [minSimilarity, setMinSimilarity] = useState(65);
  const [refMinScore, setRefMinScore] = useState(62);

  useEffect(() => {
    const hadSaved = hasSavedWorkspace();
    const initial = loadWorkspace();
    setWorkspace(initial);

    if (!hadSaved) {
      void hydrateDefaultNodeFromAttachedCsv(initial).then((hydrated) => {
        setWorkspace(hydrated);
      });
    }
  }, []);

  const updateWorkspace = (
    updater: (prev: BiosarcWorkspaceState) => BiosarcWorkspaceState
  ) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      saveWorkspace(next);
      return next;
    });
  };

  const activeNode = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.nodes.find((n) => n.id === workspace.activeNodeId) ??
      workspace.nodes[0] ??
      null
    );
  }, [workspace]);

  const activeTree = useMemo(() => {
    if (!workspace || !activeNode) return null;
    return workspace.trees.find((t) => t.id === activeNode.treeId) ?? null;
  }, [workspace, activeNode]);

  const activeTreeType = useMemo(() => {
    if (!workspace || !activeTree) return null;
    return (
      workspace.treeTypes.find((tt) => tt.id === activeTree.treeTypeId) ??
      workspace.treeTypes[0] ??
      null
    );
  }, [workspace, activeTree]);

  const activeTypeReferences = useMemo(() => {
    if (!workspace || !activeTreeType) return [];
    return workspace.referencePatterns.filter(
      (r) => r.treeTypeId === activeTreeType.id
    );
  }, [workspace, activeTreeType]);

  const nextRefCode = useMemo(
    () => getNextReferenceCode(activeTypeReferences),
    [activeTypeReferences]
  );

  const activeNodePatterns = useMemo(() => {
    if (!workspace || !activeNode) return [];
    return workspace.patterns
      .filter((p) => p.nodeId === activeNode.id)
      .sort((a, b) => a.startTs - b.startTs);
  }, [workspace, activeNode]);

  const referenceMatches = useMemo(() => {
    if (!activeNode || activeNode.points.length < 4 || activeTypeReferences.length === 0) {
      return [];
    }
    return matchNodeAgainstReferences(
      activeNode.id,
      activeNode.points,
      activeNode.unit ?? "kΩ",
      activeTypeReferences,
      refMinScore
    );
  }, [activeNode, activeTypeReferences, refMinScore]);

  const qualitySummaries = useMemo(
    () => summarizeQualityMatches(activeTypeReferences, referenceMatches),
    [activeTypeReferences, referenceMatches]
  );

  const similarityMatches = useMemo(() => {
    if (!workspace || !similaritySource) return [];
    const sourceNode = workspace.nodes.find(
      (n) => n.id === similaritySource.nodeId
    );
    if (!sourceNode) return [];

    const treeMap = new Map(workspace.trees.map((t) => [t.id, t.name]));
    const datasets = workspace.nodes
      .filter((n) => n.points.length >= 4)
      .map((n) => ({
        nodeId: n.id,
        nodeName: n.name,
        treeId: n.treeId,
        treeName: treeMap.get(n.treeId) ?? "Tree",
        unit: n.unit ?? "kΩ",
        points: n.points,
      }));

    return findSimilarPatternsAcrossDatasets(
      similaritySource,
      sourceNode.points,
      datasets,
      minSimilarity
    );
  }, [workspace, similaritySource, minSimilarity]);

  const handleToggleTree = (treeId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      trees: prev.trees.map((t) =>
        t.id === treeId ? { ...t, isExpanded: !t.isExpanded } : t
      ),
    }));
  };

  const handleSaveTree = (payload: {
    id?: string;
    treeTypeId: string;
    newTreeTypeName?: string;
    name: string;
    species: string;
    notes: string;
  }) => {
    const nowIso = new Date().toISOString();
    updateWorkspace((prev) => {
      let resolvedTypeId = payload.treeTypeId;
      let nextTreeTypes = prev.treeTypes;

      if (payload.treeTypeId === "__new__" && payload.newTreeTypeName) {
        const createdType: TreeType = {
          id: makeId("type"),
          name: payload.newTreeTypeName,
          description: `${payload.newTreeTypeName} reference library`,
          createdAt: nowIso,
        };
        nextTreeTypes = [...prev.treeTypes, createdType];
        resolvedTypeId = createdType.id;
      }

      if (payload.id) {
        return {
          ...prev,
          treeTypes: nextTreeTypes,
          trees: prev.trees.map((t) =>
            t.id === payload.id
              ? {
                  ...t,
                  treeTypeId: resolvedTypeId,
                  name: payload.name,
                  species: payload.species,
                  notes: payload.notes,
                }
              : t
          ),
        };
      }

      const created: TreeGroup = {
        id: makeId("tree"),
        treeTypeId: resolvedTypeId,
        name: payload.name,
        species: payload.species,
        notes: payload.notes,
        isExpanded: true,
        createdAt: nowIso,
      };
      return {
        ...prev,
        treeTypes: nextTreeTypes,
        trees: [...prev.trees, created],
      };
    });
  };

  const handleDeleteTree = (treeId: string) => {
    updateWorkspace((prev) => {
      const removedNodeIds = new Set(
        prev.nodes.filter((n) => n.treeId === treeId).map((n) => n.id)
      );
      const remainingTrees = prev.trees.filter((t) => t.id !== treeId);
      const remainingNodes = prev.nodes.filter((n) => n.treeId !== treeId);
      const remainingPatterns = prev.patterns.filter(
        (p) => !removedNodeIds.has(p.nodeId)
      );
      const nextActive =
        prev.activeNodeId && !removedNodeIds.has(prev.activeNodeId)
          ? prev.activeNodeId
          : remainingNodes[0]?.id ?? null;

      return {
        ...prev,
        trees: remainingTrees,
        nodes: remainingNodes,
        patterns: remainingPatterns,
        activeNodeId: nextActive,
      };
    });
    setFocusedWindow(null);
    setSimilaritySource(null);
  };

  const handleSaveNode = (payload: {
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
  }) => {
    const nowIso = new Date().toISOString();
    updateWorkspace((prev) => {
      if (payload.id) {
        let updatedNodePoints: CsvTelemetryPoint[] | null = null;
        let updatedNodeUnit: ImpedanceUnit = payload.unit ?? "kΩ";

        const updatedNodes = prev.nodes.map((n) => {
          if (n.id !== payload.id) return n;
          const existingFiles = getNodeCsvFiles(n);
          const incomingFiles = payload.addedCsvFiles ?? [];
          const shouldReplace = payload.mergeMode === "replace";

          const combinedFiles =
            incomingFiles.length === 0
              ? existingFiles
              : shouldReplace
              ? incomingFiles
              : Array.from(new Set([...existingFiles, ...incomingFiles]));

          const combinedPoints =
            payload.points && payload.points.length > 0
              ? shouldReplace
                ? payload.points
                : mergeTelemetryPoints(n.points, payload.points)
              : n.points;

          updatedNodePoints = payload.points ? combinedPoints : null;
          updatedNodeUnit =
            n.points.length > 0 && !shouldReplace
              ? n.unit ?? "kΩ"
              : payload.unit ?? n.unit ?? "kΩ";

          const summaryFileName =
            combinedFiles.length > 1
              ? `${combinedFiles.length} CSV files`
              : combinedFiles[0] ?? "";

          return {
            ...n,
            treeId: payload.treeId,
            name: payload.name,
            location: payload.location,
            firmware: payload.firmware,
            csvFileName: summaryFileName,
            csvFiles: combinedFiles,
            intervalLabel:
              combinedPoints.length >= 2
                ? inferIntervalLabel(combinedPoints)
                : payload.intervalLabel ?? n.intervalLabel,
            unit: updatedNodeUnit,
            points: combinedPoints,
            updatedAt: nowIso,
          };
        });

        let updatedPatterns = prev.patterns;
        if (updatedNodePoints) {
          const manualForNode = prev.patterns.filter(
            (p) => p.nodeId === payload.id && p.source === "manual"
          );
          const autoDetected = detectPatternsForNode(
            payload.id,
            updatedNodePoints,
            updatedNodeUnit
          );
          updatedPatterns = [
            ...prev.patterns.filter((p) => p.nodeId !== payload.id),
            ...autoDetected,
            ...manualForNode,
          ];
        }

        return {
          ...prev,
          trees: prev.trees.map((t) =>
            t.id === payload.treeId ? { ...t, isExpanded: true } : t
          ),
          nodes: updatedNodes,
          patterns: updatedPatterns,
          activeNodeId: payload.id,
        };
      }

      const newId = makeId("node");
      const newPoints = payload.points ?? [];
      const newUnit = payload.unit ?? "kΩ";
      const addedFiles = payload.addedCsvFiles ?? [];
      const summaryFileName =
        addedFiles.length > 1
          ? `${addedFiles.length} CSV files`
          : addedFiles[0] ?? "";

      const newNode: SensorNode = {
        id: newId,
        treeId: payload.treeId,
        name: payload.name,
        location: payload.location,
        firmware: payload.firmware,
        csvFileName: summaryFileName,
        csvFiles: addedFiles,
        intervalLabel:
          newPoints.length >= 2
            ? inferIntervalLabel(newPoints)
            : payload.intervalLabel ?? "No data",
        unit: newUnit,
        points: newPoints,
        updatedAt: nowIso,
      };
      const autoDetected =
        newPoints.length >= 10
          ? detectPatternsForNode(newId, newPoints, newUnit)
          : [];

      return {
        ...prev,
        trees: prev.trees.map((t) =>
          t.id === payload.treeId ? { ...t, isExpanded: true } : t
        ),
        nodes: [...prev.nodes, newNode],
        patterns: [...prev.patterns, ...autoDetected],
        activeNodeId: newId,
      };
    });
    setFocusedWindow(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    updateWorkspace((prev) => {
      const remainingNodes = prev.nodes.filter((n) => n.id !== nodeId);
      const remainingPatterns = prev.patterns.filter((p) => p.nodeId !== nodeId);
      const nextActive =
        prev.activeNodeId === nodeId
          ? remainingNodes[0]?.id ?? null
          : prev.activeNodeId;
      return {
        ...prev,
        nodes: remainingNodes,
        patterns: remainingPatterns,
        activeNodeId: nextActive,
      };
    });
    if (similaritySource?.nodeId === nodeId) {
      setSimilaritySource(null);
    }
    setFocusedWindow(null);
  };

  const handleSaveManualPattern = (pattern: IdentifiedPattern) => {
    updateWorkspace((prev) => ({
      ...prev,
      patterns: [...prev.patterns, pattern],
    }));
    setFocusedWindow({
      startTs: pattern.startTs,
      endTs: pattern.endTs,
      label: pattern.name,
    });
  };

  const handleAutoScanPatterns = () => {
    if (!activeNode) return;
    const freshlyDetected = detectPatternsForNode(
      activeNode.id,
      activeNode.points,
      activeNode.unit ?? "kΩ"
    );
    updateWorkspace((prev) => {
      const manualExisting = prev.patterns.filter(
        (p) => p.nodeId === activeNode.id && p.source === "manual"
      );
      return {
        ...prev,
        patterns: [
          ...prev.patterns.filter((p) => p.nodeId !== activeNode.id),
          ...freshlyDetected,
          ...manualExisting,
        ],
      };
    });
  };

  const handleRenamePattern = (patternId: string, newName: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p) =>
        p.id === patternId ? { ...p, name: newName } : p
      ),
    }));
    if (similaritySource?.id === patternId) {
      setSimilaritySource((prev) => (prev ? { ...prev, name: newName } : null));
    }
  };

  const handleDeletePattern = (patternId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      patterns: prev.patterns.filter((p) => p.id !== patternId),
    }));
    if (similaritySource?.id === patternId) {
      setSimilaritySource(null);
    }
  };

  // Tree Type & Reference Library CRUD
  const handleSaveTreeType = (payload: {
    id?: string;
    name: string;
    description: string;
  }): string => {
    const nowIso = new Date().toISOString();
    const resolvedId = payload.id ?? makeId("type");
    updateWorkspace((prev) => {
      if (payload.id) {
        return {
          ...prev,
          treeTypes: prev.treeTypes.map((t) =>
            t.id === payload.id
              ? { ...t, name: payload.name, description: payload.description }
              : t
          ),
        };
      }
      return {
        ...prev,
        treeTypes: [
          ...prev.treeTypes,
          {
            id: resolvedId,
            name: payload.name,
            description: payload.description,
            createdAt: nowIso,
          },
        ],
      };
    });
    return resolvedId;
  };

  const handleDeleteTreeType = (treeTypeId: string) => {
    updateWorkspace((prev) => {
      if (prev.treeTypes.length <= 1) return prev;
      const remainingTypes = prev.treeTypes.filter((t) => t.id !== treeTypeId);
      const fallbackTypeId = remainingTypes[0].id;
      return {
        ...prev,
        treeTypes: remainingTypes,
        referencePatterns: prev.referencePatterns.filter(
          (r) => r.treeTypeId !== treeTypeId
        ),
        trees: prev.trees.map((t) =>
          t.treeTypeId === treeTypeId ? { ...t, treeTypeId: fallbackTypeId } : t
        ),
      };
    });
  };

  const handleSaveReferencePattern = (
    payload: Omit<ReferencePattern, "id" | "createdAt">
  ) => {
    const newRef: ReferencePattern = {
      ...payload,
      id: makeId("ref"),
      createdAt: new Date().toISOString(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      referencePatterns: [...prev.referencePatterns, newRef],
    }));
  };

  const handleRenameReferencePattern = (
    refId: string,
    qualityName: string,
    code?: string,
    notes?: string
  ) => {
    updateWorkspace((prev) => ({
      ...prev,
      referencePatterns: prev.referencePatterns.map((r) =>
        r.id === refId
          ? {
              ...r,
              qualityName,
              code: code ?? r.code,
              notes: notes ?? r.notes,
            }
          : r
      ),
    }));
  };

  const handleDeleteReferencePattern = (refId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      referencePatterns: prev.referencePatterns.filter((r) => r.id !== refId),
    }));
  };

  const handlePinWindowAsReference = (params: {
    startTs: number;
    endTs: number;
    qualityName: string;
  }) => {
    if (!activeNode || !activeTreeType) return;
    const lo = Math.min(params.startTs, params.endTs);
    const hi = Math.max(params.startTs, params.endTs);
    const slice = activeNode.points.filter((p) => p.ts >= lo && p.ts <= hi);
    if (slice.length < 3) return;

    const deltas = computeWindowChannelDeltas(slice);
    const code = getNextReferenceCode(activeTypeReferences);
    const color = pickReferenceColor(activeTypeReferences.length);

    handleSaveReferencePattern({
      treeTypeId: activeTreeType.id,
      code,
      qualityName: params.qualityName,
      color,
      notes: `Pinned from ${activeNode.name} (${slice.length} samples)`,
      sourceFileName: activeNode.csvFileName || activeNode.name,
      unit: activeNode.unit ?? "kΩ",
      points: slice,
      deltaZ: deltas.deltaZ,
      deltaDcV: deltas.deltaDcV,
      deltaRawAdc: deltas.deltaRawAdc,
      durationSec: deltas.durationSec,
    });

    setFocusedWindow({
      startTs: slice[0].ts,
      endTs: slice[slice.length - 1].ts,
      label: `${code} · ${params.qualityName}`,
    });
  };

  const handleFocusReferenceMatch = (m: ReferenceMatchResult) => {
    setFocusedWindow({
      startTs: m.startTs,
      endTs: m.endTs,
      label: `${m.referenceCode} · ${m.qualityName} (${m.overallScore.toFixed(1)}%)`,
    });
  };

  const handleJumpToMatch = (match: SimilarityMatch) => {
    updateWorkspace((prev) => ({
      ...prev,
      trees: prev.trees.map((t) =>
        t.id === match.targetTreeId ? { ...t, isExpanded: true } : t
      ),
      activeNodeId: match.targetNodeId,
    }));
    setFocusedWindow({
      startTs: match.startTs,
      endTs: match.endTs,
      label: `${match.similarityScore.toFixed(1)}% match`,
    });
  };

  const handleDownloadSampleCsv = () => {
    const csv = generateSampleCsvDownload();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biosarc_logger_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetSampleData = () => {
    const fresh = resetWorkspace();
    setWorkspace(fresh);
    setFocusedWindow(null);
    setSimilaritySource(null);
    void hydrateDefaultNodeFromAttachedCsv(fresh).then((hydrated) => {
      setWorkspace(hydrated);
    });
  };

  if (!workspace) {
    return (
      <div className="min-h-screen bg-arc-bg flex items-center justify-center text-xs font-mono text-slate-500">
        Initializing BIOS-ARC workspace...
      </div>
    );
  }

  const activeUnit: ImpedanceUnit = activeNode?.unit ?? "kΩ";
  const latestActivePoint =
    activeNode && activeNode.points.length > 0
      ? activeNode.points[activeNode.points.length - 1]
      : null;

  const autoCount = activeNodePatterns.filter((p) => p.source === "auto").length;
  const manualCount = activeNodePatterns.filter((p) => p.source === "manual").length;

  return (
    <div className="flex h-screen overflow-hidden bg-arc-bg">
      <TreeSidebar
        trees={workspace.trees}
        treeTypes={workspace.treeTypes}
        nodes={workspace.nodes}
        referenceCount={workspace.referencePatterns.length}
        activeNodeId={activeNode?.id ?? null}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectNode={(id) => {
          updateWorkspace((prev) => ({ ...prev, activeNodeId: id }));
          setFocusedWindow(null);
        }}
        onToggleTree={handleToggleTree}
        onOpenNewTree={() => {
          setEditingTree(null);
          setTreeModalOpen(true);
        }}
        onOpenEditTree={(tree) => {
          setEditingTree(tree);
          setTreeModalOpen(true);
        }}
        onDeleteTree={handleDeleteTree}
        onOpenNewNode={(treeId) => {
          setEditingNode(null);
          setDefaultNodeTreeId(treeId);
          setNodeModalOpen(true);
        }}
        onOpenEditNode={(node) => {
          setEditingNode(node);
          setDefaultNodeTreeId(node.treeId);
          setNodeModalOpen(true);
        }}
        onDeleteNode={handleDeleteNode}
        onOpenReferenceLibrary={(treeTypeId) => {
          setRefLibraryTypeId(treeTypeId ?? activeTreeType?.id ?? null);
          setRefLibraryOpen(true);
        }}
        onDownloadSampleCsv={handleDownloadSampleCsv}
        onResetSampleData={handleResetSampleData}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 flex-shrink-0 bg-white border-b border-slate-200 px-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md border border-slate-200 text-slate-600 hover:text-slate-900"
              aria-label="Open tree navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-900 whitespace-nowrap shrink-0">
              Time · RAW ADC · DC V · Impedance
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
            <span>{workspace.treeTypes.length} tree types</span>
            <span aria-hidden="true">·</span>
            <span>{workspace.referencePatterns.length} references</span>
            <span aria-hidden="true">·</span>
            <span>{workspace.nodes.length} nodes</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRefLibraryTypeId(activeTreeType?.id ?? null);
                setRefLibraryOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <BookMarked className="w-3.5 h-3.5 text-arc-accent" />
              Reference Library
            </button>
            <button
              type="button"
              onClick={() => {
                if (workspace.trees.length === 0) {
                  setEditingTree(null);
                  setTreeModalOpen(true);
                } else {
                  setEditingNode(null);
                  setDefaultNodeTreeId(
                    activeTree?.id ?? workspace.trees[0].id
                  );
                  setNodeModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {workspace.trees.length === 0 ? "Add Tree" : "Add Node"}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 4-Card Telemetry Summary Strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
              <div className="text-xs font-medium text-slate-500">Latest Impedance</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-arc-accent2 tabular-nums">
                  {latestActivePoint ? latestActivePoint.value.toFixed(2) : "—"}
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {latestActivePoint ? activeUnit : ""}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
              <div className="text-xs font-medium text-slate-500">DC Voltage (DC V)</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-arc-accent tabular-nums">
                  {latestActivePoint?.dcV !== undefined
                    ? latestActivePoint.dcV.toFixed(3)
                    : "—"}
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {latestActivePoint?.dcV !== undefined ? "V" : ""}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
              <div className="text-xs font-medium text-slate-500">RAW ADC</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-violet-700 tabular-nums">
                  {latestActivePoint?.rawAdc !== undefined
                    ? latestActivePoint.rawAdc.toFixed(1)
                    : "—"}
                </span>
                <span className="text-xs font-mono text-slate-500 truncate">
                  {activeNode ? activeNode.intervalLabel : ""}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
              <div className="text-xs font-medium text-slate-500">
                Reference &amp; Pattern Matches
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
                  {referenceMatches.length}
                </span>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  ref matches · {autoCount + manualCount} patterns
                </span>
              </div>
            </div>
          </div>

          {activeNode && activeTree ? (
            <>
              <QualitySummaryStrip
                treeType={activeTreeType}
                nodeName={activeNode.name}
                summaries={qualitySummaries}
                matches={referenceMatches}
                minScore={refMinScore}
                activeFocusLabel={focusedWindow?.label ?? null}
                onChangeMinScore={setRefMinScore}
                onFocusMatch={handleFocusReferenceMatch}
                onOpenLibrary={() => {
                  setRefLibraryTypeId(activeTreeType?.id ?? null);
                  setRefLibraryOpen(true);
                }}
              />

              <ImpedanceChart
                nodeId={activeNode.id}
                nodeName={activeNode.name}
                treeName={activeTree.name}
                activeTreeTypeName={activeTreeType?.name}
                nextRefCode={nextRefCode}
                location={activeNode.location}
                csvFileName={activeNode.csvFileName}
                csvFiles={getNodeCsvFiles(activeNode)}
                intervalLabel={activeNode.intervalLabel}
                unit={activeUnit}
                points={activeNode.points}
                patterns={activeNodePatterns}
                referenceMatches={referenceMatches}
                focusedWindow={focusedWindow}
                onClearFocus={() => setFocusedWindow(null)}
                onSaveManualPattern={handleSaveManualPattern}
                onSaveSelectionAsReference={handlePinWindowAsReference}
                onAutoScanPatterns={handleAutoScanPatterns}
                onOpenCsvModal={() => {
                  setEditingNode(activeNode);
                  setDefaultNodeTreeId(activeNode.treeId);
                  setNodeModalOpen(true);
                }}
              />

              <PatternList
                nodeName={activeNode.name}
                treeTypeName={activeTreeType?.name}
                nextRefCode={nextRefCode}
                unit={activeUnit}
                points={activeNode.points}
                patterns={activeNodePatterns}
                references={activeTypeReferences}
                referenceMatches={referenceMatches}
                activeFocusLabel={focusedWindow?.label ?? null}
                similaritySourcePattern={similaritySource}
                similarityMatches={similarityMatches}
                minSimilarity={minSimilarity}
                onChangeMinSimilarity={setMinSimilarity}
                onFocusPattern={(pat) =>
                  setFocusedWindow({
                    startTs: pat.startTs,
                    endTs: pat.endTs,
                    label: pat.name,
                  })
                }
                onFocusReferenceMatch={handleFocusReferenceMatch}
                onRenamePattern={handleRenamePattern}
                onDeletePattern={handleDeletePattern}
                onPinPatternAsReference={(pat) =>
                  handlePinWindowAsReference({
                    startTs: pat.startTs,
                    endTs: pat.endTs,
                    qualityName: pat.name,
                  })
                }
                onFindSimilar={(pat) => setSimilaritySource(pat)}
                onCloseSimilarity={() => setSimilaritySource(null)}
                onJumpToMatch={handleJumpToMatch}
              />
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                Create a Tree &amp; Sensor Node to Begin
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Assign each tree a Tree Type (e.g., Mango) to match its CSV telemetry automatically against curated D1–Dn reference signatures.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingTree(null);
                  setTreeModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Create First Tree
              </button>
            </div>
          )}
        </main>
      </div>

      <TreeModal
        open={treeModalOpen}
        initialTree={editingTree}
        treeTypes={workspace.treeTypes}
        onClose={() => setTreeModalOpen(false)}
        onSave={handleSaveTree}
      />

      <NodeModal
        open={nodeModalOpen}
        trees={workspace.trees}
        initialNode={editingNode}
        defaultTreeId={defaultNodeTreeId}
        onClose={() => setNodeModalOpen(false)}
        onSave={handleSaveNode}
      />

      <ReferenceLibraryModal
        open={refLibraryOpen}
        initialTreeTypeId={refLibraryTypeId}
        treeTypes={workspace.treeTypes}
        trees={workspace.trees}
        referencePatterns={workspace.referencePatterns}
        onClose={() => setRefLibraryOpen(false)}
        onSaveTreeType={handleSaveTreeType}
        onDeleteTreeType={handleDeleteTreeType}
        onSaveReferencePattern={handleSaveReferencePattern}
        onRenameReferencePattern={handleRenameReferencePattern}
        onDeleteReferencePattern={handleDeleteReferencePattern}
      />
    </div>
  );
}
