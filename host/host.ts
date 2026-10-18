// EKAM — Public Edition · standalone host
//
// Runs EKAM outside the Muse space runtime, on any machine with Bun:
//   bun install
//   bun run start
//
// What this host provides (the pieces the space runtime used to provide):
//   - the built web client, served as static files
//   - POST /actions        — the app's action protocol ({action, args} → {data})
//   - a SQLite database    — data/ekam.db, created from drizzle/*.sql on boot
//   - blob storage         — data/blobs/ (chat attachments, generated images),
//                            served at /blobs/<key>
// Everything else — accounts, keys, the Divider, learning — is EKAM's own
// code in server/actions.ts, running unmodified.

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as schema from "../server/schema.ts";
import { Actions } from "../server/actions.ts";

const ROOT = resolve(import.meta.dir, "..");
const CLIENT_DIR = join(ROOT, "client");
const DRIZZLE_DIR = join(ROOT, "drizzle");
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const BLOBS_DIR = join(DATA_DIR, "blobs");
const PORT = Number(process.env.PORT ?? 4173);

mkdirSync(BLOBS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Database: open (or create) data/ekam.db and apply any new migrations.
// ---------------------------------------------------------------------------
const sqlite = new Database(join(DATA_DIR, "ekam.db"), { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS _ekam_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
);
const appliedRows = sqlite
  .query("SELECT name FROM _ekam_migrations")
  .all() as { name: string }[];
const applied = new Set(appliedRows.map((r) => r.name));
const migrationFiles = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of migrationFiles) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(DRIZZLE_DIR, file), "utf8");
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(sql);
    sqlite
      .query("INSERT INTO _ekam_migrations (name, applied_at) VALUES (?, ?)")
      .run(file, Date.now());
    sqlite.exec("COMMIT");
    console.log(`[ekam] applied migration ${file}`);
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}
const db = drizzle(sqlite, { schema });

// ---------------------------------------------------------------------------
// Blobs: files on disk under data/blobs/, one per key, plus a .type sidecar.
// ---------------------------------------------------------------------------
const blobPath = (key: string) => join(BLOBS_DIR, encodeURIComponent(key));
const blobs = {
  async put(key: string, bytes: Uint8Array | ArrayBuffer, opts?: { contentType?: string }) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    await Bun.write(blobPath(key), data);
    await Bun.write(blobPath(key) + ".type", opts?.contentType ?? "application/octet-stream");
  },
  async getUrl(key: string) {
    return `/blobs/${encodeURIComponent(key)}`;
  },
};

// The context every action handler receives — the same surface the space
// runtime provided: ctx.db(), ctx.blobs, ctx.invalidateQueries().
const ctx = {
  db: () => db,
  blobs,
  invalidateQueries: () => {},
};

// ---------------------------------------------------------------------------
// HTTP server.
// ---------------------------------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleAction(req: Request): Promise<Response> {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body was not valid JSON." }, 400);
  }
  const name = typeof payload?.action === "string" ? payload.action : "";
  const def = (Actions as Record<string, any>)[name];
  if (!def || typeof def.handler !== "function") {
    return json({ error: `Unknown action: ${name || "(missing)"}` }, 404);
  }
  let args: any;
  try {
    args = def.request.parse(payload?.args ?? {});
  } catch (err: any) {
    const first = err?.issues?.[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return json({ error: `Invalid request for ${name}${where}: ${first?.message ?? "validation failed"}` }, 400);
  }
  try {
    const result = await def.handler(ctx, args);
    let data = result;
    if (def.response?.parse) {
      try {
        data = def.response.parse(result);
      } catch {
        console.warn(`[ekam] response of ${name} did not match its schema; returning raw result`);
      }
    }
    return json({ data });
  } catch (err: any) {
    console.error(`[ekam] action ${name} failed:`, err);
    return json({ error: err?.message ?? `Action ${name} failed` }, 500);
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  // Chat runs can legitimately take a minute (divider + parts + combine).
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "POST" && (path === "/actions" || path.endsWith("/actions"))) {
      return handleAction(req);
    }

    if (req.method === "GET" && path.startsWith("/blobs/")) {
      const key = decodeURIComponent(path.slice("/blobs/".length));
      const filePath = blobPath(key);
      if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
      const typeFile = Bun.file(filePath + ".type");
      const contentType = (await typeFile.exists())
        ? (await typeFile.text()).trim()
        : "application/octet-stream";
      return new Response(Bun.file(filePath), {
        headers: { "content-type": contentType, "cache-control": "private, max-age=86400" },
      });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
      const candidate = join(CLIENT_DIR, rel);
      if (candidate.startsWith(CLIENT_DIR) && existsSync(candidate)) {
        const f = Bun.file(candidate);
        if (f.size > 0 || rel !== "index.html") return new Response(f);
      }
      // SPA fallback: every other page route gets the app shell.
      return new Response(Bun.file(join(CLIENT_DIR, "index.html")), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  },
});

console.log("");
console.log("  EKAM — Public Edition (standalone host)");
console.log(`  → http://localhost:${server.port}`);
console.log(`  → data lives in ${DATA_DIR} (ekam.db + blobs/) — keep this folder safe and backed up.`);
console.log("");
