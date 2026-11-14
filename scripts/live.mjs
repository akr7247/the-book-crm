/**
 * One MCP read for the hosted refresh job: get_signals, stored like the full pull.
 * Fails soft if the MCP is rate-limited, so a scheduled deploy still ships the last good state.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, createMcp, saveRaw } from "../lib/mcp.mjs";
import { loadSignals } from "../lib/signals.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(root);
const url = process.env.MCP_URL || env.MCP_URL;
const token = process.env.MCP_TOKEN || env.MCP_TOKEN;

if (!url || !token) {
  console.error("live: MCP_URL / MCP_TOKEN missing. Leaving the stored signals in place.");
  process.exit(0);
}

const mcp = createMcp({ url, token }, { log: console.log });
try {
  const data = await mcp.call("get_signals");
  const signals = Array.isArray(data) ? data : data?.signals || [];
  if (!signals.length) {
    const kept = loadSignals(root);
    console.log(`live: no new signals; ${kept.length} already on file.`);
    process.exit(0);
  }
  saveRaw(root, "get_signals", data);
  const merged = loadSignals(root);
  writeFileSync(resolve(root, "data/signals.json"), JSON.stringify(merged, null, 2));
  console.log(`live: ${signals.length} new, ${merged.length} signals on file`);
} catch (e) {
  console.error(`live: ${e.code === 429 ? "rate limited" : e.message || e}. Deploying the last stored state.`);
  process.exit(0);
}
