import { NextRequest, NextResponse } from "next/server";
import { db, isDbConfigured } from "@/lib/db/client";
import { nodes } from "@/lib/db/schema";

const MOCK_NODES = [
  { id: 1, nodeId: "esp32-01", label: "Node Alpha", location: "Chamber A", firmware: "v2.4.1", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
  { id: 2, nodeId: "esp32-02", label: "Node Beta",  location: "Chamber B", firmware: "v2.4.1", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
  { id: 3, nodeId: "esp32-03", label: "Node Gamma", location: "Chamber C", firmware: "v2.3.9", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
];

// GET /api/nodes  — list all registered nodes
export async function GET(_req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ nodes: MOCK_NODES });
  }
  try {
    const all = await db.select().from(nodes);
    return NextResponse.json({ nodes: all });
  } catch (err: unknown) {
    console.warn("[/api/nodes] DB error, returning mock nodes:", err);
    return NextResponse.json({ nodes: MOCK_NODES });
  }
}
