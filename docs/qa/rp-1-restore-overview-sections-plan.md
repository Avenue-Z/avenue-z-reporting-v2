# RP-1 Fix Plan: Restore the visibility chart + Winners/Losers on Avenue Z Overview

> **For agentic workers:** this is a **data/ops fix, not a code change.** No source
> files change, no branch merge required. The fix mutates one prod DB row's jsonb
> config. Follow the gates in order. Read-only diagnosis first; nothing is mutated
> until Gate 3, and only after explicit approval.

**Goal:** make the Avenue Z Overview render the YTD visibility trend chart
(`visibility-chart`) and the Biggest Winners / Biggest Losers cards
(`winners-losers`) again, restoring the two Tina-accepted sections (Overview CSV
rows 7 and 11) that a per-client dashboard override is currently hiding.

**Architecture:** the AEO Overview order is `resolveSection(PEEC_TEMPLATE, override)`
where `override = clients.report_section_config['peec-ai']` (read at
`components/report-sections/peec-ai/index.tsx:129`). The two parts are in the
default template and published; they are being dropped by that per-client override
(`hidden` list, or a `frozen` snapshot that omits them, per `resolve.ts`). The fix
removes that removal for `avenue-z` only.

**Tech:** Neon Postgres (jsonb column), Drizzle, the vetted server actions in
`app/actions/report-sections.ts`. No schema migration.

## Global Constraints

- **Read-only until Gate 3.** No DB writes, no UI saves, until diagnosis is done
  and Thomas has approved the exact change.
- **Avenue Z only.** The change touches the `avenue-z` client row and nothing else.
  Verify a second client (`renaissance`) is unaffected.
- **No raw schema migration.** This is a data edit. The Neon "no migration without
  Paul" rule is about schema; still, loop Paul because he owns the
  configurable-dashboard feature and the prod DB.
- **Prefer the vetted write path** (dashboard editor UI or the
  `app/actions/report-sections.ts` server actions, which validate + set
  `updatedAt`) over a raw SQL `UPDATE`.
- **Back up the current override JSON before mutating** so the change is reversible.
- **Independent of the `tina-post-split-qa` branch.** The FB-064 synopsis restore is
  code on that branch; this fix is prod data. Either can ship without the other.

---

## Gate 0 — Read-only diagnosis (get the exact override + timestamp)

Determines whether the cause is `hidden` or `frozen`, and exactly when it was
saved. Requires Thomas's go to connect read-only to the prod Neon DB.

- [ ] **Step 0.1 — confirm `.env` has a DB URL (do not print the value)**

Run: `git check-ignore .env && grep -q '^DATABASE_URL' .env && echo "DATABASE_URL present"`
Expected: `.env` is gitignored and the key exists. Never echo the value.

- [ ] **Step 0.2 — read-only SELECT of the avenue-z override + timestamps**

Read-only, single row, no mutation. Reuse the app's own read path via a throwaway
`tsx` script (no raw SQL), or a `SELECT` if psql is available:

```sql
SELECT slug, report_section_config -> 'peec-ai' AS peec_override,
       created_at, updated_at
FROM clients WHERE slug = 'avenue-z';
```

Record verbatim:
- the `peec-ai` override JSON (look for `hidden: [...]` and/or `frozen: {...}`),
- `updated_at` (the exact save time = when the change was done),
- whether `hidden` contains `visibility-chart` and `winners-losers`, or a `frozen.order` omits them.

- [ ] **Step 0.3 — classify the cause**
  - If `hidden` contains the two ids → **Case A (explicit hide).** Fix = remove those two ids from `hidden`.
  - If `frozen` present and its `order` omits the two ids → **Case B (stale freeze).** Fix = `unfreezeSection`, or re-freeze after the template is the source of truth.
  - If neither but parts still missing → stop, re-investigate (resolve.ts says these are the only two drop paths; a third would mean a resolve bug).

Pass bar: we can state, in one sentence, the exact override contents and the exact
`updated_at`, and which Case applies.

---

## Gate 1 — Choose the fix mechanism (safest that works)

Pick based on Gate 0's Case, in this preference order:

1. **Dashboard editor UI (preferred).** If the AEO Overview editor exposes an
   "unhide/restore section" (Case A) or "unfreeze" (Case B) control, use it. It runs
   the vetted server action, validates, sets `updatedAt`, and is fully reversible.
2. **Server action, one-shot (fallback).** Invoke the existing action directly (no
   raw SQL) against the target row:
   - Case A: `saveReportSectionConfig('avenue-z', 'peec-ai', <override with the two ids removed from hidden>)`
   - Case B: `unfreezeSection('avenue-z', 'peec-ai')`
   Both go through `validateSectionOverride` and set `updatedAt`.
3. **Raw SQL `UPDATE` (last resort only).** Only if 1 and 2 are unavailable, and only
   after Paul signs off, because it bypasses validation.

Pass bar: mechanism chosen, and it reuses validated code unless Paul explicitly
approves raw SQL.

---

## Gate 2 — Backup (reversibility)

- [ ] **Step 2.1 — save the current override JSON** captured in Gate 0 to a local
  gitignored scratch file (e.g. the scratchpad), labeled with the `updated_at` value,
  so the exact prior state can be restored verbatim if needed.

Pass bar: the pre-change JSON is stored somewhere outside the DB.

---

## Gate 3 — Apply the fix (Avenue Z only) — REQUIRES THOMAS GO + PAUL LOOPED

- [ ] **Step 3.1 — apply** the Gate 1 mechanism. Change ONLY `avenue-z`'s
  `report_section_config['peec-ai']`:
  - Case A: remove `visibility-chart` and `winners-losers` from `hidden` (if `hidden`
    becomes empty and the override carries nothing else meaningful, clearing the
    `peec-ai` key entirely is equivalent and cleaner).
  - Case B: unfreeze the `peec-ai` section so it follows the live template again.
- [ ] **Step 3.2 — confirm scope**: the write targeted `where slug = 'avenue-z'` and
  no other row was touched.

Pass bar: exactly one row updated; `updatedAt` bumped to now.

---

## Gate 4 — Verify render (3-way)

- [ ] **Step 4.1 — Avenue Z Overview** (`/dashboard/avenue-z/reports?section=peec-ai`,
  preview branch alias): the section order is now
  `synopsis → KPIs → visibility-chart → llm-breakdown → winners-losers → brand-rankings → domains → footer`.
  The "How has AI visibility grown this year?" chart and the "Biggest Winners / Biggest
  Losers" cards are present. Confirm via `get_page_text` (the Winners/Losers titles are
  text and will appear) plus a screenshot of the chart.
- [ ] **Step 4.2 — nothing else changed**: synopsis, KPIs, leaderboard, domains still
  render; no duplicate or missing sections; the other 6 parts unchanged.
- [ ] **Step 4.3 — isolation**: renaissance Overview
  (`/dashboard/renaissance/reports?section=peec-ai`) is byte-for-byte unaffected
  (it already renders its own chart; confirm no regression).

Pass bar: Avenue Z shows all 8 sections in template order; renaissance unchanged.

---

## Gate 5 — Prevention follow-up (park, do not build now)

Log RP-1 in `docs/qa/v1-failure-taxonomy-and-prevention-system.md` as a new class:
**config-override silently hiding template sections** (invisible to source-read and
tests; only the live-render pass caught it). Candidate guards, to decide later:
- editor warns when a Tina-approved template section is hidden,
- a check that flags clients whose `report_section_config` hides any default part,
- promoting Avenue Z's reviewed layout to the template so it cannot silently drift.

Pass bar: one paragraph added to the taxonomy doc; no code built.

---

## Rollback

Re-apply the backed-up JSON (Gate 2) via the same mechanism used in Gate 3
(`saveReportSectionConfig('avenue-z','peec-ai', <backup>)`), then re-run Gate 4.

## Approvals required before Gate 3

- Thomas: explicit go to mutate the prod `avenue-z` row.
- Paul: looped as owner of the configurable-dashboard feature + prod DB (required if
  the fix falls to raw SQL).

## Gate log

| Gate | State | Evidence |
|------|-------|----------|
| 0 Read-only diagnosis | NOT STARTED | needs Thomas go for read-only DB SELECT |
| 1 Mechanism choice | BLOCKED on Gate 0 | |
| 2 Backup | BLOCKED on Gate 0 | |
| 3 Apply | BLOCKED on approvals | Thomas + Paul |
| 4 Verify render | NOT STARTED | |
| 5 Prevention | NOT STARTED | |
