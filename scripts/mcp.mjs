import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const [tool, ...rest] = process.argv.slice(2);
if (!tool) {
  console.error("usage: node scripts/mcp.mjs <tool> [key=value ...] | [jsonArgs]");
  process.exit(1);
}
let args = {};
if (rest.length === 1 && rest[0].trim().startsWith("{")) {
  args = JSON.parse(rest[0]);
} else {
  for (const kv of rest) {
    const i = kv.indexOf("=");
    if (i > 0) args[kv.slice(0, i)] = kv.slice(i + 1);
  }
}

const body = {
  jsonrpc: "2.0",
  id: Date.now(),
  method: "tools/call",
  params: { name: tool, arguments: args },
};

async function call() {
  const r = await fetch(env.MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MCP_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  if (r.status === 429) {
    console.error("RATE LIMITED:", raw.slice(0, 500));
    process.exit(2);
  }
  if (!r.ok) {
    console.error("HTTP", r.status, raw.slice(0, 1000));
    process.exit(3);
  }
  // handle SSE framing
  let json = raw;
  if (raw.trimStart().startsWith("event:") || raw.includes("\ndata:")) {
    const dataLine = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    json = dataLine;
  }
  return JSON.parse(json);
}

const out = await call();
mkdirSync(resolve(root, "data/raw"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(root, "data/raw", `${stamp}-${tool}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log("saved:", file);

const result = out.result ?? out;
if (result?.content) {
  for (const c of result.content) {
    if (c.type === "text") console.log(c.text);
    else console.log(JSON.stringify(c).slice(0, 2000));
  }
  if (result.structuredContent) console.log("\n[structuredContent]\n" + JSON.stringify(result.structuredContent, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
