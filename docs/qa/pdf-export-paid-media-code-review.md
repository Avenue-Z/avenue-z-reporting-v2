# Code Review Record — `feat/pdf-export-paid-media` (PR #352)

| | |
|---|---|
| **Feature under review** | PR #352, `feat(export): Paid Media exports on the server (PDF export PR 3 of 3)` |
| **Diff range reviewed** | `ef1195b..508d299` |
| **Spec** | `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md` (branch `docs/pdf-export-all-reports-spec`) |
| **Plan** | `docs/superpowers/plans/2026-10-09-pdf-export-pr3-paid-media.md` (same branch) |
| **Reviewers** | Paul, Thomas |

The diff range is seven commits on top of PR #350's head (`feat/pdf-export-aeo`), so this record covers Paid Media only. #348 and #350 have their own records (#349, #351).

**This document changes no code.**

| Area | Files |
|---|---|
| Shared table | `components/charts/data-table.tsx` (export branch) |
| Overview | `paid-media/overview/{trend,index}.tsx` |
| Paid Search | `paid-search/{hero,kpi-grid,leads-section,geo-section,keywords-table-client}.tsx` |
| Meta | `meta-ads/{creative-table-client,geo-section}.tsx` |
| LinkedIn | `linkedin-ads/{creative-table-client,geo-section}.tsx` |
| Switch-on | `lib/export/sections.ts` (`'paid-media'`), and the PR 1 tests that named Paid Media as off (now `'ga4'`) |
| Acceptance | `e2e/export/acceptance.mts` (`PM_RUNS`), `e2e/export/pdf-check.ts` (`outsideBox`) |
| Tests | five new export test files, three extended, `vitest.config.ts` pin, the `locked-months-parity` snapshot (2 lines) |

---

## §1 How it works

The export renders the live Paid Media component for the tab, so the following are all the page's own:
- every number;
- the date range and compare range, carried by the request (PR 1);
- the per-client channel setup.

What changes is the view.

**Default view, per tab:**
- **Overview:**
  - The KPI row prints as on the page.
  - The trend prints its default metric (Spend), named as a label, with the channels as a static legend.
  - Each channel row in "By Channel" stays whole.
  - Blended totals follow the existing missing-channel rule (`—`).
- **Paid Search:**
  - The hero prints its default metric (Cost) as a label, on a dark chart panel so its colours read on white.
  - KPI grid, leads chart and each lead category are whole blocks.
  - Geo prints KPIs, the top-regions chart, and the region table (top 10 plus "All Regions", collapsed).
  - Keywords prints its default ≥10-clicks view, labelled "Showing keywords with ≥10 clicks".
- **Meta and LinkedIn:**
  - KPI grid and geo chart print.
  - The creative tree prints its top level (campaigns / campaign groups) and the total, collapsed as on first load.
  - Ad sets, campaigns and ads stay folded.
- **Commentary:** prints on Paid Search, Meta and LinkedIn through `CommentarySection`, as the client's entry (PR 1's `clientEntryId`), so staff and client exports print the same.

**Numbers on paper.** Every figure is the one the live tab shows:
- Spend / Cost, clicks and impressions come from Supermetrics (Google Ads `AW`, Meta `FA`, LinkedIn `LIA`) through each channel's `base.ts`.
- Leads (Paid Search) are counts of the client's configured lead actions (`paid_search_config.leadActions`), summed into Employer / Broker / Contact (`lib/paid-search/leads.ts`).
- The export adds no calculation.

**No controls.** Each of these is absent in export mode, via `useExportMode()`:
- the trend's metric and channel buttons;
- the hero toggle;
- the keyword filter button;
- the creative trees' sort clicks, arrows, chevrons and "?" hints;
- the geo row chevrons.

KPI hover hints were already hidden (PR 2).

**`DataTable`** is the shared chart table: Keywords, plus Organic Social v1 Top Content and the configurable dashboard. Its export branch prints:
- plain headers, with no sort arrow;
- the plain text that `EditableText` would show;
- `data-export-row` on every row.

A table of up to 15 printed rows (total included) is one block. Its live branch is unchanged.

**Page breaks.** These are inert `data-export-*` attributes from PR 2's `export-theme.css`, which this PR does not change:
- **Titles:** `keep-with-next` keeps titles (including the Keywords header row and the Total Leads row) with what follows.
- **Blocks:** `block` keeps KPI grids, charts, geo chart + title, lead categories and short tables whole.
- **Charts:** `chart` keeps the dark panel.
- **Tables:** split only between rows, with the header repeated.

A creative tree with more than 14 top-level nodes (more than 15 printed rows) is not a block. It splits between rows, with the total last.

**Live pages.** There is no behaviour change. Every behaviour branch checks `useExportMode()`, and the attributes are inert outside `.export-theme`. The only snapshot change was `locked-months-parity`'s Paid Media case: its Export PDF button now carries `serverExport`. A probe against `dev` (`e659cfb`), hashing every case with the button removed, came back identical.

---

## §2 Verification method

**Unit, executed:**
- `npx vitest run` 2570/2570, `tsc` clean, `check:rsc` passes, `next build`.
- Lint: no new errors (2 warnings were already there).
- Every new test was run failing first.

**Live acceptance** (`npm run e2e:export`, local production build, live data). **195 checks pass**, re-run green after the fix pass (#7–#10):
- **Scope:** Renaissance Paid Media, all four tabs, each exported as a staff editor and as a client.
- **Each export is checked for:**
  - no controls (`Spend Clicks Paid Search`, `Cost Clicks Impressions Leads`, `Show all`, `Filter ≥10 clicks`, `▸▾`);
  - staff = client (same glyphs, same page starts);
  - content box;
  - Letter landscape;
  - no system fonts;
  - under 4.5 MB.
- **Time to ready:** cold 2.9–11.9 s, warm about 3–4 s.

**Page-by-page review, executed.** Every client PDF was rasterized (40 px contact sheets, 110–200 dpi crops):

| Tab | Pages |
|---|---|
| Overview | 3 |
| Paid Search | 7 |
| Meta | 2 |
| LinkedIn | 3 |

It found one problem, a stranded Keywords title (#3), which was fixed and re-checked. The 13-column creative trees reach a highest right edge of 762.0 pt against the 765.2 pt limit, wrapping between words.

**Final review, executed.** A fresh reviewer read the whole branch against the plan's Review Focus, checking claims against the PDFs. Result: no Critical, one Important (#7), seven Minor. Three Minors were re-graded up and fixed with the Important in `508d299` (#8–#10); the rest are deferred (#11–#14).

**Not verified (flagged):**
- **A continued creative tree.** No local client has more than 15 creative nodes (Renaissance: 3 Meta campaigns, 5 LinkedIn groups), so a tree long enough to continue onto a second page has not been seen live. It rests on #7's unit tests plus PR 2's header-repeat fixture.
- **Printed Paid Media commentary.** No approved Paid Media entries exist locally; this rests on PR 1's `CommentarySection` coverage.
- **A Vercel deploy.** No signed-in export per tab has been run there yet.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| 1 | ○ | CONFIRMED | `paid-search/geo-section.tsx:130` | The plan put `data-export-hide` on `ChevronRightIcon`. It is a wrapping `<span>` instead, because a lucide SVG prop isn't a reliable contract for arbitrary `data-*`. | Ruling: accepted |
| 2 | ○ | CONFIRMED | `lib/organic-social/__snapshots__/locked-months-parity.test.tsx.snap` | The "another section is unchanged" (Paid Media) case failed after switch-on, because the button now carries `serverExport`. | Re-baselined after the probe (§1) |
| 3 | ● | CONFIRMED | `paid-search/keywords-table-client.tsx:61` | Page review: the "Keywords" title row ended a page alone. | **Fixed** `65c75b2`, pinned |
| 4 | ○ | CONFIRMED | `e2e/export/pdf-check.ts:39` | `outsideBox` flagged the `→` in "Region → DMA Breakdown": Noto Sans Math's tall line box sat 0.3 pt past the top margin, though nothing was clipped (200 dpi crop). Symbol-only words are now checked horizontally only. | Ruling: accepted; see #12 |
| 5 | ● | CONFIRMED | `components/charts/data-table.tsx:79` | `DataTable` gains an export branch, which also changes Organic Social v1 Top Content's PDF: no "↓", row markers, whole when ≤15 rows. | Accepted; stated in the PR |
| 6 | ○ | CONFIRMED | `e2e/export/acceptance.mts` | Client choice: Renaissance, the only local client with all three paid channels (`PM_CLIENT` overrides). | Ruling: accepted |
| 7 | ● | CONFIRMED | `meta-ads/creative-table-client.tsx:95`, `linkedin-ads/creative-table-client.tsx:96` | **Final review, Important:** the 15-row block threshold was unpinned. Both export tests used 2 nodes, so dropping or inverting the condition passed CI. | **Fixed** `508d299`: 14- and 15-node tests, total last |
| 8 | ○ | CONFIRMED | both creative tables (`indent(0)`) | Final review: in export the chevron indent (20 px inline) remained, so names sat right of the "Name" header. | **Fixed** `508d299` |
| 9 | ● | PLAUSIBLE | `{paid-search,meta-ads,linkedin-ads}/geo-section.tsx` | Final review: the geo bar chart wasn't a block, so a break inside its panel padding could strand the title over an empty panel strip. Not seen on Renaissance. | **Fixed** `508d299`: title + chart one block |
| 10 | ● | PLAUSIBLE | `paid-search/leads-section.tsx` | Final review: "Leads by Action" + "Total Leads" could end a page alone (the Total row wasn't kept with the first category). | **Fixed** `508d299` |
| 11 | ○ | CONFIRMED | creative tables, Status column | Status is an ad-level field and only the top level prints, so the 13th column is blank on every row. | Follow-up |
| 12 | ○ | CONFIRMED | `e2e/export/pdf-check.ts:39` | The #4 exemption is unbounded vertically and applies to every section's runs, so a lone `—` or emoji cut at the top or bottom edge would go unflagged. | Follow-up |
| 13 | ○ | CONFIRMED | `e2e/export/acceptance.mts:214` | The trend-toggle regex assumes Paid Search is the first channel; a client without Paid Search prints "Spend Clicks Meta" undetected. | Follow-up |
| 14 | ○ | CONFIRMED | `paid-search.export.test.tsx` | The geo chevron check's `every()` could pass vacuously. | **Fixed** `508d299` (asserts 10) |

---

## §4 Detail

**#3: Keywords title.** The header row (title plus the static ≥10-clicks label) had no `keep-with-next`, so on a full page Chromium ended page 5 with it and started the table on page 6.
- **Fix:** `data-export-keep-with-next` on the row.
- **Pinned by:** a test that asserts it.

**#4 / #12: Content-box check.** `outsideBox` compares each word's bounding box with the page's content box. Noto Sans Math's line box is taller than its ink, so a lone arrow at a page top measured `yMin 26.49` against `26.8`.
- **Fix (#4):** symbol-only words (no letter or digit) are checked horizontally only.
- **Suggested follow-up (#12):** allow symbol-only words a bounded extra vertical tolerance (+2 pt) instead of none.

**#5: Organic Social v1 Top Content.** That PDF now goes through `DataTable`'s export branch:
- its sort arrow no longer prints;
- a table of 15 rows or fewer is kept whole;
- its rows split cleanly.

This is an improvement, and the full suite passes. Its own metric toggle still prints as buttons, which predates this PR and is out of scope.

**#7: Creative-tree threshold.** The condition is `sortedCampaigns.length + 1 <= 15` (`sortedGroups` on LinkedIn). In export the open sets are always empty, so this counts exactly what prints: top-level rows plus the total. It matches `DataTable`'s rule.
- **Fix:** tests now pin both sides. 14 nodes print as a block. 15 nodes don't: their 16 rows are all marked, with the total last.

**#9: Geo chart.** `data-export-chart` gives the panel its colours but not `break-inside: avoid`. The title's `break-after: avoid` only protects the gap between title and panel, so a break inside the 24 px padding above the SVG was possible.
- **Fix:** the `<div>` holding the title and chart is now `data-export-block`, in all three geo sections. This also meets spec §7's geo wording.

---

## §5 Follow-ups

**Needs a live call first**
- One signed-in export per Paid Media tab on a Vercel deploy, covering Vercel's Chromium and timing.
- A creative tree with more than 15 rows on live data, to see the split and repeated header.
- Printed Paid Media commentary, once an entry is approved.

**Cleanup**
- **#11:** omit the blank Status column in export, or state that it is intentional.
- **#12:** a bounded vertical tolerance for symbol-only words.
- **#13:** match `Spend Clicks (Paid Search|Meta|LinkedIn)`.

None of these block the ship. The highest-value one is the Vercel run.
