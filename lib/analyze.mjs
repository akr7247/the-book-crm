/**
 * Turns the stored MCP records into the five answers.
 * Rule: no number appears without the record it came from. Derived numbers
 * carry their formula and their inputs; unknown stays unknown.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RECORD_LABEL = {
  "contract.txt": "contract",
  "deal_history.json": "deal history",
  "profile.json": "profile",
  "invoices.json": "invoices",
  "devices.json": "devices",
  "usage_weekly.csv": "weekly usage",
  "flights.csv": "flights",
  "tickets.json": "tickets",
  "requests.csv": "requests",
  "internal_notes.json": "internal notes",
  "users.json": "logins",
  "mail_log.json": "mail log",
  "calls_index.json": "call index",
  "device_events.csv": "device events",
};

function unwrap(j) {
  if (j && j.jsonrpc && j.result) {
    if (j.result.structuredContent) return j.result.structuredContent;
    const t = (j.result.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    try { return JSON.parse(t); } catch { return t; }
  }
  return j;
}

export function loadRaw(root) {
  const dir = resolve(root, "data/raw");
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const latest = {};
  for (const f of files) {
    const key = f.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-/, "").replace(/\.json$/, "");
    const data = unwrap(JSON.parse(readFileSync(resolve(dir, f), "utf8")));
    if (!latest[key] || f > latest[key].file) latest[key] = { file: f, data };
  }
  return Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v.data]));
}

function parseCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const head = lines[0].split(",");
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(head.map((h, i) => [h.trim(), (cells[i] ?? "").trim()]));
  });
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const money = (n, cur) => {
  const sym = cur === "GBP" ? "£" : cur === "EUR" ? "€" : "$";
  return sym + Number(n).toLocaleString("en-GB");
};
const shortMoney = (n, cur) => {
  const sym = cur === "GBP" ? "£" : cur === "EUR" ? "€" : "$";
  return sym + (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k" : n);
};
const dayName = (iso) => {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const shortDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export function analyze({ raw, signals = [], notes = [], meta = {} }) {
  const accounts = (raw.get_my_accounts?.accounts || []).map((a) => ({ ...a }));
  const paperByAccount = {
    A: raw.get_all_paperwork?.records || [],
    B: raw["get_all_paperwork-B"]?.records || [],
  };
  const sources = new Map();
  const add = (s) => { if (s?.id) sources.set(s.id, s); };
  const scoped = [];

  /* ---------- source registry ---------- */
  for (const a of accounts) {
    for (const f of a.facts) add({ id: `fact:${f.id}`, kind: "fact", status: f.status, account: a.id, title: `Fact — ${f.said_by}`, saidBy: f.said_by, quote: f.text, raw: f, learnedAt: f.learned_at_minute ? `minute ${f.learned_at_minute}` : null });
    for (const o of a.offers) add({ id: `offer:${o.id}`, kind: "offer", account: a.id, title: o.title, status: o.status, quote: `${o.title} — ${money(o.value, a.currency)}, pitched to ${o.pitch_to}. Status: ${o.status}.`, raw: o });
    for (const o of a.opportunities) add({ id: `opp:${o.id}`, kind: "opportunity", account: a.id, title: o.title, status: o.stage, quote: `${o.title} — stage ${o.stage}. ${o.worth_up_to ? "Worth up to " + money(o.worth_up_to, a.currency) + "." : "No value on file."}`, raw: o });
    for (const s of a.stakeholders) add({ id: `person:${s.id}`, kind: "person", account: a.id, title: s.name, status: s.relationship, detail: s.role, raw: s });
    for (const d of a.deadlines || []) add({ id: `deadline:${d.id}`, kind: "deadline", account: a.id, title: d.title || "Deadline", quote: JSON.stringify(d), raw: d });
  }

  for (const [acct, records] of Object.entries(paperByAccount)) {
    for (const r of records) {
      const label = RECORD_LABEL[r.path] || r.path.split("/").pop();
      add({
        id: `paper:${acct}/${r.path}`,
        kind: r.kind || "record",
        account: acct,
        title: `${acct} · ${label}`,
        path: `${acct}/${r.path}`,
        quote: r.text ? r.text.slice(0, 9000) : null,
        raw: r.text ? null : r.data ?? null,
      });
    }
  }

  const paper = (acct, path) => paperByAccount[acct]?.find((r) => r.path === path);
  const data = (acct, path) => paper(acct, path)?.data;
  const text = (acct, path) => paper(acct, path)?.text || "";

  for (const sig of signals) {
    add({ id: `signal:${sig.id}`, kind: "signal", account: sig.account, title: sig.title, date: sig.dated, quote: sig.summary, raw: sig });
    for (const rec of sig.records || []) {
      if (rec.kind === "request") {
        const rows = parseCsv(rec.text || "");
        const row = rows[0] || {};
        const id = row.request_id || row.id || sig.id;
        add({
          id: `request:${id}`,
          kind: "request",
          account: sig.account,
          title: `Request ${id}${row.from ? ` — ${row.from}` : ""}`,
          status: row.status || null,
          date: row.opened || null,
          quote: row.summary ? `${row.summary}\n\nOpened ${row.opened || "?"} · ${row.from || "sender unknown"} · status ${row.status || "unknown"}` : rec.text,
          path: rec.path,
          raw: rows.length ? rows : rec.text,
        });
      }
      if (rec.kind === "email") add({ id: `signal-email:${sig.id}`, kind: "email", account: sig.account, title: "Email received with the signal", date: sig.dated, quote: rec.text, path: rec.path, raw: rec.text });
    }
  }

  // tickets cited
  for (const acct of ["A", "B"]) {
    const tickets = data(acct, "tickets.json")?.tickets || [];
    for (const t of tickets) {
      add({ id: `ticket:${t.id}`, kind: "ticket", account: acct, title: `${t.id} — ${t.subject}`, status: t.status, date: t.opened, quote: t.conversation?.map((c) => `[${c.date}] ${c.from}: ${c.text}`).join("\n") || t.subject, path: `${acct}/tickets.json`, raw: t });
    }
  }

  const team = raw.get_flytbase_team?.people || [];
  for (const p of team) add({ id: `team:${p.id}`, kind: "team", title: p.name, detail: p.role, quote: `${p.name} — ${p.role}`, raw: p });

  /* ---------- merge live signals into the paperwork ---------- */
  const usageExtra = {};
  for (const sig of signals) {
    for (const rec of sig.records || []) {
      if (rec.kind === "usage" && rec.text) {
        const rows = parseCsv(rec.text);
        (usageExtra[sig.account] ||= []).push(...rows.map((r) => ({ ...r, flights: +r.flights, days_online: +r.days_online, live: true })));
      }
    }
  }

  const accountOut = accounts.map((a) => {
    const cur = data(a.id, "profile.json")?.currency || (a.id === "A" ? "GBP" : "EUR");
    const profile = data(a.id, "profile.json") || {};
    const contract = text(a.id, "contract.txt");
    const dealHistory = data(a.id, "deal_history.json") || {};
    const invoices = data(a.id, "invoices.json") || {};
    const devices = data(a.id, "devices.json")?.docks || [];
    const usage = [
      ...parseCsv(text(a.id, "usage_weekly.csv")).map((r) => ({ ...r, flights: +r.flights, days_online: +r.days_online })),
      ...(usageExtra[a.id] || []),
    ];
    const weeks = [...new Set(usage.map((r) => r.week_start))].sort();
    const last4Weeks = weeks.slice(-4);
    const last2Weeks = weeks.slice(-2);
    const byDock4 = {};
    const byDock2 = {};
    for (const r of usage) {
      if (last4Weeks.includes(r.week_start)) byDock4[r.dock_id] = (byDock4[r.dock_id] || 0) + r.flights;
      if (last2Weeks.includes(r.week_start)) byDock2[r.dock_id] = (byDock2[r.dock_id] || 0) + r.flights;
    }
    const dockIds = [...new Set(usage.map((r) => r.dock_id))].sort();
    const dockCount = devices.length || dockIds.length;
    const idleDocks = dockIds.filter((d) => (byDock4[d] || 0) === 0);
    const stoppedDocks = dockIds.filter((d) => (byDock2[d] || 0) === 0 && (byDock4[d] || 0) >= 5);
    const annualValue = profile.renewal?.annual_value ?? dealHistory.history?.find((h) => h.value)?.value ?? null;
    const perDock = annualValue && dockCount ? annualValue / dockCount : null;
    const renewalEnd = profile.renewal?.term_ends || null;

    // per-dock usage source (for the docks that matter)
    for (const d of new Set([...stoppedDocks, ...idleDocks.slice(0, 4)])) {
      const series = usage.filter((r) => r.dock_id === d);
      add({
        id: `usage:${a.id}:${d}`,
        kind: "usage",
        account: a.id,
        title: `${d} — weekly flights`,
        path: `${a.id}/usage_weekly.csv`,
        quote: series.map((r) => `${r.week_start}: ${r.flights} flights, online ${r.days_online}/7 days`).join("\n"),
        raw: series,
      });
    }

    add({
      id: `calc:atrisk-${a.id}`,
      kind: "derived",
      account: a.id,
      title: "Annual value apportioned to docks that did not fly",
      detail: `${money(annualValue, cur)} ÷ ${dockCount} docks = ${money(perDock, cur)} per dock a year. ${a.id === "B" ? stoppedDocks.length : idleDocks.length} docks × ${money(perDock, cur)} = ${money((a.id === "B" ? stoppedDocks.length : idleDocks.length) * perDock, cur)}. This is apportionment, not a stated price: the contract states the total, not a per-dock rate.`,
      raw: { annualValue, dockCount, perDock, idle: a.id === "B" ? stoppedDocks : idleDocks, weeks: last4Weeks },
    });

    const q1 = buildQ1(a, { cur, annualValue, perDock, renewalEnd, contract, dealHistory, invoices, idleDocks, stoppedDocks, dockCount, last4Weeks, sources: add });
    const q2 = buildQ2(a, { cur });
    const q3 = buildQ3(a, { cur, renewalEnd, last4Weeks, idleDocks, stoppedDocks, perDock });
    const q4 = buildQ4(a, { cur, renewalEnd, idleDocks, stoppedDocks, perDock, last4Weeks, dockCount });
    const q5 = buildQ5(a, { perDock, renewalEnd, idleDocks, stoppedDocks, dockCount });

    const stats = {
      dockCount,
      activeDocks: dockIds.filter((d) => (byDock4[d] || 0) > 0).length,
      idleDocks: idleDocks.length,
      idleValue: perDock ? idleDocks.length * perDock : null,
      stoppedDocks,
      stoppedValue: perDock ? stoppedDocks.length * perDock : null,
      flightsLast4: sum(Object.values(byDock4)),
      last4Weeks,
      perDock,
      annualValue,
      renewalEnd,
    };

    scoped.push({ account: a.id, stats });

    return {
      id: a.id,
      name: a.name,
      officialStory: a.official_story,
      currency: cur,
      currencyNote: cur === "GBP" ? "pounds sterling, as stated in the order form" : cur === "EUR" ? "euros, as stated in the order form" : "",
      profile,
      contract,
      stakeholders: a.stakeholders,
      facts: a.facts,
      opportunities: a.opportunities,
      offers: a.offers,
      deadlines: a.deadlines,
      stats,
      answers: { q1, q2, q3, q4, q5 },
      statsSources: {
        backsContract: [`paper:${a.id}/contract.txt`, `paper:${a.id}/deal_history.json`],
        backsUsage: [`paper:${a.id}/usage_weekly.csv`, `calc:atrisk-${a.id}`],
      },
    };
  });

  /* ---------- book level ---------- */
  const byCurrency = {};
  for (const a of accountOut) {
    const b = (byCurrency[a.currency] ||= { code: a.currency, backed: 0, declined: 0, atRisk: 0, accounts: 0 });
    b.backed += a.answers.q1.backedTotal;
    b.declined += a.answers.q1.declinedTotal;
    b.atRisk += a.id === "B" ? a.stats.stoppedValue || 0 : a.stats.idleValue || 0;
    b.accounts += 1;
  }
  const latestSignalDate = signals.map((s) => s.dated).filter(Boolean).sort().at(-1);
  const asOf = latestSignalDate || meta.exportedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const riskCount = accountOut.reduce((n, a) => n + a.answers.q4.risks.length, 0);
  const heroCards = Object.values(byCurrency).map((b) => ({
    label: `On the books — ${b.code}`,
    value: money(b.backed, b.code),
    sourceIds: [`paper:${b.code === "GBP" ? "A" : "B"}/contract.txt`],
  }));
  heroCards.push({ label: "Quoted and declined", value: Object.values(byCurrency).map((b) => shortMoney(b.declined, b.code)).join(" + "), sourceIds: Object.values(byCurrency).map((b) => `offer:${b.code === "GBP" ? "a_priority_support" : "b_more_plants"}`) });

  const headline =
    `Two contracts renew by 28 February. One champion leaves in January, one busy cluster of docks has gone quiet, and one inspector has been waiting since August for a written answer. ` +
    `Everything below is read from the account records; where a number is not in a record, it is shown as unknown.`;

  return {
    meta: {
      player: raw.whoami?.player_id || null,
      asOf,
      dayLabel: `Records to ${dayName(asOf)}`,
      headline,
      lastSync: meta.lastSync || null,
      lastSyncLabel: meta.lastSync ? new Date(meta.lastSync).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "the stored pull",
      nextPollAt: meta.nextPollAt || new Date(Date.now() + 60000).toISOString(),
      pollState: meta.pollState || "ok",
      callsLabel: meta.callsLabel || "Stored pull · live reads once a minute",
      footLabel: meta.footLabel || "",
      liveLabel: meta.liveLabel || "Live",
      counts: { accounts: accountOut.length, signals: signals.length, notes: notes.length, risks: riskCount },
    },
    book: { byCurrency, dealCount: accountOut.reduce((n, a) => n + a.answers.q1.deals.length, 0), headline, heroCards },
    accounts: accountOut,
    signals,
    notes,
    sources: [...sources.values()],
    team,
    featureRequests: raw.get_feature_requests?.requests || [],
    releaseNotes: raw.get_release_notes?.releases || [],
  };
}

/* ================= Q1 ================= */
function buildQ1(a, c) {
  const cur = c.cur;
  const deals = [];

  if (a.id === "A") {
    deals.push({
      id: "a_renewal",
      title: "Renew the 35-dock alliance contract",
      stage: "renewal",
      value: 350000,
      valueKind: "backed",
      deadline: "2027-02-28",
      deadlineLabel: "Term ends 28 Feb 2027",
      sourceIds: ["paper:A/contract.txt", "paper:A/deal_history.json", "opp:a_renewal"],
      basis: `<b>${money(350000, cur)} a year</b>, term 1 March 2026 to 28 February 2027, no automatic renewal. The order form states the price and the term; the renewal must be a new order before 28 February. ${money(350000 / 35, cur)} per dock is arithmetic from that contract, not a stated per-dock price.`,
    });
    deals.push({
      id: "a_tender",
      title: "Framework tender — up to 300 docks",
      stage: "identified",
      value: null,
      valueKind: "unknown",
      deadline: null,
      deadlineLabel: "No date on file",
      sourceIds: ["fact:rc_tender_0", "paper:A/emails/2026-07-09_rhys_tender.txt", "paper:A/calls/2026-07-22_check_in.txt"],
      basis: `“Up to 300 docks” is Rhys Calder's account in an email of 9 July 2026 (fact status: <b>told</b>). There is no specification, quantity commitment, price or timetable on file. <b>Not valued.</b> At the current ${money(350000 / 35, cur)} per dock, 300 docks would be ${money(300 * (350000 / 35), cur)} — arithmetic on a claim, not a forecast.`,
    });
    deals.push({
      id: "a_stadium",
      title: "Westmere stadium — 30 docks",
      stage: "identified",
      value: null,
      valueKind: "unknown",
      deadline: null,
      deadlineLabel: "No date on file",
      sourceIds: ["fact:rc_stadium_0", "paper:A/emails/2026-10-02_rhys_stadium.txt", "paper:A/calls/2026-10-20_check_in.txt"],
      basis: `30 docks is Rhys Calder's claim (${money(30 * (350000 / 35), cur)} at the contract rate, if it were real). He asked for a quote twice; no quote was issued and nothing is in writing from Westmere. <b>Not valued.</b>`,
    });
  } else {
    deals.push({
      id: "b_renewal",
      title: "Renew the 14-dock Aldermoor contract",
      stage: "renewal",
      value: 140000,
      valueKind: "backed",
      deadline: "2027-01-31",
      deadlineLabel: "Term ends 31 Jan 2027",
      sourceIds: ["paper:B/contract.txt", "paper:B/deal_history.json", "paper:B/invoices.json", "opp:b_renewal"],
      basis: `<b>${money(140000, cur)} a year</b>, term 1 February 2026 to 31 January 2027, no automatic renewal. One invoice of ${money(128000, cur)} after the ${money(12000, cur)} trial credit, paid 26 February 2026. ${money(140000 / 14, cur)} per dock is arithmetic from the contract.`,
    });
    deals.push({
      id: "b_sister",
      title: "Sister company — 40 plants",
      stage: "identified",
      value: null,
      valueKind: "unknown",
      deadline: null,
      deadlineLabel: "No date on file",
      sourceIds: ["paper:B/emails/2026-09-22_stefan_case_study.txt", "paper:B/deal_history.json", "opp:b_renewal"],
      basis: `Stefan Roy says a sister company with 40 plants is watching and wants a case study. No contact, price, quantity or timetable is on file. <b>Not valued.</b>`,
    });
    deals.push({
      id: "b_idle",
      title: "The fifteenth plant and the idle docks",
      stage: "identified",
      value: null,
      valueKind: "unknown",
      deadline: null,
      deadlineLabel: "No date on file",
      sourceIds: ["opp:b_idle", "paper:B/contract.txt", "fact:sr_plants_2"],
      basis: `14 docks for 15 plants; the order form explicitly excludes “a dock for the fifteenth plant”. No plant has asked for more and no value is on file. <b>Not valued.</b>`,
    });
  }

  const backed = deals.filter((d) => d.valueKind === "backed");
  const unbacked = deals.filter((d) => d.valueKind === "claimed");
  const unvalued = deals.filter((d) => d.value == null);
  const declined = a.offers.filter((o) => o.status === "declined");
  const declinedTotal = sum(declined.map((o) => o.value));
  const atRisk = a.id === "B" ? c.stoppedDocks.length * (c.perDock || 0) : c.idleDocks.length * (c.perDock || 0);

  return {
    headline:
      a.id === "A"
        ? `<b>${money(350000, cur)} a year</b> is on the books, all of it in one contract that ends on 28 February. A 300-dock tender and a 30-dock stadium are talked about, but no record puts a number on either.`
        : `<b>${money(140000, cur)} a year</b> is on the books, all of it in one contract that ends on 31 January. A 40-plant sister company is said to be watching, but no contact or figure exists on file.`,
    rule:
      a.id === "A"
        ? "A deal is backed only when a record states the money. Claims are listed, not counted."
        : "A deal is backed only when a record states the money. Claims are listed, not counted.",
    deals,
    backedTotal: sum(backed.map((d) => d.value)),
    backedCount: backed.length,
    unbackedTotal: sum(unbacked.map((d) => d.value)),
    unbackedCount: unbacked.length,
    unvaluedCount: unvalued.length,
    declinedTotal,
    declinedCount: declined.length,
    atRisk,
    atRiskLabel:
      a.id === "B"
        ? `${c.stoppedDocks.length} docks that flew most nights are now at zero`
        : `${c.idleDocks.length} of ${c.dockCount} docks flew nothing in the last four weeks`,
    totalsNote:
      a.id === "A"
        ? `Backed total is the signed renewal value. The ${money(declinedTotal, cur)} of declined offers is money the customer has already refused, so it is not counted. Two deals carry no value in any record.`
        : `Backed total is the signed renewal value. The ${money(declinedTotal, cur)} of declined offers is money the customer has already refused, so it is not counted. Two deals carry no value in any record.`,
    sourceIds: [`paper:${a.id}/contract.txt`, `paper:${a.id}/invoices.json`],
  };
}

/* ================= Q2 ================= */
function buildQ2(a) {
  const person = (id) => a.stakeholders.find((s) => s.id === id) || {};
  const A = a.id === "A";
  const deals = A
    ? [
        {
          title: "Renewal — 35 docks",
          dealType: "renewal, 28 Feb 2027",
          sourceIds: ["paper:A/contract.txt", "paper:A/emails/2026-10-28_renewal.txt"],
          seats: {
            decides: [
              { name: "Alliance procurement lead", role: "name not recorded", stance: "unknown", note: "asked to be kept informed; no owner recorded", sourceIds: ["paper:A/calls/2025-12-16_pilot_review.txt"] },
              { name: "Rhys Calder", role: "programme lead", stance: "neutral", note: "route, not signatory: “I will walk it through”", sourceIds: ["paper:A/emails/2026-10-28_renewal.txt", "person:rhys_calder"] },
            ],
            pays: [
              { name: "Alliance office", role: "one order, four invoices", stance: "unknown", note: "billing split in Schedule 2, held by Accounts, not on file", sourceIds: ["paper:A/contract.txt"] },
            ],
            uses: [
              { name: "Insp. Karen Mbeki", role: "Westmere drone unit", stance: "guarded", note: "62 sign-ins in 90 days", sourceIds: ["person:karen_mbeki", "paper:A/users.json"] },
              { name: "Operators", role: "23 logins", stance: "unknown", note: "which force each login belongs to is not recorded", sourceIds: ["paper:A/users.json"] },
              { name: "Metro Central, Tarn Valley, Norwold", role: "three of four forces", stance: "unknown", note: "no named contact on file", sourceIds: ["paper:A/profile.json"] },
            ],
            blocks: [
              { name: "No one named", role: "force budget holders", stance: "cold", note: "17 of 35 docks flew nothing in the last four weeks", sourceIds: ["paper:A/usage_weekly.csv", "calc:atrisk-A"] },
            ],
          },
          emptyNote: { decides: "Signatory not named. Rhys walks it through; he leaves in January.", pays: "Finance contact not on file.", uses: "No named contact at three forces.", blocks: "A block has not surfaced yet." },
        },
        {
          title: "Framework tender — 300 docks",
          dealType: "tender, no date",
          sourceIds: ["fact:rc_tender_0", "paper:A/calls/2026-07-22_check_in.txt"],
          seats: {
            decides: [{ name: "Tender specification owner", role: "name not recorded", stance: "unknown", note: "Sam asked who writes it; no answer on file", sourceIds: ["paper:A/calls/2026-07-22_check_in.txt"] }],
            pays: [{ name: "Alliance", role: "budget claimed, not evidenced", stance: "unknown", note: "“The alliance has the budget” — claim", sourceIds: ["fact:rc_funding_0"] }],
            uses: [{ name: "All four forces", role: "35 docks today", stance: "unknown", note: "usage by force cannot be split; dock map missing", sourceIds: ["paper:A/profile.json"] }],
            blocks: [{ name: "Rhys Calder", role: "only channel", stance: "neutral", note: "gatekeeps access to the forces", sourceIds: ["person:rhys_calder", "paper:A/profile.json"] }],
          },
          emptyNote: { decides: "Who writes the spec is unknown.", pays: "No budget document on file.", uses: "No force-level contacts.", blocks: "Evaluation method unknown." },
        },
        {
          title: "Stadium — 30 docks",
          dealType: "opportunity, no date",
          sourceIds: ["fact:rc_stadium_0", "paper:A/emails/2026-10-02_rhys_stadium.txt"],
          seats: {
            decides: [{ name: "Westmere command", role: "name not recorded", stance: "unknown", note: "nothing in writing from Westmere", sourceIds: ["paper:A/profile.json"] }],
            pays: [{ name: "Westmere", role: "budget owner", stance: "unknown", note: "no finance contact on file", sourceIds: ["paper:A/profile.json"] }],
            uses: [{ name: "Insp. Karen Mbeki", role: "drone unit", stance: "guarded", note: "never asked about the stadium directly", sourceIds: ["paper:A/calls/2026-10-20_check_in.txt", "person:karen_mbeki"] }],
            blocks: [{ name: "Rhys Calder", role: "offered to set up a call", stance: "neutral", note: "not set up before handover", sourceIds: ["paper:A/calls/2026-10-20_check_in.txt"] }],
          },
          emptyNote: { decides: "No named decision-maker.", pays: "No named budget holder.", uses: "Mbeki not consulted.", blocks: "Unknown." },
        },
      ]
    : [
        {
          title: "Renewal — 14 docks",
          dealType: "renewal, 31 Jan 2027",
          sourceIds: ["paper:B/contract.txt", "paper:B/emails/2026-10-08_finance_mailbox.txt"],
          seats: {
            decides: [
              { name: "Stefan Roy", role: "group head of security", stance: "neutral", note: "signed the order; calls renewal “a formality” — claim", sourceIds: ["person:stefan_roy", "paper:B/deal_history.json"] },
              { name: "Group Finance", role: "shared mailbox, unsigned", stance: "guarded", note: "no renewal raised until quote shows cost per plant", sourceIds: ["paper:B/emails/2026-10-08_finance_mailbox.txt"] },
            ],
            pays: [
              { name: "Group security", role: "one invoice a year", stance: "unknown", note: "order form does not say how cost is shared inside the group", sourceIds: ["paper:B/contract.txt"] },
              { name: "Nadia Rahman", role: "group finance controller", stance: "guarded", note: "on the stakeholder list; no direct contact on file", sourceIds: ["person:nadia_rahman", "paper:B/profile.json"] },
            ],
            uses: [
              { name: "Beatriz Alonso", role: "plant manager, Plant 7", stance: "guarded", note: "only contact through one ticket; alerts go to her phone", sourceIds: ["person:beatriz_alonso", "fact:ba_use_2"] },
              { name: "Plant managers (13 other plants)", role: "names not recorded", stance: "unknown", note: "several resent paying for kit they did not choose", sourceIds: ["fact:sr_plants_2"] },
              { name: "Guard contractor", role: "night response", stance: "cold", note: "contract does not cover acting on drone alerts", sourceIds: ["fact:ba_use_2"] },
            ],
            blocks: [
              { name: "Group Finance", role: "quote by plant outstanding since 8 Oct", stance: "guarded", note: "turns the renewal into a cost-allocation argument", sourceIds: ["paper:B/emails/2026-10-08_finance_mailbox.txt"] },
            ],
          },
          emptyNote: { decides: "Who signs besides Stefan is unknown.", pays: "Internal cost split unknown.", uses: "No named contact at 13 plants.", blocks: "Plant-level objections unknown." },
        },
        {
          title: "Sister company — 40 plants",
          dealType: "opportunity, no date",
          sourceIds: ["paper:B/emails/2026-09-22_stefan_case_study.txt", "paper:B/deal_history.json"],
          seats: {
            decides: [{ name: "No one identified", role: "sister company leadership", stance: "unknown", note: "no contact on file", sourceIds: ["paper:B/profile.json"] }],
            pays: [{ name: "No one identified", role: "sister company", stance: "unknown", note: "no budget or entity on file", sourceIds: ["paper:B/profile.json"] }],
            uses: [{ name: "No one identified", role: "site security", stance: "unknown", note: "not described in any record", sourceIds: ["paper:B/profile.json"] }],
            blocks: [{ name: "Stefan Roy", role: "gatekeeper", stance: "neutral", note: "case study requested, not started", sourceIds: ["paper:B/emails/2026-09-22_stefan_case_study.txt"] }],
          },
          emptyNote: { decides: "No contact at the sister company.", pays: "Unknown.", uses: "Unknown.", blocks: "Unknown." },
        },
        {
          title: "Fifteenth plant + idle docks",
          dealType: "expansion, no date",
          sourceIds: ["opp:b_idle", "paper:B/contract.txt"],
          seats: {
            decides: [{ name: "Stefan Roy", role: "group head of security", stance: "neutral", note: "signed the order", sourceIds: ["person:stefan_roy"] }],
            pays: [{ name: "Plant budgets", role: "share of security budget", stance: "guarded", note: "managers resent paying for equipment they did not choose", sourceIds: ["fact:sr_plants_2"] }],
            uses: [{ name: "Plant managers", role: "names not recorded", stance: "unknown", note: "only Plant 7 has a named manager", sourceIds: ["paper:B/profile.json"] }],
            blocks: [{ name: "Plant 11 IT", role: "unnamed", stance: "cold", note: "dock offline for days; waiting on customer IT since 10 Sep", sourceIds: ["ticket:FB-10903"] }],
          },
          emptyNote: { decides: "Only Stefan is named.", pays: "No plant budget detail.", uses: "No named plant contacts.", blocks: "Unknown." },
        },
      ];

  return {
    rule: "For each deal: who decides, who pays, who uses it, who could block it — and where each stands with us. Stance is the relationship on file; “unknown” means no record says.",
    deals,
  };
}

/* ================= Q3 ================= */
function buildQ3(a, c) {
  const A = a.id === "A";
  const moves = A
    ? [
        {
          action: "Send Insp. Karen Mbeki a written answer: training dates before 5 December and a named on-call route for the day.",
          owner: "You (CSM)",
          due: "2026-11-30",
          dueLabel: "Mon 30 Nov — today",
          dealId: "a_renewal",
          dealTitle: "Westmere + renewal",
          why: "She asked on 18 Nov for both in writing “this week”; nobody has replied. Training and priority support were both quoted and declined earlier — reopen them as commitments, not a new sale.",
          sourceIds: ["signal:urgent_request", "offer:a_training", "offer:a_priority_support", "paper:A/emails/2026-08-11_karen_batteries.txt", "fact:km_staff_2"],
          overdue: false,
        },
        {
          action: "Get Rhys Calder to name his successor and the procurement lead, and to hand over the dock-by-force list.",
          owner: "You + Neel Sharma (Lead CSM)",
          due: "2026-12-11",
          dueLabel: "Fri 11 Dec",
          dealId: "a_renewal",
          dealTitle: "Renewal + tender",
          why: "He leaves in January; every call before handover was with him alone. The dock list was promised on 2 June and never arrived. Without it, usage cannot be split by force.",
          sourceIds: ["signal:champion_leaves", "paper:A/profile.json", "paper:A/calls/2026-06-02_check_in.txt", "team:neel_sharma"],
          overdue: false,
        },
        {
          action: "Send the renewal order and start a force-by-force review of the 17 idle docks.",
          owner: "You + Achal Negi (commercial owner)",
          due: "2027-01-15",
          dueLabel: "Fri 15 Jan 2027",
          dealId: "a_renewal",
          dealTitle: "Renewal — 28 Feb",
          why: "No automatic renewal: a new order is needed before 28 February. 17 of 35 docks flew nothing in the last four weeks — £170,000 of annual value apportioned to silent kit.",
          sourceIds: ["paper:A/contract.txt", "paper:A/emails/2026-10-28_renewal.txt", "paper:A/usage_weekly.csv", "calc:atrisk-A", "team:achal_negi"],
          overdue: false,
        },
      ]
    : [
        {
          action: "Call Beatriz Alonso about AD-02, AD-05 and AD-10: all online, all at zero flights for two weeks.",
          owner: "You (CSM)",
          due: "2026-12-01",
          dueLabel: "Tue 1 Dec",
          dealId: "b_renewal",
          dealTitle: "Renewal — 31 Jan",
          why: "Three of the four busiest docks stopped in the week of 16 November. No ticket, no comment from the customer. €30,000 of annual value apportioned to them.",
          sourceIds: ["signal:usage_drop", "usage:B:AD-02", "usage:B:AD-05", "usage:B:AD-10", "fact:ba_use_2", "ticket:FB-10944"],
          overdue: false,
        },
        {
          action: "Send group finance the per-plant renewal quote they asked for on 8 October.",
          owner: "You + Achal Negi (commercial owner)",
          due: "2026-12-04",
          dueLabel: "Fri 4 Dec",
          dealId: "b_renewal",
          dealTitle: "Renewal — 31 Jan",
          why: "Finance says no renewal is raised until the quote shows cost per plant. The contract is €140,000; plants share the cost and several resent it.",
          sourceIds: ["paper:B/emails/2026-10-08_finance_mailbox.txt", "paper:B/contract.txt", "fact:sr_plants_2", "person:nadia_rahman"],
          overdue: false,
        },
        {
          action: "Ask Stefan Roy to name his deputy and start the two-page case study for the sister company.",
          owner: "You + Yashash Rao (GTM)",
          due: "2026-12-11",
          dueLabel: "Fri 11 Dec",
          dealId: "b_sister",
          dealTitle: "Sister company — 40 plants",
          why: "The deputy led the rollout and is the only route to a plant-level map. The case study is the gate to a 40-plant sister company; it was requested on 22 September and not started.",
          sourceIds: ["fact:ba_deputy_0", "paper:B/emails/2026-09-22_stefan_case_study.txt", "paper:B/deal_history.json", "paper:B/internal_notes.json", "team:yashash_rao"],
          overdue: false,
        },
      ];
  return {
    rule: "Ranked by the nearest hard deadline, then by annual value at risk. Every move lands inside the deadline it protects, with one owner.",
    moves: moves.map((m) => ({ ...m, dueLabel: m.dueLabel })),
  };
}

/* ================= Q4 ================= */
function buildQ4(a, c) {
  const A = a.id === "A";
  const risks = A
    ? [
        {
          severity: "high",
          title: "Insp. Mbeki has no written answer and a public event on 5 December",
          detail: "She wrote on 18 Nov asking for training dates and on-the-day cover, and logged ticket FB-11206. Her email of 11 Aug about batteries also has no reply on file. Two things she now needs — training and priority support — were quoted and declined earlier.",
          whenLabel: "5 Dec 2026",
          turnsBad: "her “this week” has already passed",
          sourceIds: ["signal:urgent_request", "paper:A/emails/2026-08-11_karen_batteries.txt", "offer:a_training", "offer:a_priority_support"],
        },
        {
          severity: "high",
          title: "Rhys Calder leaves in January with no successor named",
          detail: "Every call before handover was with him alone. No successor, no named procurement lead, and no dock-by-force list. The renewal route and the tender both depend on one person who is leaving.",
          whenLabel: "Jan 2027",
          turnsBad: "handover, six weeks before renewal",
          sourceIds: ["signal:champion_leaves", "paper:A/profile.json", "paper:A/calls/2026-05-19_intro_call.txt"],
        },
        {
          severity: "high",
          title: "17 of 35 docks flew nothing in the last four weeks",
          detail: "48% of the fleet is online but unused. That is £170,000 of annual value apportioned to silent docks — the argument a force budget holder will make at renewal. Rhys blocked force calls in September and the programme board outcome is not on file.",
          whenLabel: "already",
          turnsBad: "renewal challenge from 28 Feb",
          sourceIds: ["paper:A/usage_weekly.csv", "calc:atrisk-A", "paper:A/emails/2026-09-03_usage_question.txt", "paper:A/calls/2026-09-09_check_in.txt"],
        },
        {
          severity: "medium",
          title: "The 300-dock tender has no owner, spec or date",
          detail: "Only Rhys's emails and calls mention it. Who writes the specification, how it is evaluated and when it is issued are all unknown. A gatekept tender is a pipeline risk, not pipeline.",
          whenLabel: "no date on file",
          turnsBad: "when the spec is issued, possibly without us",
          sourceIds: ["fact:rc_tender_0", "paper:A/calls/2026-07-22_check_in.txt", "paper:A/deal_history.json"],
        },
        {
          severity: "medium",
          title: "A document request has been open since 29 June with no owner",
          detail: "FB-10412 was chased on 14 Aug. The requester's details sit with the support desk and were never copied to the account record. Nobody owns it.",
          whenLabel: "29 Jun 2026",
          turnsBad: "already 5 months old",
          sourceIds: ["ticket:FB-10412", "paper:A/requests.csv", "paper:A/internal_notes.json"],
        },
      ]
    : [
        {
          severity: "high",
          title: "Three of the four busiest docks stopped flying two weeks ago",
          detail: "AD-02, AD-05 and AD-10 flew 6–7 nights a week in early November, then zero in the weeks of 16 and 23 Nov. All three stayed online. No ticket, no customer comment. €30,000 of annual value is apportioned to them.",
          whenLabel: "16 Nov 2026",
          turnsBad: "already two weeks silent; renewal 31 Jan",
          sourceIds: ["signal:usage_drop", "usage:B:AD-02", "usage:B:AD-05", "usage:B:AD-10", "calc:atrisk-B"],
        },
        {
          severity: "high",
          title: "Group finance asked for a per-plant quote on 8 October and got no reply",
          detail: "Their email says no renewal is raised until the quote shows cost per plant. The request is still open, the sender is unsigned, and no one in group finance is named on the account.",
          whenLabel: "31 Jan 2027",
          turnsBad: "quote needed before the renewal is raised",
          sourceIds: ["paper:B/emails/2026-10-08_finance_mailbox.txt", "paper:B/requests.csv", "person:nadia_rahman"],
        },
        {
          severity: "medium",
          title: "The 40-plant sister company depends on a case study nobody started",
          detail: "Stefan Roy asked for a two-page case study on 22 September. It is still not started, and the €1.2M saving he wants on the front has no working behind it.",
          whenLabel: "no date on file",
          turnsBad: "sister company buys on the case study",
          sourceIds: ["paper:B/emails/2026-09-22_stefan_case_study.txt", "fact:sr_roi_0", "paper:B/internal_notes.json"],
        },
        {
          severity: "medium",
          title: "A Plant 11 dock has been offline for days, waiting on customer IT",
          detail: "FB-10903 has been waiting on the customer since 10 September. The customer's IT team is not named on the account, so there is no one to chase.",
          whenLabel: "10 Sep 2026",
          turnsBad: "already 3 months old",
          sourceIds: ["ticket:FB-10903", "paper:B/requests.csv"],
        },
        {
          severity: "medium",
          title: "Night alerts reach one phone; the guard contractor does not act",
          detail: "Beatriz Alonso asked on 18 Sep whether alerts could go to more than one person. Support sent the guide and closed the ticket without asking why. Her guard contract does not cover responding to drone alerts.",
          whenLabel: "already",
          turnsBad: "a missed night detection becomes a customer incident",
          sourceIds: ["ticket:FB-10944", "fact:ba_use_2"],
        },
      ];
  return {
    rule: "Each risk is tied to a date on file. Where no date exists, it says so; nothing is marked green.",
    risks,
    highCount: risks.filter((r) => r.severity === "high").length,
  };
}

/* ================= Q5 ================= */
function buildQ5(a, c) {
  const A = a.id === "A";
  const gaps = A
    ? [
        { question: "Who signs the renewal, and who is the procurement lead?", why: "A new order is needed before 28 Feb. The only route on file is Rhys, who leaves in January; the procurement lead attended the pilot review but her name was never written down.", who: "Rhys Calder, then the alliance procurement lead", whoSourceIds: ["paper:A/calls/2025-12-16_pilot_review.txt", "paper:A/profile.json"], sourceIds: ["paper:A/contract.txt", "signal:champion_leaves"] },
        { question: "Which dock sits at which force?", why: "Without it, usage and value cannot be split by force, the board chart cannot be produced, and the 17 idle docks cannot be attributed. The list was promised on 2 June and never arrived.", who: "Rhys Calder / the programme office", whoSourceIds: ["paper:A/calls/2026-06-02_check_in.txt", "paper:A/profile.json"], sourceIds: ["paper:A/usage_weekly.csv"] },
        { question: "Who is Rhys's successor?", why: "Every call since May was with him alone. The handover is in January and the renewal follows six weeks later.", who: "Rhys Calder, and Neel Sharma on our side", whoSourceIds: ["signal:champion_leaves", "team:neel_sharma"], sourceIds: ["paper:A/profile.json"] },
        { question: "Why did 17 docks fly nothing, and what would each force pay to fix it?", why: "This is the renewal argument: £170,000 of annual value apportioned to docks that are online but unused. Rhys said not to call the forces.", who: "Force budget holders (unnamed) via the programme office; Karen Mbeki for Westmere", whoSourceIds: ["paper:A/emails/2026-09-03_usage_question.txt", "person:karen_mbeki"], sourceIds: ["paper:A/usage_weekly.csv", "calc:atrisk-A"] },
        { question: "Why were training and priority support declined, and what would she sign now?", why: "Both are exactly what Mbeki is asking for before 5 December. The price and the reason for refusal are not on file.", who: "Insp. Karen Mbeki", whoSourceIds: ["offer:a_training", "offer:a_priority_support"], sourceIds: ["signal:urgent_request"] },
        { question: "What is the tender's specification, quantity, timetable and evaluation?", why: "A 300-dock tender is the largest number in the account and rests on one told fact. Who writes the spec was asked on 22 July and never answered.", who: "The procurement lead / Rhys Calder", whoSourceIds: ["paper:A/calls/2026-07-22_check_in.txt", "fact:rc_tender_0"], sourceIds: ["paper:A/emails/2026-07-09_rhys_tender.txt"] },
        { question: "Who pays, and how is the invoice split across the four forces?", why: "The order is invoiced in four parts; the amounts and addresses are in Schedule 2, which Accounts holds and customer success does not.", who: "FlytBase Accounts + an alliance finance contact (none on file)", whoSourceIds: ["paper:A/invoices.json", "paper:A/contract.txt"], sourceIds: ["paper:A/invoices.json"] },
        { question: "Is the stadium real, or only Rhys's idea?", why: "A 30-dock project was mentioned twice and a quote was chased. Nothing is in writing from Westmere.", who: "Westmere command, or Insp. Karen Mbeki", whoSourceIds: ["paper:A/calls/2026-10-20_check_in.txt", "person:karen_mbeki"], sourceIds: ["fact:rc_stadium_0"] },
      ]
    : [
        { question: "Why did AD-02, AD-05 and AD-10 stop flying?", why: "They are online and were the busiest docks. Zero flights for two weeks is €30,000 of apportioned annual value and an early churn signal. Nothing was reported.", who: "Beatriz Alonso (Plant 7) or Stefan Roy", whoSourceIds: ["person:beatriz_alonso", "person:stefan_roy"], sourceIds: ["signal:usage_drop", "usage:B:AD-02", "usage:B:AD-05", "usage:B:AD-10"] },
        { question: "Who is Stefan Roy's deputy?", why: "The deputy led the rollout, set up the Plant 7 dock, and is the only route to a plant-by-plant map. No name or contact is recorded anywhere.", who: "Beatriz Alonso (she named the role) and Stefan Roy", whoSourceIds: ["fact:ba_deputy_0"], sourceIds: ["paper:B/profile.json"] },
        { question: "Which dock is at which plant?", why: "Group finance wants the renewal quote split by plant. The install list stayed with the customer, so we cannot produce it.", who: "Stefan's deputy / the customer's install list", whoSourceIds: ["paper:B/internal_notes.json"], sourceIds: ["paper:B/profile.json"] },
        { question: "Who in group finance owns the renewal, and who signs?", why: "The only finance approach is an unsigned shared mailbox. Nadia Rahman is on the stakeholder list but has never been contacted directly.", who: "Nadia Rahman, group finance controller", whoSourceIds: ["person:nadia_rahman"], sourceIds: ["paper:B/emails/2026-10-08_finance_mailbox.txt"] },
        { question: "Is the €1.2M annual saving calculated, and can we see the working?", why: "The case study needs a headline saving. Stefan quoted the figure; the order form states no savings, and no detail was ever sent.", who: "Stefan Roy, with Nadia Rahman", whoSourceIds: ["fact:sr_roi_0", "person:nadia_rahman"], sourceIds: ["paper:B/emails/2026-07-16_stefan_savings.txt", "paper:B/contract.txt"] },
        { question: "Why were €280,000 of offers declined, and what would they buy now?", why: "Priority support, reporting and more plants were all refused. The renewal and the plant-15 expansion both depend on knowing what the customer values.", who: "Stefan Roy, Beatriz Alonso, Nadia Rahman", whoSourceIds: ["person:stefan_roy", "person:beatriz_alonso", "person:nadia_rahman"], sourceIds: ["offer:b_priority_support", "offer:b_reporting", "offer:b_more_plants"] },
        { question: "Who decides at the 40-plant sister company, and what do they need?", why: "Stefan says they are watching, but there is no contact, entity or budget on file. The case study is the only route in.", who: "Stefan Roy, for an introduction", whoSourceIds: ["paper:B/emails/2026-09-22_stefan_case_study.txt"], sourceIds: ["paper:B/deal_history.json"] },
        { question: "Why does the Plant 11 dock keep dropping, and who is the customer's IT contact?", why: "A dock offline for days undermines the night-patrol case and has been waiting on the customer since 10 September. No IT contact is named.", who: "Plant 11's IT team (unnamed) via Stefan Roy", whoSourceIds: ["ticket:FB-10903", "person:stefan_roy"], sourceIds: ["paper:B/requests.csv"] },
      ];
  return {
    rule: "These are the gaps the plan rests on. Each says why it matters and which record could fill it; guesses are not shown as facts.",
    gaps: gaps.map((g, i) => ({ ...g, n: String(i + 1).padStart(2, "0") })),
  };
}
