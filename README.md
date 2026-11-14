# The Book

A live CRM for two accounts, built from the Account Quest MCP. It answers the five
questions a manager actually asks on a Monday, and every number on the page links to
the record it came from.

- Account A — Eastern Counties Police Alliance
- Account B — Aldermoor Industrial Group

The page has no build step and no dependencies. Node serves a small API and a static
SPA. The MCP token lives in the server process only.

**Hosted copy:** <https://akr7247.github.io/the-book-crm/> — a read-only snapshot,
rebuilt every ten minutes by a GitHub Action that reads `get_signals` with a repository
secret. The full server below adds the once-a-minute live loop and `write_note` write-back.

## Run it

Requires Node 20 or newer.

```bash
cp .env.example .env      # then put the real MCP token in .env
npm run pull              # one-off pull: whoami, accounts, paperwork, team, signals
npm run build:store       # compute data/store.json from data/raw
npm start                 # http://localhost:3000
```

`npm run pull` is rate-limited by the MCP to one call a minute, so a full pull takes
about seven minutes. It skips anything already stored. `npm start` serves the current
store immediately and starts the live loop on the next minute boundary.

Environment variables:

| Name | Required | What it is |
| --- | --- | --- |
| `MCP_URL` | yes | The MCP endpoint |
| `MCP_TOKEN` | yes | Bearer token. Server-side only. Never exposed to the browser |
| `PORT` | no | Defaults to 3000 |

## What is on the page

Both accounts, switchable in the tab bar, each with:

1. **What is the book worth?** One backed deal per account, the declined offers listed
   separately, and the deals that carry no value shown as *not valued*. A deal counts
   as backed only when a record states the money.
2. **Who holds the power?** For each deal: who decides, who pays, who uses it, who can
   block it. Empty seats say *not identified* instead of guessing.
3. **What do you do first?** Three ranked moves, each with one owner and a due date
   inside the deadline it protects.
4. **What is about to go wrong?** Risks ordered by date, each tied to the record that
   shows it.
5. **What do you still not know?** The gaps the plan rests on, and which record or
   person can fill each one.

Plus a live **What has just landed** strip fed by `get_signals`, and a note composer
that writes back through `write_note`.

## How the numbers are made

All raw MCP responses are stored in `data/raw/` on first pull. `lib/analyze.mjs` reads
them and derives the five answers; nothing is typed in by hand.

- Stated values come from the contract, the deal history, the invoices or the offers.
  Each one carries the record path that states it.
- Derived numbers show their formula. The per-dock rate is annual contract value divided
  by dock count; the value at risk is that rate multiplied by docks that did not fly.
  It is labelled as apportionment, not a stated price.
- Claims are labelled as claims and are not counted in any total.
- Unknown stays unknown. Where no record has a number, the answer says so.

The computed state is written to `data/store.json` and served at `GET /api/state`.

## Live loop

The server makes at most one MCP call a minute.

- A queued `write_note` always goes before a `get_signals` read, so a note is not stuck
  behind the poll.
- Notes posted from the page are accepted immediately, shown as *queued*, and written on
  the next slot. The UI refreshes its local state every 30 seconds and counts down to the
  next call.
- `get_signals` replaces the signal list in `data/signals.json`; the analysis is rebuilt
  on every tick.

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/state` | The full computed page state |
| GET | `/api/health` | Last sync, poll state, queue depth |
| POST | `/api/notes` | Queue a note: `{ text, account, kind, title }` |

## Token handling

- The token is read from `.env` (or `MCP_TOKEN` in the environment) by the server and used
  only in outbound `Authorization` headers. It is never written into HTML, JS,
  `data/store.json` or any API response.
- On the hosted copy the token exists only as a GitHub Actions secret; the browser gets a
  pre-built `state.json`, never a credential.
- `.env` and `data/notes.json` are in `.gitignore`. The repository ships `.env.example`,
  not `.env`.
- `npm run check` fails if the live token value appears in any tracked file.

## Layout

```
server.mjs            HTTP server, static files, API, live loop
lib/mcp.mjs           MCP JSON-RPC client (SSE aware, detects 429)
lib/analyze.mjs       raw records -> five answers, sources and derived calcs
scripts/pull-all.mjs  rate-limited batch pull into data/raw
scripts/build-store.mjs  build data/store.json
scripts/check.mjs     invariants + token-leak check
public/               index.html, styles.css, app.js (no build, no deps)
data/                 store.json, signals.json, notes.json (raw/ is gitignored)
```

## Known limits

- The book totals are shown per currency; GBP and EUR are not converted or added.
- The MCP allows one call a minute, so "live" means up to 60 seconds old.
- `data/raw/` is the evidence set, committed so a clone can rebuild every figure without
  a token. It is customer material; the only secret (the MCP token) is never in it.
- The page is read-only for the account data. Notes are the only write path.
- Usage by force or by plant cannot be computed: the dock-to-site list is not on file.
  That is shown as a gap, not estimated.
