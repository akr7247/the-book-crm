import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(root) {
  const p = resolve(root, ".env");
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
}

export function createMcp({ url, token }, { log = () => {} } = {}) {
  let nextId = 1;
  let initialized = false;

  async function rpc(method, params, { retries = 1 } = {}) {
    const body = { jsonrpc: "2.0", id: nextId++, method, params };
    for (let attempt = 0; attempt <= retries; attempt++) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      if (r.status === 429) {
        const err = new Error("rate_limited");
        err.code = 429;
        err.body = raw;
        throw err;
      }
      if (!r.ok) {
        const err = new Error(`http_${r.status}`);
        err.code = r.status;
        err.body = raw.slice(0, 500);
        if (attempt < retries) continue;
        throw err;
      }
      let json = raw;
      if (raw.trimStart().startsWith("event:") || raw.includes("\ndata:")) {
        json = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
      }
      const parsed = JSON.parse(json);
      if (parsed.error) {
        const err = new Error(parsed.error.message || "mcp_error");
        err.body = parsed.error;
        throw err;
      }
      return parsed.result;
    }
  }

  async function init() {
    if (initialized) return;
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "book-crm", version: "1.0" },
    });
    initialized = true;
  }

  async function call(name, args = {}) {
    await init();
    const result = await rpc("tools/call", { name, arguments: args });
    const text = (result?.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    let data = result?.structuredContent;
    if (data == null && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    log(`[mcp] ${name} ok`);
    return data;
  }

  return { call, init };
}

export function saveRaw(root, tool, data) {
  const dir = resolve(root, "data/raw");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(dir, `${stamp}-${tool}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
