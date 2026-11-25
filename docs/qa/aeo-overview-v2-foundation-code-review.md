# Code Review Record — `feat/aeo-overview-v2-foundation` (PR #532)

**Feature under review:** PR #532, `feat(aeo-v2): slice 1 foundation: compare range, sortable deltas, section shell`

**Diff range reviewed:** `3edb02d7..143a57e0`, six commits on `feat/aeo-overview-v2-foundation`, branched from `dev` at `3edb02d7`. No unrelated code.

**Design and plan:** PR #531 (`docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md`, `docs/superpowers/plans/2026-11-25-aeo-overview-v2-slice-1-foundation.md`).

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| v2 helpers and shell | `components/report-sections/peec-ai/v2/` (`compare.ts`, `delta.ts`, `delta-columns.tsx`, `sections.ts`, `overview-body.tsx`, `section-nav.tsx`, `deltas-switch.tsx`) |
| Section wiring | `components/report-sections/peec-ai/index.tsx`, `ctx.ts`, `parts/__fixtures__/peec-ctx.ts`, `sortable-table.tsx` |
| Fetchers | `lib/peec/client.ts`, `lib/profound/client.ts` (one optional parameter each) |
| Pages, picker, export | `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`, `components/report-sections/ga4/date-picker.tsx`, `components/export-pdf-button.tsx`, `lib/export/request.ts`, `app/export/[clientSlug]/[section]/page.tsx`, `components/export/report-element.tsx` |
| Docs | `components/report-sections/peec-ai/MAINTAINING.md` (staging v2 recipe) |
| Tests | 8 new test files under `v2/`, a new `ga4/date-picker.test.tsx`, and an extended `lib/export/request.test.ts` |

---

## §1 How it works

Slice 1 is plumbing. It ships **no v2 parts**, so no client's page changes when it merges. It adds three things the next slices build on.

**1. A per-client "v2 layout" switch.** The AEO Overview renders from versioned parts, resolved from the `section_templates` row for `peec-ai` plus the client's `report_section_config['peec-ai']`. `V2_PART_SECTIONS` (`v2/sections.ts`) maps a part `id@version` to one of the five numbered sections. It is empty in this slice.

- A client is **on v2** when its resolved part list contains any mapped part (`isV2Layout`).
- `PeecAIReport` now looks the template up *before* fetching, so it knows this before any data call.
- Not on v2 (every client today): the page renders exactly as before.
- On v2:
  - `ProviderSection` drops the old single header;
  - it groups parts into numbered sections (`groupParts`, `OverviewBody`), each with eyebrow, headline and description;
  - it shows a side menu (`OverviewSectionNav`) and a **Show deltas** switch.

**2. Compare to and Show deltas, from the URL to the numbers.** Where a value comes from:

| Value | Source | Rule |
|---|---|---|
| Comparison | `?compareRange=` | `previous_period` (default, also when missing or unrecognized), `previous_year`, or `none` (`parseAeoCompare`). |
| Deltas hidden | `?deltas=off` | Anything else, or missing, means shown. Always hidden when the comparison is `none` (`parseShowDeltas`). |
| Fetch window | `fetchCompareMode` | `previous_year` fetches the same period last year. `previous_period` and `none` fetch the previous period. For `none` the UI hides every delta. |

- `overviewCompare(isV2, …)` returns the defaults for non-v2 clients. **The URL only affects a v2 client.**
- `getPeecOverview` and `getProfoundOverview` take an optional third argument, `compareMode`. The page passes it **only** for `previous_year`. A v1 call is therefore still `(clientSlug, dateRange)`, and the cache key (`lib/cache.ts`, `JSON.stringify(args)`) is unchanged. There is no cache version bump and no cold cache.
- The GA4 AI-sessions prior window uses the same `fetchMode`, so every prior figure on a v2 page follows one comparison.

**3. A shared way to show change figures.**

- `formatDelta` shows rates in **points** (`+1.2 pts`), counts in **percent** (`+114.6%`) and ranks in **places** (`↑ 2 places`, positive means the client moved up).
- No comparison value shows `–` (hover text "No comparison data"); a new row shows `New`.
- `deltaTone` colors from the same rounded value the text shows: green better, red worse, muted for no change.
- `deltaColumn` turns that into a sortable, right-aligned Δ column in the existing `SortableTable`. Missing and `New` rows sink to the bottom in both sort directions.
- If deltas are hidden while the table is sorted by a Δ column, the table falls back to its default sort.

**Picker and export.**

- **AEO Overview picker.**
  - It shows "vs Previous Period" when the URL has no `compareRange` (display-only `defaultCompare`).
  - It writes `compareRange=none` for No Comparison (`explicitNone`).
  - It changes `compareRange` **only when the user clicks a Compare to option**. A date-only change leaves the param exactly as it was.
  - The AEO subsection pickers and every other section's picker keep today's props.
- **Single-page PDF export.**
  - It carries `compareRange` to `PeecAIReport`, which it didn't before.
  - It also carries `deltas=off`, only from the AEO Overview.
  - `parseExportRequest` rejects any `deltas` other than `off`.
- **Bulk export** does not carry `deltas`; bulk PDFs show deltas.

---

## §2 Verification method

- **Process:** built task by task with a fresh implementer per task. Each task had a spec-and-quality review. Then came a whole-branch review on the most capable model, one fix wave (`47eeae59..143a57e0`), and a scoped re-review of that wave. The whole-branch review found the C1 leak described in §4. It was fixed in the wave and confirmed fixed by the re-review.
- **Unit, executed:**
  - `v2/report-compare.test.tsx` calls the real `PeecAIReport` with mocked fetchers. It asserts the v1 call is exactly `['renaissance','last_30_days']` even with `compareRange=previous_year&deltas=off` in the URL. It asserts a v2 client gets the third argument, and that the GA4 prior window follows.
  - `v2/provider-section.test.tsx` renders `ProviderSection` both ways. v1 has the old header and no shell. v2 has no old header, `#aeo-section-05`, and a switch that is `aria-disabled` when the comparison is `none`. The `data-export-block` count is equal in both.
  - `ga4/date-picker.test.tsx` covers four cases:
    - a date-only Apply leaves `compareRange` absent, with and without `explicitNone`;
    - `previous_year` survives a date-only Apply;
    - No Comparison writes `none` only with `explicitNone`.
  - `lib/export/request.test.ts` accepts `deltas: 'off'` and `compareRange: 'none'`, and rejects `deltas: 'on' | true | 1`.
- **v1 unchanged:** `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` pass with **no snapshot updated** (none appear in the diff).
- **Suite:** `npm test` 467 files / 6030 tests. `tsc --noEmit` clean, `check:rsc` passes, run on `143a57e0`.
- **Lint:** `npm run lint` reports 71 errors on `dev` and on this branch alike. All are pre-existing (e.g. `scripts/probe-*.ts`), and CI does not run lint (`make check` = typecheck, test, check:rsc, build). The changed files lint clean.
- **Probe, executed:** finding 2's rounding was checked with a throwaway `tsx` call: `formatDelta(±1.5 / ±0.5, 'places')`. Output is in §4.
- **Not run locally:** `next build` (runs in CI on #532), and a live staging render. There is no v2 part yet to render.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `components/report-sections/ga4/date-picker.tsx:107` | Clicking a Compare to option sets `compareTouched` even when the click lands on the value already in effect. Apply then writes that value explicitly, e.g. `compareRange=previous_period` on the Overview, where it was absent. The sidebar carries it to GA4, which reads a missing param as no comparison. Needs a deliberate click, unlike the silent leak fixed in this PR (§4, C1). |
| 2 | ● | CONFIRMED | `components/report-sections/peec-ai/v2/delta.ts:15` | `roundForUnit` uses `Math.round` for places, which rounds .5 toward +∞: +1.5 shows `↑ 2 places`, −1.5 shows `↓ 1 place`. Average-rank deltas can be fractional. No part shows rank deltas yet; slice 2 is the first. |
| 3 | ○ | CONFIRMED | `components/report-sections/peec-ai/v2/delta.ts:49` | `deltaTone`'s `unit` is optional. A caller that leaves it out colors from the raw value and can show a green `0.0 pts`. The only caller today (`deltaColumn`) passes it. |
| 4 | ○ | CONFIRMED | `lib/peec/client.ts:172` | The `priorPositionByModel` JSDoc still says "IMMEDIATELY-PRECEDING period". It now follows `compareMode`. |
| 5 | ○ | CONFIRMED | `components/report-sections/peec-ai/index.tsx:131` | The comment says the two-argument call is "for previous_period"; it also runs for `none`. |
| 6 | ○ | CONFIRMED | `components/report-sections/peec-ai/v2/provider-section.test.tsx:55-76` | The v2 export-block check reads `v1Blocks` set by the previous test, so the tests depend on run order. If run alone it fails loudly (`toBeGreaterThan(0)`), never silently. |
| 7 | ○ | CONFIRMED | `components/report-sections/peec-ai/v2/compare.test.ts:31-32` | The Content Impact `'none'` test re-implements the `!== 'previous_period'` check locally, so that half doesn't exercise `content-impact.tsx:292`. The `deriveCompareRange('none') === null` half is real. |

---

## §4 Detail

**C1 (fixed in this PR, for the record).** The whole-branch review caught this before the PR opened.

*The bug.*
- The first version of the AEO picker seeded Compare to from `compareRange ?? 'previous_period'` (Overview) and used `explicitNone` on every AEO page.
- Apply always wrote the param. So changing **only the date** wrote `compareRange=previous_period` on the Overview, or `compareRange=none` on Content Impact, PR Influence and Technical Audit.

*Why it mattered.*
- The dashboard sidebar carries `compareRange` into Paid Media and Organic Social (`components/layout/sidebar.tsx:354-357`). Bulk export copies it into every exported page (`lib/export/bulk.ts:42`).
- Content Impact would have started comparing, and Paid Search, Meta, LinkedIn and Organic Social would have lost their comparison. That would hit every client, on the page and in bulk PDFs.

*The fix* (`143a57e0`):
- `explicitNone` only on the Overview;
- a display-only `defaultCompare`;
- Apply leaves `compareRange` alone unless Compare to was clicked.

This corrects the design doc's 5.1 claim that "no other section's URLs change". Finding 1 is what remains.

**1. Compare to re-click writes the param.**
- *Mechanism:* `handleApply` checks `compareTouched`, not whether the selection changed.
- *Fix:* write only when `norm(pendingCompare) !== norm(effectiveCompare)`, with `norm = v => v === 'none' ? null : v`.
- *Plus a test:* open the picker, click the highlighted Previous Period, Apply; `compareRange` stays absent.

**2. Places rounding.** Probe output from `npx tsx -e` on `143a57e0`:

```
formatDelta(1.5,'places')  → "↑ 2 places"
formatDelta(-1.5,'places') → "↓ 1 place"
formatDelta(0.5,'places')  → "↑ 1 place"
formatDelta(-0.5,'places') → "0 places"
```

*Fix:* `Math.sign(v) * Math.round(Math.abs(v))` for places, plus tests for ±1.5 and ±0.5. It is assigned to slice 2, the first slice that shows rank deltas (Track A plan).

**3. Optional unit.** *Fix:* make `unit` required, or default it per caller. It is low risk while `deltaColumn` is the only caller. Do it when slice 6 (KPI tiles) adds the second caller.

**4–5. Comments.**
- *4:* "previous period, or the same period last year when `compareMode` is `previous_year`".
- *5:* "for previous_period and none".

**6. Order-dependent test.** Count the v1 blocks inside the v2 test with a fresh render, or move both counts into one `describe` with a `beforeAll`.

**7. Tautological half.** Drop the local `walks` lambda. Either import the real condition, if it's extracted, or keep only the `deriveCompareRange` assertions and say so in the test name.

---

## §5 Follow-ups

Fixes are tracked separately. None are applied here.

| Bucket | Items | Note |
|---|---|---|
| Correctness | 1, 2 | 2 lands with slice 2, before any rank delta is shown. 1 is the highest-value item: one condition and a test, best done in the next slice that touches the picker, or as a small fix PR. |
| Cleanup | 3, 4, 5, 6, 7 | None blocks the ship. 3 goes with slice 6; 4–7 can ride with any later slice. |

**Blocks the ship:** nothing. With C1 fixed, no client's page, cache key or export body changes when #532 merges.
