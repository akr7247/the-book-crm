import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, createMcp } from "./lib/mcp.mjs";
import { mergeSignals, loadSignals } from "./lib/signals.mjs";
import { build } from "./scripts/build-store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const env = loadEnv(root);
const cfg = { url: process.env.MCP_URL || env.MCP_URL, token: process.env.MCP_TOKEN || env.MCP_TOKEN };
const PORT = Number(process.env.PORT || 3000);
const PUBLIC = resolve(root, "public");

if (!cfg.token || !cfg.url) {
  console.error("Missing MCP_URL / MCP_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const mcp = createMcp(cfg, { log: (m) => console.log(m) });

const signalsPath = resolve(root, "data/signals.json");
const notesPath = resolve(root, "data/notes.json");
const readJson = (p, f) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return f; } };

let signals = loadSignals(root);
let notes = readJson(notesPath, []);
let queue = [];
let lastSync = null;
let nextPollAt = new Date(Date.now() + 60000);
let pollState = "ok";
let ticks = 0;
let store = null;

function rebuild() {
  store = build({
    lastSync,
    nextPollAt: nextPollAt.toISOString(),
    pollState,
    callsLabel: lastSync
      ? `One MCP read a minute · last ${new Date(lastSync).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
      : "Stored pull loaded · live reads start in a minute",
    footLabel: `Reads: get_signals every minute · writes: write_note. Last sync ${lastSync ? new Date(lastSync).toLocaleString("en-GB") : "not yet"}.`,
    liveLabel: pollState === "limited" ? "Rate-limited" : pollState === "err" ? "Retrying" : "Live",
  });
}

rebuild();

async function save(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function tick() {
  ticks++;
  const stamp = new Date().toISOString();
  const settle = async (note, patch) => {
    const merged = {
      ...note,
      ...patch,
      pending: false,
      createdLabel: new Date(note.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    };
    const i = notes.findIndex((n) => n.createdAt === note.createdAt && n.pending);
    if (i >= 0) notes[i] = merged;
    else notes.push(merged);
    await save(notesPath, notes);
  };
  try {
    if (queue.length) {
      const note = queue[0];
      try {
        const result = await mcp.call("write_note", { text: note.text, account: note.account, kind: note.kind, title: note.title });
        await settle(note, { result });
        queue.shift();
        console.log(`[note] wrote note for account ${note.account}`);
      } catch (e) {
        if (e.code === 429) throw e;
        await settle(note, { error: String(e.message || e) });
        queue.shift();
        console.error(`[note] rejected: ${e.message || e}`);
      }
    } else {
      const result = await mcp.call("get_signals");
      const list = Array.isArray(result) ? result : result?.signals || [];
      if (list.length) {
        signals = mergeSignals(signals, list);
        await save(signalsPath, signals);
      }
    }
    pollState = "ok";
    lastSync = stamp;
  } catch (e) {
    pollState = e.code === 429 ? "limited" : "err";
    console.error(`[poll] ${pollState}: ${e.message || e}`);
  }
  nextPollAt = new Date(Date.now() + (pollState === "limited" ? 75000 : 62000));
  rebuild();
  setTimeout(tick, nextPollAt.getTime() - Date.now());
}

// start the live loop one minute after boot so the stored pull is served first
setTimeout(tick, 60000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, code, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    ...extra,
  });
  res.end(body);
}

function readBody(req, limit = 20000) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (path === "/api/state" && req.method === "GET") {
    if (!store) rebuild();
    return send(res, 200, JSON.stringify(store));
  }

  if (path === "/api/health" && req.method === "GET") {
    return send(res, 200, JSON.stringify({ ok: true, lastSync, pollState, queued: queue.length, signals: signals.length, notes: notes.length }));
  }

  if (path === "/api/notes" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, JSON.stringify({ error: "invalid JSON" })); }
    const text = String(body.text || "").trim();
    const account = String(body.account || "").trim();
    const kind = ["note", "task", "risk", "next_step"].includes(body.kind) ? body.kind : "note";
    const title = String(body.title || "").trim().slice(0, 140);
    if (!text) return send(res, 400, JSON.stringify({ error: "text is required" }));
    if (!["A", "B"].includes(account)) return send(res, 400, JSON.stringify({ error: "account must be A or B" }));
    if (queue.length >= 10) return send(res, 429, JSON.stringify({ error: "write queue is full, try again in a few minutes" }));
    const note = { text: text.slice(0, 4000), account, kind, title, createdAt: new Date().toISOString(), pending: true };
    queue.push(note);
    notes.push(note);
    await save(notesPath, notes);
    rebuild();
    const wait = Math.max(0, Math.round((nextPollAt.getTime() - Date.now()) / 1000));
    return send(res, 202, JSON.stringify({ ok: true, message: `Queued. write_note runs in about ${wait}s (one MCP call a minute).` }));
  }

  // static files
  let file = path === "/" ? "/index.html" : normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  const target = join(PUBLIC, file.replace(/^[/\\]+/, ""));
  if (!target.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const s = await stat(target);
    if (!s.isFile()) throw new Error("not a file");
    const type = MIME[extname(target).toLowerCase()] || "application/octet-stream";
    const data = await readFile(target);
    const ext = extname(target).toLowerCase();
    const cache = [".html", ".js", ".css"].includes(ext) ? "no-cache" : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(data);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
});

server.listen(PORT, () => {
  console.log(`The Book running on http://localhost:${PORT}`);
  console.log(`${store.accounts.length} accounts · ${store.sources.length} sources · ${store.signals.length} signals loaded`);
  console.log(`Next live read at ${nextPollAt.toISOString()}`);
});
