/**
 * get_signals delivers each signal once: a later read returns only what is new,
 * and a signal that has already been served is not served again. The page therefore
 * keeps every signal it has been given, and merges new ones into that archive.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function unwrap(j) {
  if (j && j.jsonrpc && j.result) {
    if (j.result.structuredContent) return j.result.structuredContent;
    const t = (j.result.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    try { return JSON.parse(t); } catch { return t; }
  }
  return j;
}

export function mergeSignals(...lists) {
  const by = new Map();
  for (const list of lists) {
    for (const sig of list || []) {
      if (!sig?.id) continue;
      const prev = by.get(sig.id);
      if (!prev || (sig.records?.length || 0) > (prev.records?.length || 0)) by.set(sig.id, { ...sig });
    }
  }
  return [...by.values()].sort(
    (a, b) => String(b.dated || "").localeCompare(String(a.dated || "")) || String(a.id).localeCompare(String(b.id))
  );
}

export function loadSignals(root) {
  const dir = resolve(root, "data/raw");
  const lists = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith("-get_signals.json")).sort()) {
      try {
        const d = unwrap(JSON.parse(readFileSync(resolve(dir, f), "utf8")));
        lists.push(Array.isArray(d) ? d : d?.signals || []);
      } catch {}
    }
  }
  try { lists.push(JSON.parse(readFileSync(resolve(root, "data/signals.json"), "utf8"))); } catch {}
  return mergeSignals(...lists);
}
