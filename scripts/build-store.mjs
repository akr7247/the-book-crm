import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRaw, analyze } from "../lib/analyze.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function build({ lastSync = null, nextPollAt = null, pollState = "ok", callsLabel, footLabel } = {}) {
  const raw = loadRaw(root);
  const signals = readJson(resolve(root, "data/signals.json"), raw.get_signals?.signals || []);
  const notes = readJson(resolve(root, "data/notes.json"), []);
  const out = analyze({
    raw,
    signals,
    notes,
    meta: {
      exportedAt: raw.get_my_accounts?.exported_at,
      lastSync,
      nextPollAt,
      pollState,
      callsLabel: callsLabel || "Stored pull · live reads once a minute",
      footLabel: footLabel || "Token stays on the server. The browser only reads this server.",
      liveLabel: pollState === "limited" ? "Rate-limited" : "Live",
    },
  });
  mkdirSync(resolve(root, "data"), { recursive: true });
  writeFileSync(resolve(root, "data/store.json"), JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("build-store.mjs")) {
  const out = build();
  console.log(
    `built data/store.json — ${out.accounts.length} accounts, ${out.sources.length} sources, ${out.signals.length} signals, ${out.notes.length} notes`
  );
  for (const a of out.accounts) {
    console.log(`${a.id} ${a.name}: backed ${a.answers.q1.backedTotal} ${a.currency}, declined ${a.answers.q1.declinedTotal}, moves ${a.answers.q3.moves.length}, risks ${a.answers.q4.risks.length}, gaps ${a.answers.q5.gaps.length}`);
  }
}
