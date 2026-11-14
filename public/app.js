/* The Book — a live CRM view. Renders what /api/state computes; every figure carries source ids. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = null;
let account = new URLSearchParams(location.search).get("account") || "A";
let srcIndex = new Map();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function money(v, cur) {
  if (v == null || Number.isNaN(v)) return "—";
  const sym = cur === "GBP" ? "£" : cur === "EUR" ? "€" : cur === "USD" ? "$" : "";
  const n = Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + "k" : String(v);
  return `${sym}${n}`;
}
function fullMoney(v, cur) {
  if (v == null) return "—";
  const sym = cur === "GBP" ? "£" : cur === "EUR" ? "€" : cur === "USD" ? "$" : "";
  return sym + v.toLocaleString("en-GB");
}

function cite(id, label) {
  const s = srcIndex.get(id);
  const kind = s?.kind || "record";
  const cls = kind === "fact" && s?.status === "claim" ? "src claim" : kind === "gap" ? "src unbacked" : "src";
  return `<button type="button" class="${cls}" data-src="${esc(id)}" title="${esc(id)}${s?.title ? " — " + esc(s.title) : ""}">${esc(label || labelFor(id, s))}</button>`;
}
function labelFor(id, s) {
  if (s?.kind === "derived" || id.startsWith("calc:")) return "calc";
  if (id.startsWith("paper:")) {
    const p = id.slice(6);
    let file = p.split("/").pop().replace(/\.(txt|json|csv)$/i, "");
    file = file.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/_/g, " ");
    if (file.length > 22) file = file.slice(0, 21) + "…";
    return `${p.split("/")[0]}·${file}`;
  }
  if (id.startsWith("fact:")) return id.slice(5);
  if (id.startsWith("offer:")) return id.slice(6);
  if (id.startsWith("opp:")) return id.slice(4);
  if (id.startsWith("signal-")) return "email";
  if (id.startsWith("signal:")) return "signal·" + id.slice(7);
  if (id.startsWith("usage:")) return id.split(":").pop();
  if (id.startsWith("person:")) return s?.title || id.slice(7);
  if (id.startsWith("ticket:")) return id.slice(7);
  if (id.startsWith("team:")) return s?.title || id.slice(5);
  if (id.startsWith("request:")) return "request";
  return id;
}
function cites(ids, label = "") {
  if (!ids?.length) return "";
  return `<span class="srclabel">${esc(label)}</span><span class="srclist">${ids.map((id) => cite(id)).join("")}</span>`;
}

function statusPill(stance) {
  const s = String(stance || "unknown").toLowerCase();
  const cls = ["guarded", "neutral", "strong", "cold"].includes(s) ? s : "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

function renderTabs() {
  const bar = $("#accountbar");
  const accts = state.accounts;
  const tabs = [{ id: "A", name: accts.find((a) => a.id === "A")?.name || "Account A" }, { id: "B", name: accts.find((a) => a.id === "B")?.name || "Account B" }];
  if (accts.length > 2) tabs.push(...accts.slice(2).map((a) => ({ id: a.id, name: a.name })));
  bar.innerHTML =
    `<button data-acct="ALL" aria-selected="${account === "ALL"}" role="tab"><b>Both accounts</b></button>` +
    tabs.map((t) => {
      const a = accts.find((x) => x.id === t.id);
      const risks = a?.answers?.q4?.risks?.filter((r) => r.severity === "high").length || 0;
      return `<button data-acct="${esc(t.id)}" aria-selected="${account === t.id}" role="tab"><b>${esc(t.id)}</b> · ${esc(t.name)}${risks ? `<span class="flag">${risks} urgent</span>` : ""}</button>`;
    }).join("");
  $$("#accountbar button").forEach((b) =>
    b.addEventListener("click", () => {
      account = b.dataset.acct;
      const u = new URL(location.href);
      u.searchParams.set("account", account);
      history.replaceState(null, "", u);
      renderAll();
    })
  );
}

function renderHero() {
  const meta = state.meta;
  $("#heroDate").textContent = meta.dayLabel || "Monday brief";
  $("#bookSub").textContent = `${state.accounts.length} accounts · as of ${meta.lastSyncLabel || "just now"}`;

  if (account === "ALL") {
    $("#heroTitle").textContent = "Two accounts. One honest book.";
    $("#heroLede").innerHTML = meta.headline || "Every figure below links to the record it came from.";
    $("#heroStats").innerHTML = state.book.heroCards
      .map(
        (c) => `<div class="stat ${c.label.startsWith("On the books") ? "good" : ""}"><span class="k">${esc(c.label)} ${c.sourceIds?.length ? cite(c.sourceIds[0], "source") : ""}</span><span class="v">${esc(c.value)}</span></div>`
      )
      .join("") + `<div class="stat"><span class="k">Risks, both accounts</span><span class="v">${state.accounts.reduce((n, a) => n + a.answers.q4.risks.length, 0)} <small>${state.accounts.reduce((n, a) => n + a.answers.q4.highCount, 0)} urgent</small></span></div>`;
  } else {
    const a = state.accounts.find((x) => x.id === account);
    if (!a) return;
    $("#heroTitle").textContent = a.name;
    $("#heroLede").innerHTML = a.answers.q1.headline;
    const q1 = a.answers.q1, q4 = a.answers.q4;
    $("#heroStats").innerHTML = [
      `<div class="stat good"><span class="k">On the books ${cite(`paper:${a.id}/contract.txt`, "contract")}</span><span class="v">${fullMoney(q1.backedTotal, a.currency)} <small>${q1.backedCount} backed deal${q1.backedCount === 1 ? "" : "s"}</small></span></div>`,
      `<div class="stat"><span class="k">Quoted, then declined ${cite(`offer:${a.id === "A" ? "a_priority_support" : "b_more_plants"}`, "offer")}</span><span class="v">${fullMoney(q1.declinedTotal, a.currency)} <small>${q1.declinedCount} offers</small></span></div>`,
      `<div class="stat bad"><span class="k">Apportioned to silent docks ${cite(`calc:atrisk-${a.id}`, "calc")}</span><span class="v">${fullMoney(q1.atRisk, a.currency)} <small>${esc(q1.atRiskLabel)}</small></span></div>`,
      `<div class="stat ${q4.highCount ? "bad" : ""}"><span class="k">Risks, not green</span><span class="v">${q4.risks.length} <small>${q4.highCount} urgent</small></span></div>`,
    ].join("");
  }
}

function renderAll() {
  renderTabs();
  renderHero();
  renderSignals();
  if (account === "ALL") return renderBoth();
  const a = state.accounts.find((x) => x.id === account);
  if (!a) return;
  renderQ1(a);
  renderQ2(a);
  renderQ3(a);
  renderQ4(a);
  renderQ5(a);
  renderNotes();
}

const SIGNAL_USE = {
  champion_leaves: "Q3 move 2 · Q4 risk 2 · Q5 gap 3",
  urgent_request: "Q3 move 1 · Q4 risk 1 · Q5 gap 5",
  usage_drop: "Q3 move 1 · Q4 risk 1 · Q5 gap 1",
};

function renderSignals() {
  const list = state.signals.slice().sort((a, b) => (b.dated || "").localeCompare(a.dated || ""));
  $("#signalsSub").innerHTML = `${list.length} signal${list.length === 1 ? "" : "s"} on file, newest first. <code>get_signals</code> delivers each event once, so the page keeps every one it has been given. ${state.meta.lastSync ? "Last live read " + esc(state.meta.lastSyncLabel) + "." : "Stored pull; the live read starts on the next slot."}`;
  $("#signalsBody").innerHTML = list.length
    ? `<div class="risks">${list
        .map((s) => {
          const recs = (s.records || []).map((r) => {
            if (r.kind === "email") return cite(`signal-email:${s.id}`, "email");
            if (r.kind === "usage") {
              return ["AD-02", "AD-05", "AD-10"]
                .filter((d) => srcIndex.has(`usage:${s.account}:${d}`))
                .map((d) => cite(`usage:${s.account}:${d}`, d))
                .join(" ");
            }
            if (r.kind === "request") {
              const row = String(r.text || "").trim().split(/\r?\n/)[1] || "";
              const id = row.split(",")[0].trim();
              return id && srcIndex.has(`request:${id}`) ? cite(`request:${id}`, `ticket ${id}`) : cite(`signal:${s.id}`, "request");
            }
            return cite(`signal:${s.id}`, "record");
          });
          return `<div class="risk low" style="border-left-color:var(--violet)">
            <div class="when"><b>${esc(s.dated || "")}</b>Account ${esc(s.account || "")}</div>
            <div>
              <div class="rt">${esc(s.title)} ${cite(`signal:${s.id}`, "signal")}</div>
              <div class="rd">${esc(s.summary)}<div style="margin-top:6px">${recs.join(" ")}</div>
              ${SIGNAL_USE[s.id] ? `<div class="tiny" style="margin-top:6px">Already read into: ${esc(SIGNAL_USE[s.id])}</div>` : ""}</div>
            </div>
          </div>`;
        })
        .join("")}</div>`
    : `<div class="empty">No signals yet. The server reads <code>get_signals</code> once a minute and keeps each signal it is given.</div>`;
}


function renderBoth() {
  $("#q1sub").textContent = "Both accounts, valued on the same rule: a deal counts as backed only when a record states the money.";
  const rows = state.accounts.map((a) => {
    const q1 = a.answers.q1;
    const top = a.answers.q3.moves[0];
    const risk = a.answers.q4.risks[0];
    return `<tr data-acct="${esc(a.id)}">
      <td><b>${esc(a.name)}</b><br><span class="tiny">${esc(a.officialStory)}</span></td>
      <td>${fullMoney(q1.backedTotal, a.currency)}<br><span class="tiny">${q1.backedCount} backed</span></td>
      <td>${fullMoney(q1.declinedTotal, a.currency)}<br><span class="tiny">${q1.declinedCount} declined offers</span></td>
      <td>${top ? `<b>${esc(top.action)}</b><br><span class="tiny">${esc(top.owner)} · ${esc(top.dueLabel)}</span>` : "—"}</td>
      <td>${risk ? `<b>${esc(risk.title)}</b><br><span class="tiny">${esc(risk.whenLabel)}</span>` : "—"}</td>
    </tr>`;
  }).join("");
  $("#q1body").innerHTML = `<table class="srctable" style="margin-top:14px"><thead><tr><th>Account</th><th>Backed</th><th>Declined offers</th><th>First move</th><th>Top risk</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="tiny" style="margin-top:14px">Click a row to open that account's five answers. Values are stated in the records; where no record states money, the deal is listed at zero with the gap explained in Q5.</p>`;
  $$("#q1body tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => {
      account = tr.dataset.acct;
      history.replaceState(null, "", `?account=${account}`);
      renderAll();
    })
  );
  ["q2", "q3", "q4", "q5"].forEach((q) => {
    $(`#${q}body`).innerHTML = `<div class="empty">Open an account tab to read this answer for that account.</div>`;
  });
  renderNotes();
}

/* ---------- Q1 ---------- */
function renderQ1(a) {
  const q = a.answers.q1;
  $("#q1sub").innerHTML = `Valued ${esc(a.currencyNote || "in the currency the record states")}. ${esc(q.rule)}`;
  const deals = q.deals
    .map((d) => {
      const cls = d.valueKind === "backed" ? "" : d.valueKind === "claimed" ? "claim" : "unknown";
      const val = d.value != null ? fullMoney(d.value, a.currency) : d.valueLabel || "Not stated";
      return `<div class="deal">
        <div class="dealTop"><span class="t">${esc(d.title)}</span><span class="money ${cls}">${esc(val)}</span></div>
        <div class="meta">
          <span class="tag">${esc(d.stage || "identified")}</span>
          ${d.deadlineLabel ? `<span>⏱ ${esc(d.deadlineLabel)}</span>` : `<span>no deadline in record</span>`}
          ${d.ownerLabel ? `<span>· ${esc(d.ownerLabel)}</span>` : ""}
          ${cites(d.sourceIds, "Evidence")}
        </div>
        <div class="basis">${d.basis}</div>
      </div>`;
    })
    .join("");
  const offers = a.offers
    .filter((o) => o.status === "declined")
    .map(
      (o) => `<div class="deal" style="border-style:dashed">
        <div class="dealTop"><span class="t">${esc(o.title)} <span class="tag claim">declined</span></span><span class="money claim">${fullMoney(o.value, a.currency)}</span></div>
        <div class="meta"><span>Quoted to ${esc(o.pitch_to)}</span><span>· customer said no</span>${cites([`offer:${o.id}`], "Offer")}</div>
      </div>`
    )
    .join("");
  $("#q1body").innerHTML = `<div class="book">
    <div>${deals || '<div class="empty">No deals on file.</div>'}
      ${offers ? `<p class="eyebrow" style="margin:22px 0 8px">Quoted, then declined — not counted</p>${offers}` : ""}
    </div>
    <div class="totalbox">
      <div class="k">Backed by a record</div>
      <div class="big">${fullMoney(q.backedTotal, a.currency)}</div>
      <div class="tiny">${q.backedCount} of ${q.deals.length} deals · ${cites(q.sourceIds, "Source")}</div>
      <div class="split">
        <div><b>${fullMoney(q.declinedTotal, a.currency)}</b><span>quoted, declined</span></div>
        <div><b>${q.unvaluedCount}</b><span>deals with no value on file</span></div>
      </div>
      <div class="split">
        <div><b>${fullMoney(q.atRisk, a.currency)}</b><span>${esc(q.atRiskLabel)}</span></div>
      </div>
      <div class="note">${q.totalsNote}</div>
    </div>
  </div>`;
}

/* ---------- Q2 ---------- */
function renderQ2(a) {
  const q = a.answers.q2;
  $("#q2sub").textContent = q.rule;
  const cards = q.deals
    .map((d) => {
      const seat = (role) => {
        const people = d.seats[role] || [];
        if (!people.length) return `<div class="seat empty"><div class="role">${role}</div><div class="who">Not identified</div><div class="pos">${esc(d.emptyNote?.[role] || "Ask in Q5")}</div></div>`;
        return people
          .map(
            (p) => `<div class="seat"><div class="role">${role}<span>${statusPill(p.stance)}</span></div>
            <div class="who">${esc(p.name)}</div><div class="pos">${esc(p.role || "")}${p.note ? ` · ${esc(p.note)}` : ""}</div>
            ${p.sourceIds?.length ? `<div style="margin-top:6px">${cites(p.sourceIds)}</div>` : ""}</div>`
          )
          .join("");
      };
      return `<div class="dealpower">
        <h4>${esc(d.title)}</h4>
        <div class="dm">${esc(d.dealType)} · ${cites(d.sourceIds, "from")}</div>
        <div class="seats">${seat("decides")}${seat("pays")}${seat("uses")}${seat("blocks")}</div>
      </div>`;
    })
    .join("");
  $("#q2body").innerHTML = `<div class="pmap">${cards || '<div class="empty">No deals on file.</div>'}</div>
    <p class="tiny" style="margin-top:14px">Stance is read from the account record (relationship) plus the most recent paperwork. “Not identified” means no record names anyone in that seat — it is a gap, not a guess.</p>`;
}

/* ---------- Q3 ---------- */
function renderQ3(a) {
  const q = a.answers.q3;
  $("#q3sub").textContent = q.rule;
  const moves = q.moves
    .map(
      (m, i) => `<div class="move ${m.overdue ? "overdue" : ""}">
      <div class="rank">${String(i + 1).padStart(2, "0")}</div>
      <div>
        <div class="act">${esc(m.action)}</div>
        <div class="why">${esc(m.why)}</div>
        <div class="dealref">Moves: ${esc(m.dealTitle)} · ${cites(m.sourceIds, "Why")}</div>
        <span class="owner">Owner: ${esc(m.owner)}</span>
      </div>
      <div class="due"><b>${esc(m.dueLabel)}</b>${esc(m.dueWhy || "")}</div>
    </div>`
    )
    .join("");
  $("#q3body").innerHTML = `<div class="moves">${moves}</div>
    <p class="tiny" style="margin-top:14px">Ranked by the nearest hard deadline, then by value at risk. Every move is inside the deadline it protects.</p>`;
}

/* ---------- Q4 ---------- */
function renderQ4(a) {
  const q = a.answers.q4;
  $("#q4sub").textContent = q.rule;
  const risks = q.risks
    .map(
      (r) => `<div class="risk ${r.severity}">
      <div class="when"><b>${esc(r.whenLabel)}</b>${esc(r.turnsBad || "")}</div>
      <div>
        <div class="rt">${esc(r.title)}</div>
        <div class="rd">${esc(r.detail)}<div>${cites(r.sourceIds, "Evidence")}</div></div>
      </div>
    </div>`
    )
    .join("");
  $("#q4body").innerHTML = `<div class="risks">${risks || '<div class="empty">Nothing at risk on the records.</div>'}</div>`;
}

/* ---------- Q5 ---------- */
function renderQ5(a) {
  const q = a.answers.q5;
  $("#q5sub").textContent = q.rule;
  const gaps = q.gaps
    .map(
      (g) => `<div class="gap">
      <div class="i">${esc(g.n)}</div>
      <div><div class="gq">${esc(g.question)}</div><div class="gm">${esc(g.why)} ${g.sourceIds?.length ? cites(g.sourceIds, "From") : ""}</div></div>
      <div class="who"><b>Who can fill it</b>${esc(g.who)}${g.whoSourceIds?.length ? `<div style="margin-top:5px">${cites(g.whoSourceIds)}</div>` : ""}</div>
    </div>`
    )
    .join("");
  $("#q5body").innerHTML = `<div class="gaps">${gaps}</div>`;
}

/* ---------- notes ---------- */
function renderNotes() {
  const sel = $("#noteAccount");
  const prev = sel.value;
  sel.innerHTML = state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</option>`).join("");
  if (state.accounts.some((a) => a.id === prev)) sel.value = prev;
  else if (state.accounts.some((a) => a.id === account)) sel.value = account;
  const kinds = { note: "note", task: "task", risk: "risk", next_step: "next step" };
  $("#noteList").innerHTML = state.notes.length
    ? state.notes
        .slice()
        .reverse()
        .map(
          (n) => `<li><span class="nk">${esc(kinds[n.kind] || n.kind || "note")}</span><span class="nt">${esc(n.title || "")}</span><span class="ntime">${esc(n.account || "")} · ${esc(n.createdLabel || "")}${n.pending ? " · queued" : ""}</span><div>${esc(n.text)}</div></li>`
        )
        .join("")
    : `<li class="tiny">No notes written yet. The first one will be sent with <code>write_note</code> on the next slot.</li>`;
}

/* ---------- drawer ---------- */
function openSource(id) {
  const s = srcIndex.get(id);
  if (!s) return;
  $("#drawerKind").textContent = `${s.kind}${s.account ? ` · account ${s.account}` : ""}`;
  $("#drawerTitle").textContent = s.title || id;
  const kv = [
    ["Source id", `<code>${esc(id)}</code>`],
    ["Type", esc(s.kind)],
    s.status ? ["Status", `<span class="tag ${esc(s.status)}">${esc(s.status)}</span>`] : null,
    s.saidBy ? ["Said by", esc(s.saidBy)] : null,
    s.date ? ["Date", esc(s.date)] : null,
    s.account ? ["Account", esc(s.account)] : null,
    s.path ? ["Record path", `<span class="path">${esc(s.path)}</span>`] : null,
    s.fileId ? ["File id", `<code>${esc(s.fileId)}</code>`] : null,
  ].filter(Boolean);
  let body = `<dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  if (s.quote) body += `<h4>What the record says</h4><blockquote class="quote">${esc(s.quote)}</blockquote>`;
  if (s.detail) body += `<h4>Context</h4><p>${esc(s.detail)}</p>`;
  if (s.raw != null) body += `<h4>Raw record</h4><pre>${esc(typeof s.raw === "string" ? s.raw : JSON.stringify(s.raw, null, 2))}</pre>`;
  $("#drawerBody").innerHTML = body;
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#scrim").hidden = false;
}
function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
}

function openSources() {
  const rows = [...srcIndex.entries()]
    .sort((a, b) => (a[1].kind + a[0]).localeCompare(b[1].kind + b[0]))
    .map(([id, s]) => `<tr data-src="${esc(id)}"><td>${esc(id)}</td><td>${esc(s.kind)}</td><td>${esc(s.account || "")}</td><td>${esc(s.title || "")}</td></tr>`)
    .join("");
  $("#sourcesBody").innerHTML = `<p class="tiny" style="margin:0 0 12px">${srcIndex.size} records underpin this page. Nothing here is typed in by hand: each row is an object returned by the MCP.</p>
    <table class="srctable"><thead><tr><th>Id</th><th>Type</th><th>Acct</th><th>Record</th></tr></thead><tbody>${rows}</tbody></table>`;
  $$("#sourcesBody tr").forEach((tr) => tr.addEventListener("click", () => { $("#sourcesModal").hidden = true; openSource(tr.dataset.src); }));
  $("#sourcesModal").hidden = false;
}

/* ---------- boot ---------- */
let IS_STATIC = false;

async function getState() {
  const preferStatic = location.protocol === "file:" || location.hostname.endsWith("github.io");
  if (!preferStatic) {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.ok) return r.json();
    } catch {}
  }
  const r = await fetch("state.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`state HTTP ${r.status}`);
  return r.json();
}

async function load(force = false) {
  try {
    state = await getState();
    IS_STATIC = Boolean(state.meta?.static);
    srcIndex = new Map(state.sources.map((s) => [s.id, s]));
    renderAll();
    applyMode();
    paintLive();
    if (!$("#noteAccount").options.length && state.accounts[0]) $("#noteAccount").value = state.accounts[0].id;
  } catch (e) {
    $("#liveDot").className = "dot err";
    $("#liveText").textContent = "Offline — last view is cached in this tab";
    console.error(e);
  }
}

function applyMode() {
  const form = $("#noteForm");
  const noteCard = $("#notes");
  if (!form) return;
  if (IS_STATIC) {
    form.hidden = true;
    const p = noteCard.querySelector(".qsub");
    if (p) p.innerHTML = "This is the hosted read-only snapshot. Note writing through <code>write_note</code> runs on the full Node server; the repository shows that code.";
    $("#noteList").innerHTML = `<li class="tiny">The hosted copy refreshes from the MCP through a scheduled job. Notes shown here were written on the full server.</li>`;
  }
}

function paintLive() {
  const m = state.meta;
  const dot = $("#liveDot");
  dot.className = "dot " + (m.static ? "warn" : m.pollState === "ok" ? "pulse" : m.pollState === "limited" ? "warn" : "err");
  $("#liveText").textContent = m.liveLabel || "Live";
  $("#callCount").textContent = m.callsLabel || "";
  $("#footSync").textContent = m.footLabel || "";
}

function tick() {
  if (!state) return;
  const m = state.meta;
  if (m.static) {
    $("#liveText").textContent = `${m.liveLabel || "Snapshot"} · ${m.lastSyncLabel || "stored"}`;
    return;
  }
  const secs = Math.max(0, Math.round((new Date(m.nextPollAt).getTime() - Date.now()) / 1000));
  $("#liveText").textContent = `${m.liveLabel || "Live"} · next read in ${secs}s`;
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  setInterval(tick, 1000);
  setInterval(() => load(true), 30000);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-src]");
    if (b && !b.closest("#sourcesBody")) openSource(b.dataset.src);
  });
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  $("#sourcesBtn").addEventListener("click", openSources);
  $("#sourcesClose").addEventListener("click", () => ($("#sourcesModal").hidden = true));
  $("#refreshBtn").addEventListener("click", () => load(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      $("#sourcesModal").hidden = true;
    }
  });
  $("#noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (IS_STATIC) {
      $("#noteStatus").textContent = "Read-only snapshot: note writing runs on the full server.";
      return;
    }
    const text = $("#noteText").value.trim();
    if (!text) return;
    const payload = { text, account: $("#noteAccount").value, kind: $("#noteKind").value, title: $("#noteTitle").value.trim() };
    $("#noteStatus").textContent = "Queueing…";
    try {
      const r = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "failed");
      $("#noteStatus").textContent = j.message || "Queued for the next write slot.";
      $("#noteText").value = "";
      $("#noteTitle").value = "";
      await load();
    } catch (err) {
      $("#noteStatus").textContent = "Could not queue: " + err.message;
    }
  });
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          $$(".side a").forEach((x) => x.classList.toggle("on", x.getAttribute("href") === "#" + en.target.id));
        }
      });
    },
    { rootMargin: "-20% 0px -70% 0px" }
  );
  $$(".q").forEach((s) => io.observe(s));
});
