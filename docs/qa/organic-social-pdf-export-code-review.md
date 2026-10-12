# Code Review Record — `feat/organic-social-pdf-export` (PR #320)

**Feature under review:** PR #320 — `feat(export): dated, stamped PDF export on dashboard + portal`
**Diff range reviewed:** `0b5a0a9..4a62416` (the three feature commits `9139d53`, `4cf432b`,
`4a62416` on top of `dev` at `0b5a0a9`). No unrelated code is in scope.
**Reviewers:** Paul, Thomas.
**This document changes no code.** Fixes found during review were applied on the feature branch
(`4cf432b`, `4a62416`) and are recorded here with status; open items are in §5.

Files in scope:

| File | Change |
|---|---|
| `components/export-pdf-button.tsx` | props `clientName`/`pageTitle`/`periodLabel`; `beforeprint` stamp + `document.title`, restored on `afterprint` |
| `lib/export-period.ts` | new — `exportPeriodLabel()`, a non-throwing `formatResolvedRange` |
| `app/portal/[clientSlug]/reports/page.tsx` | button gets props; `usesPageRange` gates the period |
| `app/dashboard/[clientSlug]/reports/page.tsx` | button added (staff had none); same props and gate |
| `components/layout/sticky-report-header.tsx` | print: title shown after a scroll, keeps its width, row wraps |
| `components/report-sections/organic-social/sortable-top-content.tsx`, `post-card.tsx` | print: card row wraps, cards a quarter of the row |
| `lib/organic-social/locked-months-parity.test.tsx` (+ `.snap`) | pins `Date`; snapshot carries the button's new props |
| `components/export-pdf-button.test.tsx`, `lib/export-period.test.ts`, `lib/export-period.pages.test.tsx`, `components/layout/sticky-report-header.test.tsx`, `sortable-top-content.test.tsx` | new / extended tests |
| `vitest.config.ts` | the four new test files added to the CI include allowlist |

`app/globals.css` was changed in `9139d53` and returned to base in `4a62416` (finding #1): it is
unchanged across the full range.

---

## §1 How it works

**What Export PDF is.** It is the browser's own print-to-PDF of the page in front of you
(`window.print()`), styled by the `@media print` block in `app/globals.css` (sidebar hidden, white
page, `.no-print` and buttons hidden). Nothing is rendered server-side; what prints is what the page
shows, laid out at paper width. This PR does not change that model.

**The stamp — where each part comes from.**

- **"Exported Oct 6, 2026, 10:17 AM"** is the viewer's clock at the moment of printing, written into
  a print-only `<p>` on the browser's `beforeprint` event (`components/export-pdf-button.tsx:31`).
  `beforeprint` fires for the button **and** for Cmd+P, so both stamp. It is written straight to the
  DOM, not through React state, because the print layout is taken right after the event, before a
  state update would commit.
- **"Reporting period Sep 6 – Oct 5, 2026"** is the range the page actually served its sections:
  `servedDateRange` (`app/portal/…/page.tsx:232`, `app/dashboard/…/page.tsx:185`) — the URL's
  `dateRange`, or the locked month when locked months are on — formatted **on the server** by
  `exportPeriodLabel` → `formatResolvedRange` (`lib/date-range.ts:108`), the same resolver the data
  queries use. So for `last_30_days` the stamp shows the same dates the numbers were fetched for;
  resolving it in the browser instead could put a US-evening export a day off the data (server UTC).
- **When no period is shown.** Only where the page range applies, which is exactly where the header
  shows a date picker. `usesPageRange` (`portal/page.tsx:252`, `dashboard/page.tsx:235`) mirrors
  each page's picker conditions; Executive Overview (hard-codes `last_30_days`,
  `components/report-sections/executive-overview/index.tsx:49-50`), Request a Report, the Pacing
  pages and dashboard Search Console get `periodLabel = null`, and the stamp is just the export time.
  `lib/export-period.pages.test.tsx` walks both real routes and holds *period stamped ⇔ picker shown*.

**The filename.** Chrome names a saved PDF after `document.title`. On `beforeprint` the button sets
it to `<client name> – <page title> – <YYYY-MM-DD>` (`export-pdf-button.tsx:35`, the viewer's local
date) and restores the saved original on `afterprint` (`:38`). The original is captured with `??=`
(`:34`) so a second `beforeprint` before an `afterprint` cannot save our own title as "the original";
unmounting mid-print restores it too (`:46`).

**Print layout (what the PR changes, and only this).**

- *Header after a scroll:* the sticky header collapses its title to `max-h-0 opacity-0` on scroll, so
  a scrolled export printed with **no title** (base behaviour, reproduced). In print the title block
  is `max-h-none opacity-100`, keeps its width (`basis-auto shrink-0`), and the row wraps
  (`sticky-report-header.tsx:70,81`), so the stamp in the actions slot drops below a long title rather
  than clipping it. The header stays **sticky** in print (finding #2).
- *Organic Social Top Content:* each platform row is a horizontal scroller; in print it wraps
  (`sortable-top-content.tsx:60`) and each card is `calc(25% - 9px)` wide (`post-card.tsx:59` — a
  quarter of the row less its share of three `gap-3` = 12px gaps), so **every card on the carousel's
  current page** (up to 15 per platform) prints, four across. Posts beyond that page ("1–15 of 17")
  are not in the PDF, as they are not on the page.

**Why the PDF looks "shrunk" on some sections (load-bearing, not obvious).** When anything on the
page is wider than the paper, Chrome lays the page out wider and scales the whole thing down to fit.
Today the Recharts charts (sized to the on-screen width) are that wide thing, so every section with a
chart prints shrunk-to-fit — which is also what keeps its wide tables whole and its pages dense. This
PR deliberately leaves that alone (finding #1).

---

## §2 Verification method

- **Unit / route tests (executed):** `npx vitest run` 2107/2107, `npx tsc --noEmit` clean. New tests
  were each watched failing before the code existed. The title-restore, `??=` guard, unmount cleanup
  and period⇔picker tests were then **mutation-checked**: the code was broken on purpose (guard
  removed; restore removed; listener cleanup removed; dashboard Search Console exclusion removed) and
  the matching test failed each time.
- **Parity snapshot (executed):** `locked-months-parity` now pins `Date`. To prove the pin changes
  nothing else, the test was run with the *base* pages + the pin against the *old* snapshots: 9/9
  matched. The accepted snapshot diff is only `ExportPdfButton`'s new props (and the dashboard's new
  button node).
- **End-to-end in real Google Chrome (executed):** a Playwright-driven, headed Google Chrome with
  `--kiosk-printing` and "Save as PDF" preselected, so a real click on **Export PDF** goes through
  Chrome's own print pipeline and saves the file. Session: a locally minted Renaissance
  `CLIENT_VIEWER` cookie (the repo's `mintServiceCookie` shape), production builds (`next build` +
  `next start`) of base `0b5a0a9` and the branch, live Renaissance data. Seven pages — Executive
  Overview, Paid Media overview / Meta / LinkedIn / Paid Search, AEO, Organic Social — each exported
  after scrolling 900px, and Exec + Organic Social also unscrolled; PDFs compared page by page.
- **Bisecting (executed):** to attribute the blank Executive Overview card (finding #2), real-Chrome
  exports were repeated with an injected stylesheet undoing one print rule group at a time.
- **Not verified (flagged, not asserted):** the normal (non-kiosk) Chrome print dialog with a human
  click (finding #9); Safari / Firefox; the client's original failing PDF (never obtained).

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `app/globals.css` (as of `9139d53`) | Global print CSS scaling Recharts charts to the page removed the overflow that makes Chrome shrink-to-fit, regressing every charted section: tables sliced (Paid Search, Meta, LinkedIn), Paid Search 4 → 8 pages. **Fixed `4a62416`** (dropped). |
| 2 | ● | CONFIRMED | `components/layout/sticky-report-header.tsx` (as of `9139d53`) | `print:static` on a scrolled header printed the Executive Overview summary card blank. **Fixed `4a62416`**; a test forbids `print:static`. |
| 3 | ● | CONFIRMED | `app/portal/…/page.tsx:252`, `app/dashboard/…/page.tsx:235` | The stamp stated the page `dateRange` on sections that ignore it (Exec Overview hard-codes last 30 days) — a carried-over `?dateRange=last_month` stamped "Sep 1 – Sep 30" over last-30-day numbers. **Fixed `4cf432b`** + route invariant test. |
| 4 | ● | CONFIRMED | `lib/export-period.ts:6` | A malformed `?dateRange=` (`custom:junk`, `custom:2026-13-45,x`) makes `formatResolvedRange` throw; called in the page, outside the sections' error boundaries, it would 500 the page. **Fixed `9139d53`** (`null` → stamp omits the period). |
| 5 | ● | CONFIRMED | `components/export-pdf-button.tsx:34,46` | `document.title` is shared state: a second `beforeprint` before `afterprint` would save our title as the original; unmount mid-print would leave it changed. **Fixed `9139d53`**, tested. |
| 6 | ○ | CONFIRMED | `components/layout/sticky-report-header.tsx:70,81` | The stamp in the actions slot squeezed long titles, clipped by `overflow-hidden` ("META ADVERTIS…"). **Fixed `4a62416`** (title keeps width, row wraps). |
| 7 | ● | PLAUSIBLE | report sections' Suspense fallbacks | Exporting while a section is still loading prints its placeholder: one Paid Media overview export captured empty boxes after network-idle + no pulsing skeleton + 3s. **Pre-existing; a credible mechanism for the client's "graphs don't show".** Not addressed (§5). |
| 8 | ● | CONFIRMED | `components/charts/line-chart.tsx` (`ResponsiveContainer`) | The Organic Social engagement chart is still cut at the right edge in print (base behaviour, unchanged — see #1 for why the CSS fix was dropped). |
| 9 | ○ | PLAUSIBLE | `components/export-pdf-button.tsx:31,35` | When the DOM changes during printing, Chrome regenerated the print; under `--kiosk-printing` that saved 2–4 copies per click. Observed only with DOM still changing (#7). Normal print dialog not verified. |
| 10 | ○ | CONFIRMED | `post-card.tsx:59` | `calc(25% - 9px)` encodes the row's `gap-3` (12px); changing the gap breaks four-across in print. |
| 11 | ○ | CONFIRMED | page titles | Paid Media's overview page title is "Overview", so it saves as `Renaissance – Overview – …` — ambiguous outside the app. |
| 12 | ○ | CONFIRMED | `app/{portal,dashboard}/…/page.tsx` | `usesPageRange` restates each page's picker conditions; drift is caught by `lib/export-period.pages.test.tsx`, but it is one more duplicated branch across the two routes (existing tech debt: the two routes duplicate the report-render switch). |
| 13 | ○ | PLAUSIBLE | `export-pdf-button.tsx:31` | The export time is the viewer's local time with no zone; a client in another timezone reads it in theirs. |
| 14 | ○ | CONFIRMED | `vitest.config.ts` | Pre-existing: `lib/date-range.test.ts` is not in the include allowlist, so `resolveDateRange` / `formatResolvedRange` tests never run in CI. Filed separately. |

---

## §4 Detail

**#1 — Global chart-scaling print CSS regressed other sections.**
Mechanism: Recharts' `ResponsiveContainer` fixes the chart at its measured on-screen width; a real
print lays out at paper width without re-measuring, so the chart overflows the page. Chrome responds
to page overflow by laying the page out wider and scaling it down — which also keeps tables inside
`overflow-x-auto` containers whole and pages dense. `9139d53` capped `.recharts-wrapper` at
`max-width:100%` (svg `viewBox` scaling); with no overflow left, the shrink stopped, tables sliced and
page counts doubled. AEO, which has no Recharts chart, was unchanged (7 → 7) — the control that pins
the mechanism. *Fix applied (`4a62416`):* rules removed; `app/globals.css` equals base.

**#2 — Unsticking the header blanked the Executive Overview card.**
Mechanism (attribution, not root cause): with the page scrolled, a `print:static` header printed the
summary card's frame empty; the card is identical on screen in both builds, and an unscrolled export
prints it. Real-Chrome bisect: undoing the chart rules or the label rules alone left it blank; undoing
only `print:static` restored it. Why Chrome drops that card's content is not established. *Fix applied
(`4a62416`):* `print:static` removed; `sticky-report-header.test.tsx` asserts it stays absent.

**#3 — Period stamped where the page range doesn't apply.**
Mechanism: `getReportComponent` passes `dateRange` to some sections only; Executive Overview, Request
a Report, Email Marketing and others take none, GA4 Pacing / dashboard Search Console ignore it, yet
the stamp used `servedDateRange` everywhere. *Fix applied (`4cf432b`):* `usesPageRange` per page,
mirroring that page's picker conditions; the route test fails on any section where stamp and picker
disagree (mutation-checked).

**#4 — Malformed range threw in the page.** `resolveDateRange('custom:junk')` calls `.trim()` on
`undefined` (`lib/date-range.ts:49`); `custom:2026-13-45,x` yields an Invalid Date that `date-fns`
`format` throws on. Sections already call these inside their error boundaries; the page did not.
*Fix applied (`9139d53`):* `exportPeriodLabel` catches → `null`. The throw in `date-range.ts` itself
is left for #14's follow-up.

**#5 — Title restore.** *Fix applied (`9139d53`):* `savedTitle ??= document.title`; effect cleanup
calls `after()`; tests cover double `beforeprint` and unmount.

**#6 — Clipped titles.** The title block is `flex-1 min-w-0 overflow-hidden`; a long stamp in the
`shrink-0` actions slot took its width. *Fix applied (`4a62416`):* in print the title is
`basis-auto shrink-0` and the row `flex-wrap`, so the stamp wraps.

**#7 — Export while loading (lead for "graphs missing").** In one real-Chrome run the first saved PDF
of Paid Media's overview had the title and stamp but empty boxes where the KPIs and trend go; later
copies, regenerated as data arrived, had them. The harness had waited for network idle, no
`.animate-pulse`, and 3s. A client clicking Export as soon as the page looks done would get the same.
Not caused by this PR; not fixed here. *Suggested fix:* disable Export (or show "still loading") while
any section's Suspense fallback is mounted, e.g. a fallback that registers itself and a button that
reads the count. Confirm first by asking the client for their PDF.

**#8 — Organic Social chart clipped.** Unchanged from production. A real fix needs a deterministic
print layout (fixed print width + scale, or server-side rendering) — a design, not a CSS rule.

**#9 — Print regeneration.** *Suggested check:* in normal Chrome, on the preview deploy, click Export
PDF once on a fully loaded page and confirm one dialog, one save.

**#10–#13.** Recorded; no change in this PR (see §5).

**#14.** Filed as its own task ("Register lib/date-range.test.ts with vitest").

---

## §5 Follow-ups

**Correctness**
- **#7 — Export while loading** (highest value: the most credible explanation for the client's
  report). Gate Export on all sections having loaded. Ask the client for the failing PDF first.

**Needs a live check first**
- **#9** — one manual Export in the normal Chrome dialog on the preview deploy (Paul, ~1 min). Blocks
  the ship only if it shows more than one save per click.

**Decide together**
- **#8 — Deterministic print layout** (fixed print width + scale, or server-side PDF rendering, which
  would also enable automatic dated archives). Separate spec.
- **#11** — filename for subsection pages (e.g. `Renaissance – Paid Media Overview – …`).
- **#13** — add a timezone to the export time, or state it in UTC.

**Cleanup**
- **#10** — derive the card width from the gap (CSS variable) or note it at the gap.
- **#12** — fold `usesPageRange` into the shared report-render module when the portal/dashboard
  duplication is unified.
- **#14** — `lib/date-range.test.ts` into the vitest allowlist; decide whether `date-range.ts` should
  stop throwing on malformed input.

**Blocks the ship:** none of the open items, provided #9's manual check shows one save per click.
