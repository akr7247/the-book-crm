# Hand-in

## The four links

| # | What | Link |
| --- | --- | --- |
| 1 | Live CRM (hosted, no laptop) | <https://akr7247.github.io/the-book-crm/> |
| 2 | Public repository | <https://github.com/akr7247/the-book-crm> |
| 3 | One-page thinking doc | _paste `THINKING.md` into a Google Doc, share "anyone with the link can view", put the link here_ |
| 4 | Three-minute walkthrough | _record from `VIDEO.md`, upload to Google Drive, share "anyone with the link can view", put the link here_ |

The hosted copy is read-only: it is rebuilt every ten minutes by a scheduled job that
reads `get_signals` with a repository secret. The full Node server in the repository adds
the one-call-a-minute live loop and `write_note` write-back.

## The one-screen answer

**Eastern Counties Police Alliance — £350,000 a year, renews 28 Feb 2027**

1. **Worth:** £350,000 backed by the order form. A 300-dock tender and a 30-dock stadium
   are named but carry no value. £105,000 of declined offers are excluded.
2. **Power:** the signatory and procurement lead are not named. Rhys Calder is the route,
   not the signatory, and leaves in January. Insp. Karen Mbeki uses it but is guarded.
3. **First moves:** written answer to Mbeki before 5 Dec (you); successor, procurement lead
   and dock-by-force list from Calder by 11 Dec (you + Neel Sharma); renewal order and
   force-by-force review by 15 Jan (you + Achal Negi).
4. **About to go wrong:** Mbeki has no answer and a public event on 5 Dec. Calder leaves
   with no successor. 17 of 35 docks flew nothing in four weeks — £170,000 of apportioned
   annual value. A 300-dock tender has no owner, spec or date.
5. **Unknown:** who signs, the dock-to-force map, the successor, why 17 docks are idle,
   what Mbeki would sign now, the tender's spec and evaluation, the four-way invoice split,
   whether the stadium is real.

**Aldermoor Industrial Group — €140,000 a year, renews 31 Jan 2027**

1. **Worth:** €140,000 backed by the order form; one invoice of €128,000 after the €12,000
   trial credit. A 40-plant sister company is named but carries no value. €280,000 of
   declined offers are excluded.
2. **Power:** Stefan Roy signed and calls renewal a formality. Group Finance is guarded and
   says no renewal is raised until the quote shows cost per plant. Beatriz Alonso is the
   only named plant contact.
3. **First moves:** call Beatriz about AD-02/05/10 by 1 Dec (you); per-plant quote to group
   finance by 4 Dec (you + Achal Negi); name Stefan's deputy and start the sister-company
   case study by 11 Dec (you + Yashash Rao).
4. **About to go wrong:** three of the four busiest docks stopped flying in the week of
   16 Nov, all still online, no ticket — €30,000 of apportioned value. Group finance's
   per-plant quote request from 8 Oct is unanswered. The 40-plant case study is not
   started. A Plant 11 dock waits on unnamed customer IT since 10 Sep.
5. **Unknown:** why the three docks stopped, who Stefan's deputy is, the dock-to-plant map,
   who owns the renewal in finance, the €1.2M saving's working, what would be bought after
   the declines, who decides at the sister company, and the Plant 11 IT contact.

## Rules the page follows

- A deal is **backed** only when a record states the money. Claims are shown, not counted.
- **Unknown stays unknown.** Empty power seats and gaps say who can fill them.
- Derived numbers show their formula. Value at risk is annual value ÷ docks × silent docks,
  labelled as apportionment.
- Every figure carries a source id; clicking it opens the record.
- The MCP token is server-side only. The browser receives `state.json`, never a credential.
