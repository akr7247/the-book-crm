import { loadEnv, createMcp, saveRaw } from "../lib/mcp.mjs";
import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(root);
const mcp = createMcp({ url: env.MCP_URL, token: env.MCP_TOKEN }, { log: console.log });

const queue = [
  { tool: "get_all_paperwork", args: { account: "A" }, key: "get_all_paperwork" },
  { tool: "get_all_paperwork", args: { account: "B" }, key: "get_all_paperwork-B" },
  { tool: "get_feature_requests", args: {}, key: "get_feature_requests" },
  { tool: "get_release_notes", args: {}, key: "get_release_notes" },
  { tool: "get_flytbase_team", args: {}, key: "get_flytbase_team" },
  { tool: "get_signals", args: {}, key: "get_signals" },
];

const rawDir = resolve(root, "data/raw");
const done = new Set(
  existsSync(rawDir)
    ? readdirSync(rawDir).map((f) => f.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-/, "").replace(/\.json$/, ""))
    : []
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const job of queue) {
  if (done.has(job.key)) {
    console.log(`skip (already have): ${job.key}`);
    continue;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`calling ${job.tool} ${JSON.stringify(job.args)} (attempt ${attempt})`);
      const data = await mcp.call(job.tool, job.args);
      saveRaw(root, job.key, data);
      console.log(`ok: ${job.key}`);
      break;
    } catch (e) {
      if (e.code === 429) {
        console.log("rate limited, waiting 65s");
        await sleep(65000);
      } else {
        console.error(`failed ${job.tool}:`, e.message, e.body || "");
        if (attempt === 3) process.exit(1);
        await sleep(65000);
      }
    }
  }
  await sleep(61000);
}
console.log("pull-all complete");
