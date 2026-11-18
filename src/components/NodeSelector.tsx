"use client";

import { useState } from "react";
import clsx from "clsx";

const NODES = [
  { id: "esp32-01", label: "Node Alpha",  location: "Chamber A" },
  { id: "esp32-02", label: "Node Beta",   location: "Chamber B" },
  { id: "esp32-03", label: "Node Gamma",  location: "Chamber C" },
];

interface NodeSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

export default function NodeSelector({ selected, onSelect }: NodeSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-mono text-arc-muted uppercase tracking-widest mb-2 px-1">
        ESP32 Nodes
      </div>
      {NODES.map((node) => {
        const active = selected === node.id;
        return (
          <button
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={clsx(
              "w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150 group",
              active
                ? "bg-arc-accent/10 border-arc-accent text-arc-text glow-cyan"
                : "bg-arc-panel border-arc-border text-arc-textDim hover:border-arc-muted hover:text-arc-text"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  active ? "bg-arc-accent animate-pulse-slow" : "bg-arc-muted"
                )}
              />
              <div className="min-w-0">
                <div className={clsx("text-xs font-mono font-semibold truncate", active && "text-arc-accent")}>
                  {node.label}
                </div>
                <div className="text-xs font-mono text-arc-muted truncate">{node.location}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
