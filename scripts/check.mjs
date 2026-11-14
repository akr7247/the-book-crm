/**
 * Guard rails for the hand-in:
 *  1. every id cited by an answer exists in the source registry;
 *  2. the totals are the sum of the deals shown;
 *  3. the live MCP token appears in no file that would be published.
 * Run with: npm run check
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/mcp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

const storePath = resolve(root, "data/store.json");
if (!existsSync(storePath)) {
  console.error("data/store.json is missing. Run npm run build:store first.");
  process.exit(1);
}
const store = JSON.parse(readFileSync(storePath, "utf8"));
const ids = new Set(store.sources.map((s) => s.id));

// 1. citations resolve
function walk(node, path, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  for (const [k, v] of Object.entries(node)) visit(k, v, `${path}.${k}`);
  for (const [k, v] of Object.entries(node)) if (typeof v === "object") walk(v, `${path}.${k}`, visit);
}
const cited = new Set();
walk(store.accounts, "accounts", (k, v, p) => {
  if ((k === "sourceIds" || k === "whoSourceIds") && Array.isArray(v)) {
    for (const id of v) {
      cited.add(id);
      if (!ids.has(id)) fail(`unresolved citation ${id} at ${p}`);
    }
  }
});
for (const s of store.signals) {
  for (const rec of s.records || []) {
    if (rec.kind === "request") {
      const rows = String(rec.text || "").trim().split(/\r?\n/);
      const id = (rows[1] || "").split(",")[0];
      if (!id) fail(`signal ${s.id} has a request record with no id row`);
      else if (!ids.has(`request:${id}`)) fail(`signal ${s.id} request ${id} is not in the registry`);
    }
    if (rec.kind === "email" && !ids.has(`signal-email:${s.id}`)) fail(`signal ${s.id} email is not in the registry`);
  }
}
notes.push(`${cited.size} distinct ids cited by the answers; all resolve`);

// 2. totals add up
for (const a of store.accounts) {
  const q1 = a.answers.q1;
  const backed = q1.deals.filter((d) => d.valueKind === "backed");
  const sumBacked = backed.reduce((n, d) => n + d.value, 0);
  if (sumBacked !== q1.backedTotal) fail(`${a.id}: backedTotal ${q1.backedTotal} != sum of backed deals ${sumBacked}`);
  if (backed.length !== q1.backedCount) fail(`${a.id}: backedCount ${q1.backedCount} != ${backed.length}`);
  const declinedSum = a.offers.filter((o) => o.status === "declined").reduce((n, o) => n + o.value, 0);
  if (declinedSum !== q1.declinedTotal) fail(`${a.id}: declinedTotal ${q1.declinedTotal} != sum of declined offers ${declinedSum}`);
  if (!q1.deals.length) fail(`${a.id}: no deals`);
  if (a.answers.q3.moves.length !== 3) fail(`${a.id}: expected 3 moves, got ${a.answers.q3.moves.length}`);
  for (const m of a.answers.q3.moves) {
    if (!m.owner) fail(`${a.id}: move "${m.action}" has no owner`);
    if (!m.due) fail(`${a.id}: move "${m.action}" has no due date`);
  }
  for (const g of a.answers.q5.gaps) if (!g.who) fail(`${a.id}: gap "${g.question}" has no owner for the answer`);
  notes.push(`${a.id}: ${backed.length} backed deal(s), ${a.answers.q4.risks.length} risks, ${a.answers.q5.gaps.length} gaps, ${a.answers.q3.moves.length} moves`);
}

// 3. token never leaves the server
const env = loadEnv(root);
const token = process.env.MCP_TOKEN || env.MCP_TOKEN;
const skip = new Set([".git", "node_modules", "data/raw", ".env"]);
const textExt = new Set([".js", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".example", ".yml", ".yaml", ".toml"]);
function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) yield* files(full);
    else yield full;
  }
}
if (token) {
  let scanned = 0;
  for (const f of files(root)) {
    if (f.includes(`${join("data", "raw")}`)) continue;
    if (!textExt.has(extname(f).toLowerCase()) && !f.endsWith(".env.example")) continue;
    let body;
    try { body = readFileSync(f, "utf8"); } catch { continue; }
    scanned++;
    if (body.includes(token)) fail(`token value found in ${f.slice(root.length + 1)}`);
    if (/MCP_TOKEN\s*=\s*(?!replace-with-your-token)\S{20,}/.test(body)) fail(`a real-looking MCP_TOKEN is committed in ${f.slice(root.length + 1)}`);
  }
  notes.push(`token scanned across ${scanned} text files; not present`);
} else {
  notes.push("MCP_TOKEN not set locally — leak scan skipped");
}

console.log("\nThe Book — checks\n");
for (const n of notes) console.log(`  ok  ${n}`);
if (failures.length) {
  console.log("");
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(`\n${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log(`\nAll checks passed.\n`);
