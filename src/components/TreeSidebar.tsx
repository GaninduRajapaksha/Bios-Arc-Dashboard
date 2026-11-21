"use client";

import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Download,
  FolderPlus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Trees,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { SensorNode, TreeGroup, TreeType } from "@/lib/biosarcStore";

interface TreeSidebarProps {
  trees: TreeGroup[];
  treeTypes: TreeType[];
  nodes: SensorNode[];
  referenceCount: number;
  activeNodeId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleTree: (treeId: string) => void;
  onOpenNewTree: () => void;
  onOpenEditTree: (tree: TreeGroup) => void;
  onDeleteTree: (treeId: string) => void;
  onOpenNewNode: (treeId: string) => void;
  onOpenEditNode: (node: SensorNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenReferenceLibrary: (treeTypeId?: string) => void;
  onDownloadSampleCsv: () => void;
  onResetSampleData: () => void;
}

export default function TreeSidebar({
  trees,
  treeTypes,
  nodes,
  referenceCount,
  activeNodeId,
  mobileOpen,
  onCloseMobile,
  onSelectNode,
  onToggleTree,
  onOpenNewTree,
  onOpenEditTree,
  onDeleteTree,
  onOpenNewNode,
  onOpenEditNode,
  onDeleteNode,
  onOpenReferenceLibrary,
  onDownloadSampleCsv,
  onResetSampleData,
}: TreeSidebarProps) {
  const treeTypeMap = new Map(treeTypes.map((t) => [t.id, t.name]));

  const sidebarBody = (
    <div className="flex flex-col h-full bg-arc-sidebar text-slate-100 select-none">
      {/* Brand header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800/80 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-arc-accent flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            B
          </div>
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            BIOS-ARC
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Reference Library launcher */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            onOpenReferenceLibrary();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/70 hover:bg-arc-sidebarHover border border-slate-800 text-xs font-semibold text-slate-100 transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            Reference Library
          </span>
          <span className="font-mono text-[11px] text-emerald-300 tabular-nums">
            {treeTypes.length} types · {referenceCount} refs
          </span>
        </button>
      </div>

      {/* Tree inventory header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-400 tracking-wide">
          Trees &amp; Nodes
        </span>
        <button
          type="button"
          onClick={onOpenNewTree}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          New Tree
        </button>
      </div>

      {/* Expandable tree list */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-2.5 py-2 space-y-2">
        {trees.length === 0 ? (
          <div className="px-3 py-6 text-center rounded-lg border border-slate-800 bg-slate-900/40">
            <p className="text-xs text-slate-400 mb-3">
              No trees configured yet.
            </p>
            <button
              type="button"
              onClick={onOpenNewTree}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-arc-accent hover:bg-arc-accentHover text-white text-xs font-medium whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First Tree
            </button>
          </div>
        ) : (
          trees.map((tree) => {
            const treeNodes = nodes.filter((n) => n.treeId === tree.id);
            const totalSamples = treeNodes.reduce((acc, n) => acc + n.points.length, 0);
            const typeName = treeTypeMap.get(tree.treeTypeId) ?? "Unassigned";

            return (
              <div
                key={tree.id}
                className="rounded-lg border border-slate-800/80 bg-slate-900/40 overflow-hidden"
              >
                {/* Tree group row */}
                <div className="group flex items-center gap-1.5 px-2.5 py-2 hover:bg-arc-sidebarHover transition-colors">
                  <button
                    type="button"
                    onClick={() => onToggleTree(tree.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {tree.isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <Trees className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {tree.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                        {typeName} · {treeNodes.length} {treeNodes.length === 1 ? "node" : "nodes"} · {totalSamples.toLocaleString()} pts
                      </div>
                    </div>
                  </button>

                  {/* Tree actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenNewNode(tree.id)}
                      title="Add node to tree"
                      className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEditTree(tree)}
                      title="Rename or edit tree"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTree(tree.id)}
                      title="Remove tree"
                      className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Nested nodes */}
                {tree.isExpanded && (
                  <div className="px-2 pb-2 pt-1 space-y-1 border-t border-slate-800/70">
                    {treeNodes.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenNewNode(tree.id)}
                        className="w-full py-2 px-2.5 rounded-md border border-dashed border-slate-700 text-xs text-slate-400 hover:text-emerald-300 hover:border-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add node to {tree.name}
                      </button>
                    ) : (
                      treeNodes.map((node) => {
                        const isActive = activeNodeId === node.id;
                        return (
                          <div
                            key={node.id}
                            className={clsx(
                              "group/node flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-colors",
                              isActive
                                ? "bg-arc-accent text-white"
                                : "text-slate-300 hover:bg-arc-sidebarHover"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onSelectNode(node.id);
                                onCloseMobile();
                              }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="text-xs font-semibold truncate">
                                {node.name}
                              </div>
                              <div
                                className={clsx(
                                  "text-[11px] font-mono tabular-nums truncate",
                                  isActive ? "text-emerald-100" : "text-slate-400"
                                )}
                              >
                                {node.location || "Unassigned"} ·{" "}
                                {node.points.length > 0
                                  ? `${node.points.length} pts`
                                  : "No CSV"}
                              </div>
                            </button>

                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => onOpenEditNode(node)}
                                title="Edit node or upload CSV"
                                className={clsx(
                                  "p-1 rounded transition-colors",
                                  isActive
                                    ? "text-emerald-100 hover:text-white hover:bg-emerald-800/60"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                                )}
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteNode(node.id)}
                                title="Remove node"
                                className={clsx(
                                  "p-1 rounded transition-colors",
                                  isActive
                                    ? "text-emerald-100 hover:text-red-200 hover:bg-emerald-800/60"
                                    : "text-slate-400 hover:text-red-400 hover:bg-slate-800"
                                )}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom utility actions */}
      <div className="p-3 border-t border-slate-800/80 space-y-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onDownloadSampleCsv}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-arc-sidebarHover transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          Download Sample CSV
        </button>
        <button
          type="button"
          onClick={onResetSampleData}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-arc-sidebarHover transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
          Reset Sample Workspace
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-slate-800 h-full">
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
}
