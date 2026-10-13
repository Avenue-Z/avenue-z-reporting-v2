# Code Review Record — `feat/pdf-export-dark` (PR #380)

**Feature under review:** PR #380, `feat(export): PDFs print dark, edge to edge, like the reporting page`

**Diff range reviewed:** `4253153..9fefdce`, eight commits on `dev`. No unrelated code.

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-export-dark-design.md`
**Plan:** `docs/superpowers/plans/2026-10-13-pdf-export-dark.md`
Both are on branch `docs/pdf-export-all-reports-spec`.

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| Page | `lib/export/render-pdf.ts` (`EXPORT_PAGE_CSS`, `page.pdf()` options), `app/export/[clientSlug]/[section]/page.tsx` |
| Theme | `app/export/export-theme.css` (fonts and layout only) |
| Markers | `data-export-chart` removed from 13 components, `data-export-bars` from 2, and the Paid Search hero's export-only panel; their tests; AEO goldens |
| Checks | `e2e/export/pdf-check.ts` (`cornerLevels`, `judgeCorners`, `lightCorners`), `e2e/export/acceptance.mts`, `e2e/export/measure.mts` (new) |

---

## §1 How it works

**Why.** The server export printed on white paper and kept each chart on a dark panel, because brand colours are unreadable on white. The stakeholder asked for the whole PDF to look like the dark reporting page.

**The page.**
- `EXPORT_PAGE_CSS` (`render-pdf.ts:13`) is the PDF page: `@page { size: 11in 8.5in; margin: 0.4in; background: #000 }`, plus a black `html, body`.
- The export page renders it inline (`page.tsx:58`), and so do the acceptance fixture pages.
- `page.pdf()` passes `preferCSSPageSize: true` with no `margin`, `width` or `height` (`render-pdf.ts:145`):
  - a `margin` option prints white;
  - `width`/`height` alongside it shrank pages holding a wide chart to about 70% (#4).
- Only `@page`'s background paints the margins; the black `html, body` alone leaves a white frame (reviewer's probe).
- The content box is unchanged at 979 × 739, so every page-break decision is too.

**The theme.** `export-theme.css` keeps the fonts (Noto fallbacks) and the layout rules: blocks, keep-with-next, tables paging between rows with repeated headers, scroll boxes lifted, truncation un-done, hidden controls. Every white-paper re-colouring rule is gone (surfaces, text, inline colours, borders, chart panels, CRM bars), so components print in their live colours.

**Leftovers removed.** The markers that only served white paper (`data-export-chart`, `data-export-bars`) and the Paid Search hero's export-only panel are gone, with their comments. AEO goldens lose exactly 4 lines, each `data-export-chart=""`, and gain none.

**The check.**
- `lightCorners(file)` rasterises each page at 10 dpi (`pdftoppm -gray`) and reads the four corner levels (`cornerLevels`).
- `judgeCorners` fails unless every page was imaged and every corner is near-black (≤ 16; real margins measure 0).
- The acceptance run applies it to every export PDF and to the fixture and 60-row table PDFs.
- `measure.mts` applies the same checks (Letter landscape, dark corners, full width) to downloaded PDFs, for the Vercel preview.

**Leak safety.**
- `@page` exists only inline on the export page (an RSC) and the fixtures, never in a stylesheet; the theme test pins it out of `export-theme.css`.
- `render-pdf.ts` is imported only server-side.
- The live light theme (`:root[data-theme="light"]`) can't reach the export: `ThemeToggle` isn't mounted, and the export's `html, body` rule is `!important`.

---

## §2 Verification method

- **Spike, executed** (local Chrome 146, the real `page.pdf()`). Four approaches:
  - `page.pdf` margins: white frame;
  - no margin plus padding: continuation pages start flush;
  - `box-decoration-break: clone`: works;
  - **CSS `@page` with background: works and keeps the content box.** Chosen.
- **Unit, executed:**
  - `npx vitest run`: 2665/2665. `tsc` clean, `check:rsc` passes.
  - Lint: no changed file has more errors than on `dev`.
  - Every new or changed test ran RED first.
- **Golden proof, executed:** the snapshot diff has 4 removed lines, all exactly `data-export-chart=""`, and 0 added.
- **Live acceptance, executed** (local production build, Chrome 146): **274 checks pass**.
  - The checks include "every page dark to its edges" on all 31 export PDFs and on the fixture and table PDFs (continuation pages included).
  - Every export prints at full width: the narrowest stamp ends at 762.7 pt.
- **Two regressions found by the live run, then fixed and re-verified:** see #3 and #4.
- **Page-by-page review, executed:** contact sheets of Organic Social (Renaissance and A Place for Mom, 16 pp), AEO (Overview and Technical Audit, 11 pp), Paid Search and the Executive Overview (11 pp).
  - Black to the edges, consistent dark surfaces, no white panels, no stranded titles.
  - A 110 dpi crop showed legible muted text and borders, with the margin kept on a continuation page.
- **Final review, executed.** A fresh reviewer rasterised all 31 PDFs (the margin band measured 0 everywhere) and ran its own Chrome probe. It found 0 Critical, 1 Important and 7 Minor; five Minors were re-graded and fixed in `9fefdce`.

**Not verified (gate before merge):**
- **Chromium 153.** Production runs `@sparticuz/chromium` 153 (headless shell). A linux/amd64 container couldn't start it on Apple silicon, and signing in on deployed environments is off limits for me. The gate is a signed-in export on this PR's Vercel preview, measured with `e2e/export/measure.mts` (§5).
- **Two things never printed locally:** KPI Check-In (no acceptance export includes it) and the Executive Overview CRM bars (local Salesforce 403). Both are now byte-for-byte live markup with no theme rule touching them, and both are folded into the preview check.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| 1 | ● | CONFIRMED | `render-pdf.ts:145`, `:13` | Production's Chromium 153 (headless shell) is untested. If it ignored `@page` background or handled `preferCSSPageSize` differently, PDFs would get a white frame or print shrunk. | **Passed** on the Vercel preview, 2026-10-13 (§6) |
| 2 | ○ | CONFIRMED | `structure.export.test.tsx` | A test read the theme's CRM-bar rules that Task 2 deleted. | Removed in Task 2 (ruling) |
| 3 | ● | CONFIRMED | `e2e/export/acceptance.mts` | Fixture pages (no `@page`) printed portrait with no margins once `page.pdf` stopped setting them. | **Fixed** `e6cf0f9`: one shared `EXPORT_PAGE_CSS` |
| 4 | ● | CONFIRMED | `render-pdf.ts:145` | `width`/`height` plus `preferCSSPageSize` shrank the A Place for Mom and PR Influence pages to about 70% (stamp 532/523 pt). | **Fixed** `39e63ac` (reverses the `e6cf0f9` fallback); measured 532 / 762.7 / 762.7 |
| 5 | ● | CONFIRMED | `pdf-check.ts:109-150` | The corner check could pass without testing anything: no images, a misparse giving NaN, an unbounded header loop. Its limit of 40 let a `#272727` card count as dark. | **Fixed** `9fefdce` |
| 6 | ○ | CONFIRMED | `acceptance.mts` | The fixtures didn't run the corner check. | **Fixed** `9fefdce` |
| 7 | ○ | CONFIRMED | `export-theme.test.ts` | `@page` wasn't pinned out of the shared theme. | **Fixed** `9fefdce` |
| 8 | ○ | CONFIRMED | 3 components, 2 tests | Stale "dark panel / unreadable on white" comments; a detached test comment. | **Fixed** `9fefdce` |
| 9 | ○ | CONFIRMED | `technical-audit.tsx:411` (on `dev`, from #362) | `react/no-unescaped-entities` on "there's" in JSX text. | Out of range; follow-up |

---

## §4 Detail

**#1: Why the preview check is a measurement.** The ~70% shrink (#4) was visible only when measured. A white frame could be missed by eye too. `measure.mts` runs the acceptance's own assertions on any PDF:
- every page 792 × 612;
- `lightCorners` empty;
- the stamp ending past 757 pt.

It passes the dark PDFs and fails a white-version Executive Overview PDF on all 5 pages.

**#4: Why no `width`/`height`.** Puppeteer always sends paper dimensions. With `preferCSSPageSize` the CSS size should win, but passing them explicitly changed Chromium's fit-to-page scaling for a page whose single-bar chart briefly measures wider during print layout. Measured on the A Place for Mom export:

| `page.pdf` options | Stamp ends at |
|---|---|
| `width`/`height` + `preferCSSPageSize` | 532 pt |
| old margins | 762.7 pt |
| `preferCSSPageSize` alone | 762.7 pt |

`preferCSSPageSize` alone keeps every page dark to its edges.

---

## §5 Follow-ups

**Gate before merge (needs a signed-in export): passed, see §6**
- On PR #380's Vercel preview, download these exports:
  - AEO Technical Audit;
  - A Place for Mom Instagram;
  - an Organic Social export with KPI Check-In;
  - the Executive Overview for a client with Salesforce connected.
- Run `npx tsx e2e/export/measure.mts <pdfs…>`. Every line must read `ok`.
- Record the output on the PR.
- If it fails, the spec's `box-decoration-break: clone` fallback is new code: tests first, then a fresh review.

**Cleanup**
- #9: escape the apostrophe in `technical-audit.tsx:411` (from #362).

---

## §6 Preview check (Chromium 153): passed, 2026-10-13

Paul exported four PDFs signed in on PR #380's Vercel preview, and they were measured with `npx tsx e2e/export/measure.mts`. Every PDF's metadata reads `Producer: Skia/PDF m153`: the deployed `@sparticuz/chromium` 153.

| PDF | Pages | Letter landscape | Dark to every edge | Stamp end (> 757 pt) |
|---|---|---|---|---|
| Avenue Z – Technical Performance | 7 | ✅ | ✅ | 762.7 pt |
| A Place For Mom – Instagram | 6 | ✅ | ✅ | 762.7 pt |
| Joy of Life – Instagram | 6 | ✅ | ✅ | 762.7 pt |
| Renaissance – Executive Overview | 5 | ✅ | ✅ | 762.7 pt |

All 24 pages were viewed: black to the edges, with consistent dark surfaces, and continuation tables intact. #1 is resolved, and the `box-decoration-break` fallback is not needed.

**Still unprinted** (plain live markup, low risk):
- KPI Check-In: wanted in one Organic Social overview export before production.
- The Executive Overview CRM sections: Salesforce doesn't load on the preview either.

