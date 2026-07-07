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

---

## Exact breakdown & fix location (pinpoint)

The whole issue lives in **one jsonb value on one DB row**. Nothing in source is
wrong. Here is the precise chain, end to end.

**1. Where it broke down (the write that caused it):**
- A dashboard-editor save wrote an override for Avenue Z through
  `app/actions/report-sections.ts` — either `saveReportSectionConfig('avenue-z', 'peec-ai', …)`
  (line 77) or `freezeSection('avenue-z', 'peec-ai')` (line 57).
- That call persisted to `clients.report_section_config` and stamped
  `updatedAt: new Date()` (`app/actions/report-sections.ts:36`).
- **Result on the row:** `clients.report_section_config['peec-ai']` for the
  `avenue-z` row now carries either `hidden: [… 'visibility-chart', 'winners-losers' …]`
  or a `frozen` snapshot whose `order` omits those two ids.
- **When:** after **2026-07-01** (feature ship, migration 0016). The exact instant is
  `clients.updated_at` for `avenue-z`.

**2. Where it takes effect (the read that drops the sections):**
- `components/report-sections/peec-ai/index.tsx:129`
  `const override = config?.reportSectionConfig?.['peec-ai']`
- passed to `resolveSection(PEEC_TEMPLATE, override)`
  (`components/report-sections/peec-ai/index.tsx:47`).
- `lib/report-sections/resolve.ts`: `const hidden = new Set(o.hidden ?? [])`, then
  `inWorkingSet(id) = (base/extra has id) && !hidden.has(id)`. The two ids fail
  `inWorkingSet`, so they are never emitted. (For the `frozen` case, `selectBase`
  swaps the template order for the snapshot order, which already lacks them.)

**3. Where the fix is applied (the exact target):**
- **Target:** the `avenue-z` row → `report_section_config` jsonb → key `'peec-ai'`.
- **Change:** remove `'visibility-chart'` and `'winners-losers'` from `hidden`
  (Case A), or unfreeze the section (Case B). If `hidden` was the only content,
  deleting the `'peec-ai'` key entirely is equivalent (the section then falls back
  to `PEEC_TEMPLATE`, which already lists all 8 parts in the correct order).
- **Via:** `saveReportSectionConfig('avenue-z', 'peec-ai', <cleaned override>)` or
  `unfreezeSection('avenue-z', 'peec-ai')` — same vetted actions, so validation runs
  and `updatedAt` is re-stamped.

**One-line summary:** it broke at a dashboard-editor save that hid two sections on
Avenue Z; it lives at `clients.report_section_config['peec-ai'].hidden` (or `.frozen`)
on the `avenue-z` row; the fix removes those two ids there. No code, no other client,
no schema.

**Note on access:** there is **no local `.env`** in this repo, so `DATABASE_URL` is not
reachable from this machine and the read-only `SELECT` cannot run here. The exact
current value is read via one of: the dashboard editor UI (shows hidden/frozen
state), `vercel env pull` then a read-only `SELECT` (fetches the secret to a
gitignored file), or Paul running the `SELECT`.

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
saved. **Local `.env` is absent, so the SELECT cannot run from this machine.** Pick
one read-only access path (all require Thomas's go):
- (a) **Dashboard editor UI** — already logged in; shows the hidden/frozen state per section. No secret handling.
- (b) **`vercel env pull .env.local`** then a read-only `tsx`/`SELECT` — fetches `DATABASE_URL` into a gitignored file (matches the "keep a local gitignored copy" rule).
- (c) **Paul runs the `SELECT`** — he has DB access.

- [ ] **Step 0.1 — establish read-only access** via (a), (b), or (c) above. If (b),
  confirm `.env.local` is gitignored (`git check-ignore .env.local`) and never echo values.

- [ ] **Step 0.2 — read the avenue-z override + timestamps** (read-only, single row):

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

**Surgical rule (mandatory):** change ONLY the two ids. **Preserve every other key**
in `report_section_config['peec-ai']` (`order`, `labels`, `thresholds`, any other
`hidden` ids, `frozen`) and every other section key in `report_section_config`
(e.g. `content-impact`, `pr-influence`). Never overwrite the whole override or the
whole column blind. Read the current object, mutate only the two ids, write it back.

- [ ] **Step 3.1 — apply** the Gate 1 mechanism to ONLY `avenue-z`'s
  `report_section_config['peec-ai']`:
  - Case A (`hidden`): drop exactly `visibility-chart` and `winners-losers` from the
    `hidden` array; keep the rest of the override object intact. Only if `hidden` was
    the sole content of the `peec-ai` override may you delete the `peec-ai` key (it
    then falls back to `PEEC_TEMPLATE`, which lists all 8 parts in order).
  - Case B (`frozen`): `unfreezeSection('avenue-z','peec-ai')` so it follows the live
    template. If the frozen snapshot pinned non-default versions of other parts that
    must be preserved, instead re-freeze a snapshot that includes all 8 parts rather
    than blanket-unfreezing.
- [ ] **Step 3.2 — confirm scope**: the write targeted `where slug = 'avenue-z'`,
  exactly one row, and only the two ids changed (diff the before/after JSON from the
  Gate 2 backup).

Pass bar: exactly one row updated; only `visibility-chart` + `winners-losers` newly
appear; every other key byte-identical to the backup except the two ids; `updatedAt`
bumped.

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

- Paul: **APPROVED** bringing `visibility-chart` + `winners-losers` back for Avenue Z.
- Thomas: explicit go to mutate the prod `avenue-z` row (pending).
- Paul (again) only if the fix falls to raw SQL rather than the vetted server actions.

## Why this can't break anything else (independence proof)

- **Other clients:** the override is a per-client row value; render is
  `resolveSection(PEEC_TEMPLATE, thatClientsOverride)`. We edit only the `avenue-z`
  row. The shared `PEEC_TEMPLATE` (code) is untouched. So renaissance and every other
  client are read-path identical before and after. Impossible to affect them.
- **Avenue Z's other sections:** the surgical rule mutates only the two ids and
  preserves the rest of the override, so the synopsis, KPIs, LLM breakdown, leaderboard,
  domains, footer, labels, and order are unchanged. The two restored parts slot into
  their template positions (visibility-chart after KPIs, winners-losers after LLM
  breakdown) via `resolveSection`'s base-order remainder pass.
- **The AI synopsis:** unaffected. It is gated by `showAeoSynopsis` / `SHOW_AI_NARRATIVE`
  (a separate mechanism), not by this override. Nothing here touches that gate.
- **No code, no schema, no branch:** zero source files change; the `tina-post-split-qa`
  branch is not involved.

## Gate log

| Gate | State | Evidence |
|------|-------|----------|
| 0 Read-only diagnosis | NOT STARTED | Paul approved restore; still read exact override (hidden vs frozen) before editing |
| 1 Mechanism choice | BLOCKED on Gate 0 | |
| 2 Backup | BLOCKED on Gate 0 | |
| 3 Apply | Paul ✅; awaiting Thomas go | Avenue Z row only, surgical two-id change |
| 4 Verify render | NOT STARTED | |
| 5 Prevention | NOT STARTED | |
