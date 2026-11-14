/**
 * Build the hosted, read-only copy: public/ + data/store.json -> dist/.
 * The page fetches state.json when /api/state is not available.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const storePath = resolve(root, "data/store.json");

if (!existsSync(storePath)) {
  console.error("data/store.json is missing. Run npm run build:store first.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const f of ["index.html", "styles.css", "app.js"]) {
  copyFileSync(resolve(root, "public", f), resolve(dist, f));
}

const store = JSON.parse(readFileSync(storePath, "utf8"));
const now = new Date();
store.meta = {
  ...store.meta,
  static: true,
  lastSync: now.toISOString(),
  lastSyncLabel: now.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  liveLabel: "Hosted snapshot",
  callsLabel: "Read-only copy · refreshed by a scheduled MCP job",
  footLabel: "Hosted snapshot. The MCP token lives only in the server job; this page carries no credentials.",
  pollState: "ok",
};

writeFileSync(resolve(dist, "state.json"), JSON.stringify(store, null, 2));
writeFileSync(resolve(dist, ".nojekyll"), "");

console.log(`exported dist/ — ${store.accounts.length} accounts, ${store.sources.length} sources, ${store.signals.length} signals`);
