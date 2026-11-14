# Data

This folder is the evidence behind the page.

- `raw/` — the MCP responses exactly as returned, one file per call. `lib/analyze.mjs`
  reads the newest file for each tool. No figures are typed in by hand.
- `store.json` — the computed state served at `/api/state` and exported to the hosted
  copy. Regenerate with `npm run build:store`.
- `signals.json` — the latest `get_signals` list, replaced on every live read.
- `notes.json` — local mirror of notes queued or written. Gitignored; notes are personal.

Raw responses include the account records, so treat this folder as customer material.
The only secret is the MCP token, which is never stored here.
