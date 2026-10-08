# Code Review Record — `feat/pdf-export-aeo` (PR #350)

**Feature under review:** PR #350 — `feat(export): AEO exports on the server (PDF export PR 2 of 3)`
**Diff range reviewed:** `b9e9fd0..ef1195b`: eleven commits on top of PR #348's head (`feat/pdf-export-shared-pipeline`), so
this record covers AEO only. #348 has its own record (#349).
**Spec / plan:** `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md`,
`docs/superpowers/plans/2026-10-08-pdf-export-pr2-aeo.md` (branch `docs/pdf-export-all-reports-spec`).
**Reviewers:** Paul, Thomas.
**This document changes no code.**

| Area | Files |
|---|---|
| Tables | `components/report-sections/peec-ai/sortable-table.tsx` (export branch) |
| Hints | `components/ui/info-tooltip.tsx` (null in export) |
| Charts | `peec-ai/{visibility-chart,slope-chart,bot-vs-human-scatter}.tsx`, `pr-influence-tables.tsx` (cluster chart) |
| Overview | `peec-ai/provider-tabs.tsx`, `peec-ai/parts/export-layout.ts`, `peec-ai/index.tsx`, the table/card leaves |
| PR Influence | `pr-influence-tables.tsx`, `sentiment-insights{,-section}.tsx`, `synopsis-skeleton.tsx` |
| Content Impact | `content-impact.tsx`, `content-impact-tables.tsx` |
| Technical Audit | `technical-audit{,-tables}.tsx`, `section-header.tsx` |
| Switch-on | `lib/export/sections.ts` (`'peec-ai'`), the PR 1 tests that named AEO as off |
| Theme | `app/export/export-theme.css`, its test; `app/export/[clientSlug]/[section]/page.tsx` (Noto Sans Mono) |
| Tests | five new export test files, two extended, the acceptance script, AEO goldens re-baselined (attributes only) |

---

## §1 How it works

**What prints, per tab.** The export renders the live AEO component, so the numbers, filters and per-client part setup are
the page's. What changes is the view:

- **Default view.** `SortableTable` prints its default sort and first `initialPageSize` rows (all rows where none is set),
  then "Showing N of M" when rows are cut.
  - **Overview:** the first provider, labelled "Peec AI" when a client has two (the export browser has no saved choice).
  - **Visibility chart:** prints weekly.
  - **Slope chart:** prints AI Referral Traffic, named as a label.
  - **Sentiment:** themes print collapsed.
  - **Filters:** the page's date range and model filter carry over through the request (PR 1).
- **No controls.** Sort, filter and "See all" controls, provider tabs, chart toggles, theme buttons and "?" hints are
  absent in export mode.
- **Commentary.** It prints through `SharedPartsHeader` on Overview, PR Influence and Content Impact, as the client's
  entry (PR 1's `clientEntryId`).

**Page breaks.** These are inert `data-export-*` attributes, acting only under `.export-theme`:
- **Titles:** `keep-with-next` keeps a title (and its description: `break-inside: avoid`) with what follows.
- **Blocks:** `block` keeps a card, KPI grid or chart whole.
- **Charts:** `chart` keeps a chart's dark panel.
- **Tables:** a table splits only between rows (`data-export-row`), and its header row repeats (`thead` unbreakable). A
  table of up to 15 printed rows is one block.
- **Overview parts:** each pages by `parts/export-layout.ts`, held to the registry by a test; an unknown part is wrapped.
- **Scroll boxes:** live scroll boxes (`data-export-scroll`) print in full.
- **Truncation:** truncated text wraps (`data-export-wrap`, `[data-export-table] .truncate`).

**On paper.** Wide tables wrap between words with 9/11 px cells. Bright brand text colours (`#60FF80`, `#FF4444`,
`#FFFC60`, `#60FDFF`, `#39A0FF`, as classes and inline styles) are darkened outside chart panels. `font-mono` text uses
Noto Sans Mono, loaded by the export page.

**Live pages.** No behaviour changes: every behaviour branch checks `useExportMode()`. The attributes added to live
markup are inert, and the AEO goldens gained 35 `data-export-*` attribute lines and nothing else.

---

## §2 Verification method

- **Unit, executed:**
  - `npx vitest run` 2548/2548, `tsc` clean, `check:rsc` passes, `next build`.
  - Lint: no new errors; 10 `prefer-const` errors in `content-impact.tsx` / `technical-audit.tsx` are identical on `dev`.
  - Every new test was run failing first.
- **Golden proof, executed:** after `-u`, a script compared the snapshot diff line by line. Every removed line had to
  reappear with only `data-export-*` attributes stripped, and every other added line had to be a lone `data-export-*`
  attribute. Result: 23 lines in `4ec8550`, 12 in `f1875f1`, 0 lines changed.
- **Acceptance fixtures, real Chromium 153, each RED before its fix:**
  - A 60-row table, starting low on the page: rows whole, title with its first rows, header on every page (header
    repeated only after `thead { break-inside: avoid }`).
  - A title block with a description in a flex card: never split (`1/2/2` → `2/2/2` after `break-inside: avoid` on kept
    titles). Two earlier hypotheses, flex layout and nested flex, were disproved with fixtures first.
- **Live acceptance** (`npm run e2e:export`, local production build, live data, Node 26.7.0): **143 checks pass.**
  - AEO for avenue-z (all four tabs, Peec and Profound) and Renaissance (Overview and PR Influence), each as a staff
    editor and as a client.
  - Each checked for:
    - no table or chart controls;
    - staff = client (same glyphs, same page starts);
    - content box;
    - Letter landscape;
    - no system fonts;
    - under 4 MB.
  - **Time to ready:** cold 2.8–19.1 s (worst avenue-z Overview), warm 1.2–2.2 s.
- **Page-by-page review, executed:** every AEO client PDF rasterized (40-px contact sheets, 90-px crops) after each
  build. It found:
  - titles split from descriptions (#3);
  - Menlo, a system font (#4);
  - words broken in wide tables (#5);
  - pale brand colours (#6).

  All were fixed and re-checked.
- **Final review, executed:** a fresh reviewer on the whole branch with the plan's Review Focus. It found 1 Critical and
  5 Important (#7–#12), all fixed in `f1875f1` with tests that failed first, and 5 Minor (#13–#17), deferred.
- **Not verified (flagged):**
  - The sentiment export form on live data: no client had classified sentiment this period, so it's unit-tested only.
  - Vercel's Chromium for the header-repeat behaviour.
  - One signed-in export per AEO tab on a Vercel deploy.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed,
external trigger unverified).

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| 1 | ● | CONFIRMED | `export-theme.css` (tables) | Chromium 153 repeats a table's header row on later pages only when the `thead` may not break. | **Fixed** `6d189b6`, pinned |
| 2 | ○ | CONFIRMED | `provider-tabs.tsx` | The restore-saved-provider effect read `localStorage` in export mode. | **Fixed** `f68c5b6`: skipped in export |
| 3 | ● | CONFIRMED | `export-theme.css` (`keep-with-next`) | A card title's description started the next page: the split was inside the kept title block. | **Fixed** `321c983` |
| 4 | ● | CONFIRMED | Technical Audit `font-mono` | Monospace text embedded Menlo, a system font the server lacks. | **Fixed** `321c983`: Noto Sans Mono |
| 5 | ● | CONFIRMED | wide tables | `overflow-wrap: anywhere` broke words, squeezing columns to a letter wide. | **Fixed** `321c983` |
| 6 | ○ | CONFIRMED | AEO text colours | Bright brand text (deltas, the client's cyan row, yellow badges, inline stat values) was unreadable on white. | **Fixed** `321c983` |
| 7 | ● | CONFIRMED | `pr-influence-tables.tsx` (Top Editorial Domains) | **Final review, Critical:** the live 320 px scroll box printed, cutting the 9th row and hiding the rest. | **Fixed** `f1875f1`: 15/15 rows |
| 8 | ● | CONFIRMED | `winners-losers-cards.tsx` | Final review: the 400 px scroll box printed 10 of up to 20 rows, the 10th cut. | **Fixed** `f1875f1` |
| 9 | ○ | CONFIRMED | `sortable-table.tsx` | Final review: "a table short enough for a page is one block" (spec §5) had been dropped. | **Fixed** `f1875f1` (≤ 15 rows) |
| 10 | ● | CONFIRMED | truncated cells | Final review: `truncate` spans printed "…" and lost their text (`title=` is hover-only). | **Fixed** `f1875f1` |
| 11 | ○ | PLAUSIBLE | `sentiment-insights.tsx` | Final review: theme rows printed as buttons with a "Click a theme" hint, and were breakable. | **Fixed** `f1875f1`; no live data to view |
| 12 | ○ | CONFIRMED | tests | Final review: the sort test could pass sliced-before-sorted; `rowClassName`/`render` untested in export. | **Fixed** `f1875f1` |
| 13 | ○ | CONFIRMED | `export-theme.css` (`#FF4444`) | Organic Social's negative KPI deltas now print `#b91c1c` (the remap also hits `kpi-card` / `metric-delta`). | Accepted; stated in the PR |
| 14 | ○ | PLAUSIBLE | `export-theme.css` (inline colours) | `[style*="color:#…"]` also matches `border-color`; `background-color:#60FF8033` defeats the exclusion. | Follow-up |
| 15 | ○ | PLAUSIBLE | `provider-tabs.tsx` | The "Peec AI" label has no keep-with-next. | Follow-up |
| 16 | ○ | CONFIRMED | `visibility-chart.tsx` | The granularity is named only when `brandName` is set. | Follow-up |
| 17 | ○ | CONFIRMED | `e2e/export/acceptance.mts` | Time to ready is logged, not enforced at 30 s. | Follow-up |
| 19 | ○ | CONFIRMED | `sortable-table.export.test.tsx` | CI's RSC boundary check (`scripts/check-rsc-props.ts`) read the new test file as a Server Component passing `rowKey` to `SortableTable`; `check:rsc` was not in the local verification. | **Fixed** `ef1195b` (`'use client'`) |
| 18 | ○ | CONFIRMED | plan | Review Focus 1 named "PR placements" as the 100-row table; it is Top Editorial Domains (#7). | Plan naming error |

---

## §4 Detail

**#1 — Header rows.** Chromium's table fragmentation repeats a `table-header-group` only if that section is unbreakable.
The fixture showed the header on page 1 only, and on pages 1–4 with `thead { break-inside: avoid }`.

**#3 — Title blocks.** `break-after: avoid` keeps a block with its next sibling but lets the block itself split.
AEO's titles carry a description, and Chromium broke between them. `break-inside: avoid` on kept titles fixes it, and the
fixture pins it.

**#7, #8 — Scroll boxes.** The spec's "scroll containers become visible" rule had been implemented only for
`SortableTable`'s own root. Two cards wrap their lists in a capped box. Both now carry `data-export-scroll`, which the
theme lifts. A containment test fails if a scroll box in those cards is unmarked.

**#13 — Organic Social red.** The remap's selector is the Tailwind class, so it reaches every export, including Organic
Social's KPI deltas. Darker red is more legible on paper and matches the existing green remap. *Accepted.*

**#14 — Inline-style selectors.** They work for the inline colours AEO uses today (verified on Technical Audit's stat
values). *Suggested:* match `color:` only at the start of the attribute or after `;`, and compare hex exactly, if a
component adds a tinted background with bright text.

---

## §5 Follow-ups

**Needs a live call first**
- One signed-in export per AEO tab on a Vercel deploy (header repeat on Vercel's Chromium, timing on Vercel).
- Sentiment's export form, once a client has classified sentiment in the period.

**Cleanup**
- #14 inline-style selector precision; #15 provider label keep-with-next; #16 visibility granularity without a brand
  name; #17 enforce the 30 s time-to-ready in acceptance.
