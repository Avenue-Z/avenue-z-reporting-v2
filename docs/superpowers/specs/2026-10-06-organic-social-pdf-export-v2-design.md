# Organic Social PDF Export v2 — server-rendered, page-aware export

**Status:** design approved section by section (Paul, 2026-10-06). Not yet planned or built.
**Builds on:** PR #320 (`feat/organic-social-pdf-export`, parked as v2's base) and its review record
PR #321 (`docs/qa/organic-social-pdf-export-code-review.md`), which this work supersedes.
**Branch:** `feat/organic-social-pdf-export-v2`, cut from `feat/organic-social-pdf-export` at `4a62416`.

---

## 1. Why

Export PDF today is `window.print()` of the live, interactive, dark-themed page. Investigation for
#320 showed that this cannot meet the bar "see the page as it was on that day":

- **Placeholders print.** If a section is still loading when Export is clicked, its loading
  placeholder prints. Reproduced in real Chrome on Paid Media after network-idle + 3s (review
  record #7). The most credible explanation for a client's "graphs don't show" report.
- **Content is cut at the right edge.** Recharts sizes charts to the on-screen width; print lays out
  at paper width without re-measuring (the Organic Social engagement chart, today).
- **Layout depends on an accident.** Charts overflowing the page are what make Chrome shrink every
  page to fit. Fixing the overflow with global print CSS removed the shrink and broke other
  sections: sliced tables, doubled page counts, a blank Executive Overview card (#320 review #1, #2).
- **No control of page breaks.** Titles land alone at a page bottom and cards split across pages.
- **Annotations never print.** Chart callouts are hover cards marked `no-print`.

## 2. Goals and non-goals

**Goals (v1 of v2):**
1. Export PDF on **Organic Social** (Overview and each platform tab) produces a PDF rendered on the
   server, only once the page has fully loaded.
2. **Nothing cut off:** no content past the page edge; no card, KPI row or chart split across pages;
   no title alone at the bottom of a page; a section too long for a page splits between sensible
   blocks.
3. **Annotations** that a client can see print, tied to the chart.
4. **Posts are linkable**: whole Top Content cards and annotation thumbnails link to the post.
5. Keep #320's stamp (`Exported … · Reporting period …`, period only where the page range applies)
   and dated filename (`<Client> – <Page> – <YYYY-MM-DD>.pdf`).

**Non-goals:** stored or archived copies; scheduled exports; one PDF bundling every tab; any section
other than Organic Social (they keep browser print until each gets its own block map); changing
Cmd+P (it stays a plain browser print); enabling Renaissance's platform tabs (see §9).

## 3. Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Scope | Organic Social only: Overview + platform tabs |
| Delivery | Download only; nothing stored |
| Page | US Letter **landscape**, 11 × 8.5 in, 0.4 in margins |
| Contents | The tab the user is on |
| Renderer | Headless Chromium in a route in this app (approach A; Cloud Run and hosted APIs rejected) |
| #320 | v2 is built on top of it; reviewed and merged together |

## 4. Architecture

```
[Export PDF button] --POST /api/export/pdf {section, subsection, dateRange, compareRange}-->
  [route: auth check as the page does] --launch Chromium, requester's own session cookie-->
    [GET /export/[clientSlug]/organic-social?...  (export page, 979px viewport)]
      renders OrganicSocialReport parts in export mode; sets window.__exportReady when loaded
  <-- page.pdf(letter landscape) --  route streams PDF with Content-Disposition filename
```

Units, each with one job:

| Unit | Job |
|---|---|
| `lib/report-view/resolve.ts` (new, shared) | Resolves a report request exactly as the pages do: access, active section and tab, served range (locked months included), page title, period label. Extracted from the duplicated logic in `app/{portal,dashboard}/[clientSlug]/reports/page.tsx`, which then call it. |
| `app/export/[clientSlug]/organic-social/page.tsx` (new) | The export page: export header + `OrganicSocialReport` in export mode, white print theme, fixed width. No sidebar, sticky header, pickers or chat. |
| `components/export/export-mode.tsx` (new) | `ExportModeProvider`/`useExportMode()`, `ExportBlock`, `KeepWithNext`, `ExportPending` and the readiness reporter. |
| `app/api/export/pdf/route.ts` (new) | Auth, Chromium launch, wait for ready, `page.pdf()`, error mapping, one log line. |
| `components/export-pdf-button.tsx` (changed) | On Organic Social: POSTs, shows progress and errors, downloads the file. Elsewhere: unchanged browser print. |
| Organic Social parts (changed) | Export-mode rendering of each part: blocks, static annotation list and markers, card rows, links. |

## 5. The export page

**Same answer as the page.** The export page calls the shared resolver, so the tab, served range,
locked month, title and period are those the live page would show for the same URL and session.
The access rules are the page's own: a client can only export its own pages; staff (`INTERNAL_*`)
any client; the role and client always come from the session, never the request.

**Theme.** A print theme designed for white paper (tokens, not `@media print` overrides), so the
live dark theme and its print CSS are untouched.

**Export header.** Client logo and name, page title (e.g. "Organic Social" or the platform), and
`Exported <Mon D, YYYY, h:mm a> · Reporting period <served range>`. The period appears only where
the page range applies (#320's `usesPageRange` rule, kept and covered by its route test).

**Readiness.** In export mode:
- each Suspense fallback renders `ExportPending` (a `data-export-pending` marker) instead of a
  skeleton;
- chart animations are off (`isAnimationActive={false}`), so lines are complete on first paint;
- a readiness reporter sets `window.__exportReady = true` once there are no pending markers, every
  `<img>` is complete, and `document.fonts.ready` has resolved.

A part that fails to load renders its existing error fallback (the page's own `safe()`/`Fallback`
handling) and counts as ready: a failed vendor call prints as the page shows it, not as a hang.

## 6. Page-break model

**Width.** Content box is 10.2 × 7.7 in = **979 × 739 CSS px**. The export page lays out at exactly
979 px, and Chromium's viewport is 979 px wide, so screen layout is print layout: no shrink-to-fit,
charts measure the true width.

**Blocks.**
- `ExportBlock`: never split across pages (`break-inside: avoid` on a block-level box).
- `KeepWithNext`: wraps a title **and its first block** in one unbreakable box, so a title can never
  end a page alone. (CSS `break-after: avoid` alone is not relied on; Chrome treated it as optional
  in testing.)
- Top-level flow is block layout (no flex/grid between the page and the blocks), so Chromium's
  fragmentation applies.

| Part | Unbreakable blocks |
|---|---|
| Commentary | title + first paragraph; then each paragraph |
| Platform headlines | each platform: label + its row of 5 KPI tiles |
| Engagement chart / follower graph | title + legend + chart (one block) |
| Annotations (under a chart) | "Annotations" + first entry; then each entry |
| Top Content | section title + sort line + first platform label + its first card row; then each platform's label + its first row; then each later row |

**Card rows.** In export mode Top Content is chunked into explicit rows of 5 cards (each a block),
not a wrapping flex list, so a row is a unit Chromium cannot cut. The export is a fresh render, so
it prints each platform's **first** carousel page (up to 15 cards) in the **default** sort
(engagements, descending), as #320 decided for "every card on the page". The on-screen carousel
page and sort are not carried into the export in v1.

**Splitting.** A part that fits on the remaining page stays together; one that does not splits only
between blocks. **Exception:** a single block taller than a page (realistically, an annotation with
a very long note) may split at text lines. Built-in blocks are sized well under 739 px, and the
acceptance test fails if one of them exceeds it.

## 7. Annotations and links

**Which annotations print.** Exactly those a client sees: not `hidden`, and not draft-only
(`noteOnly` without an approved `note`). Drafts, editor state and staff controls never print, for
client or staff exports. This is a pure function over `ChartAnnotation[]`, shared with the live
chart's existing rule (`AnnotationCallouts`'s `nothingPrintable`).

**On the chart.** Each printed annotation gets a numbered marker (①, ②, …, in date order) drawn at
its point inside the chart SVG.

**Under the chart.** An "Annotations" list in date order: number, date (`Sep 10`), label, the full
approved note, and the post thumbnail(s) from `cardThumbs()`.

**Links.** Only `http(s)` URLs become links (reusing `safeHref`):
- Top Content: the whole card (image + caption) is one link to `post.url`; "View post ↗" is styled as
  a link (brand cyan, underlined) on paper.
- Annotation thumbnails link to their posts.
- A post without a URL is not linked (as today).

## 8. The export request

**Button.** On Organic Social, Export PDF POSTs `{ section, subsection, dateRange, compareRange }` to
`/api/export/pdf`, shows "Preparing PDF…", and on success downloads the response as
`<Client> – <Page> – <YYYY-MM-DD>.pdf` (from `Content-Disposition`). On failure it shows the reason
inline (e.g. "This report is still loading. Try again in a moment") and offers retry. It never
delivers a partial file. Other sections keep #320's browser-print button.

**Route.**
1. `auth()`; run the shared resolver for the requested section/tab with the session's role and
   client; reject with 403 when the page would deny it.
2. Launch Chromium (`@sparticuz/chromium` + `playwright-core`), viewport 979 px wide.
3. Add **the requester's own session cookie** to the browser context and open the export page on
   this deployment (`VERCEL_URL`, else `APP_URL`, else the request origin — cache-warm's rule). No
   cookie is minted and no role is taken from the request.
4. Wait for `window.__exportReady` (45 s cap).
5. `page.pdf({ width: '11in', height: '8.5in', margin: 0.4in all round, printBackground: true })`.
6. Close the browser in `finally`. `maxDuration = 60`; memory sized for Chromium.

**Errors.**

| Case | Response |
|---|---|
| No session, or the page would deny access | 403 |
| Not ready within 45 s | 504 `{ error: 'still-loading' }` |
| Chromium launch / navigation / PDF error | 500 `{ error: 'render-failed' }` |

**Operator visibility.** One log line per export: client slug, section/tab, outcome, duration, and
the failed step (`auth`, `launch`, `navigate`, `ready`, `pdf`). Never cookie values or URLs with
tokens.

**Load.** One browser per request, no fan-out, manual and infrequent. Expected 5–15 s of function
time per export.

## 9. Rollout and prerequisites

- Branch flow per CLAUDE.md: `feat/organic-social-pdf-export-v2` (on top of #320) → PR + review
  record (supersedes #321) → `dev` → `staging` (Tina QA) → `main` (Thomas's go-ahead).
- **Renaissance's annotations need config, outside this spec:** platform tabs enabled and the
  annotated parts pinned (`engagement-trend@2`, `follower-graph@2`) in its `reportSectionConfig`.
  Today Renaissance has neither, so its exports will show no annotations until that M4 config work
  lands. The export works for any client configured that way.
- **Preview deploys:** confirm whether Vercel deployment protection is on for previews. If it is,
  the self-load needs Vercel's automation bypass (`x-vercel-protection-bypass` with
  `VERCEL_AUTOMATION_BYPASS_SECRET`). Production and staging are reachable today (cache-warm relies
  on it).

## 10. Testing

**Unit:** the printable-annotation filter; `ExportBlock`/`KeepWithNext` markup; card rows chunked by
5; fallbacks render `ExportPending` in export mode; readiness flag only after pending = 0, images
complete and fonts ready; filename and stamp (from #320).

**Route:** access matrix for `/api/export/pdf` and the export page (client own → 200, client other →
403, staff → 200, no session → 403), role and client never read from the body; the shared resolver
returns what both report pages returned before extraction (the existing `locked-months-parity` and
`export-period.pages` tests keep passing unchanged).

**Acceptance (the gate):** a production build serving fixture data, with vendor HTTP intercepted in
the server process (e.g. MSW loaded via `NODE_OPTIONS`); no fixture code in app paths. Real PDFs are
rendered through the route and checked using text positions per page (e.g. `pdfjs-dist`):
- every block's text is on one page; every title shares a page with its first block;
- no text outside the 979 × 739 content box;
- link count = posts with a URL + annotation thumbnails; marker numbers match list entries;
- no placeholder or skeleton text.
Extra fixtures: an annotation with a very long note (split-at-lines exception), and a part that never
resolves (must give 504 and no PDF).

The acceptance test needs Chromium in CI: add it as a job on the PR if the org's required-checks
workflow allows; otherwise run it locally and record its output in the review record. The plan
settles which.

**Live:** one real export of Renaissance's Organic Social Overview on a deployed build before the
review record is written.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Chromium cold start / bundle size on Vercel | `@sparticuz/chromium` is built for this (~60 MB compressed, under the limit); measure cold start in the plan's first task |
| Export page drifts from the live page | Shared resolver + same parts in export mode; acceptance compares against fixtures |
| Function CPU spikes (seen with cron fan-out) | One browser per request, 60 s cap, no fan-out |
| A future part forgets export mode | Parts without an export rendering still render inside an `ExportBlock` (whole part unbreakable); the acceptance test flags a part taller than a page |
