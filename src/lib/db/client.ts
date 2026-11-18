import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Neon serverless HTTP client (edge-compatible, works in Next.js App Router
// Server Components, Route Handlers, and Middleware).
// ---------------------------------------------------------------------------

export const isDbConfigured = Boolean(process.env.DATABASE_URL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sql: any;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  sql = neon(process.env.DATABASE_URL);
  db = drizzle(sql, { schema });
} catch {
  console.warn("[AI Studio] Database not connected — using in-memory mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  const chainStub: unknown = new Proxy(() => chainStub, {
    get: (_t, prop) => {
      if (prop === "then") return undefined;
      if (prop === "returning") return async () => [];
      return () => chainStub;
    },
  });
  db = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "query") return new Proxy({}, { get: () => noOp });
        if (prop === "select" || prop === "insert" || prop === "update" || prop === "delete") {
          return () => chainStub;
        }
        return async () => [];
      },
    }
  );
  sql = async () => [];
}

export { db, sql };
