# Code Review Record — `feat/bulk-pdf-export` (PR #386)

**Feature under review:** PR #386 — `feat(export): bulk PDF export — pick pages from Export PDF, get one PDF`.
**Diff range reviewed:** `2b86120..0589447` (`origin/dev` → PR head; nine commits, `f83a958`..`0589447`). No unrelated code.
**Review fixes:** `0589447..be2a7f2` (Thomas's two round-1 minors, one commit; §6). Line anchors in §1–§4 are at `0589447`.
**Spec / plan:** `docs/superpowers/specs/2026-10-14-bulk-pdf-export-design.md` (B1–B10) and
`docs/superpowers/plans/2026-10-14-bulk-pdf-export.md`, both on branch `docs/pdf-export-all-reports-spec`.
**Reviewers:** Paul, Thomas.
**This document changes no code.**

| File | Change |
|---|---|
| `lib/export/pages.ts` | New. `exportablePages(client)` is the page list (B2). |
| `lib/export/bulk.ts` | New. `bulkRequest` builds each page's request body (B5), `bulkFilename` builds the combined filename (B4), and `runBulkExport` is the sequential, cancellable runner (B6/B7). |
| `lib/export/merge-pdfs.ts` | New. `mergePdfs` merges the parts with `pdf-lib`'s `copyPages`. |
| `components/export-pdf-button.tsx` | `requestPdf()` is extracted from the single-page path. `BulkPicker` is the popover. There is also a fallback for a page that is missing from the list. |
| `app/{portal,dashboard}/[clientSlug]/reports/page.tsx` | Both pass `bulk`. |
| `package.json` | Adds `pdf-lib@^1.17.1` (MIT). |
| tests | Pages, bulk and merge units. 15 picker tests. Route parity, including the invariant that `currentKey` is in `pages`. The re-recorded locked-months snapshots. Acceptance part C plus the `linksIn` helper. |

---

## §1 How it works

**What users see.** Export PDF opens a popover titled "Pages to export".
- **The list.** It shows the client's server-exportable pages, grouped by report, plus an "All pages" checkbox and a
  checkbox for each report.
- **Pre-selection.** The page in view is pre-checked.
- **Exporting.** "Export n pages" exports the selection and downloads one file.
- **Pages the server doesn't export** (GA4 and the like): nothing is pre-checked, and a "Print this page" link keeps
  the browser print.
- **No exportable page at all**, or a page that isn't in the list: the button behaves exactly as before.

**Which pages are listed** (`exportablePages`, `lib/export/pages.ts:30`).
- **Reports.** It walks `ALL_REPORT_SLUGS` (sidebar order) and keeps a report when it is server-exportable
  (`SERVER_EXPORT_SECTIONS`: executive-overview, peec-ai, paid-media, organic-social), in `enabledReports`, and not in
  `hiddenReports`.
- **Tabs.** The tabs come from the same sources the sidebar uses:
  - AEO: `visibleSubsections(AEO_SUBSECTIONS)`;
  - Paid Media: `visibleSubsections(PAID_MEDIA_SUBSECTIONS)`;
  - Organic Social: `organicSocialSubsections` (channel allow-list, the Influencer tab, a hidden Overview);
  - the Executive Overview: one page.
- **Hidden tabs.** These are never listed, because the page and `resolveExportView` show a hidden tab as its section's
  Overview, so it would print the Overview twice. The Paid Media sidebar lists every tab, but the page renders a hidden
  one as Overview, so the same rule applies there.
- **Each page** carries its key `section:subsection`, its report name (the group heading) and its sidebar label.
  Checkboxes are named "Report – Tab" so that the three "Overview"s are told apart.

**What each page asks for** (`bulkRequest`, `lib/export/bulk.ts:29`).
- **Ranges.** A page gets the current page's raw URL ranges, carried the way the sidebar carries them (`carriesRange`).
  For a client with locked Organic Social months, the range doesn't cross between Organic Social and the other reports.
  The page on the other side gets its default: `last_30_days` with no comparison, and for Organic Social the export page
  then resolves its locked month itself.
- **Executive Overview.** It always posts `last_30_days` with no comparison (#354).
- **Models.** Only `peec-ai` pages carry `models`.
- **No new endpoint.** The body is the same `ExportRequest` the single-page button sends, validated by the same
  `parseExportRequest`.

**How the run goes** (`BulkPicker.run`, `components/export-pdf-button.tsx:271`).
1. **Export.** `runBulkExport` calls `requestPdf` once per selected page, in list order (not click order), one at a
   time.
   - Progress reads "Exporting i of n: Report – Tab" before each page.
   - Each request keeps the single-page 70 s give-up.
   - A failed page is kept as `{ ok: false, error }`, using the route's existing messages (`still-loading`, `forbidden`,
     `too-large`, else "couldn't be created"), and the run continues.
2. **Some pages failed.** The popover lists them and offers "Try again", which re-exports only the failed pages and
   merges the result into the earlier successes, and "Download the n that worked".
3. **Download.**
   - With one successful page, its bytes download unchanged under the server's filename.
   - With several, "Combining n pages…" shows while `pdf-lib` is dynamically imported and `copyPages` appends every page
     of every part, in list order. Links survive (63/63 in the live run).
   - The file is named `<Client> – Report (<n> pages) – <yyyy-MM-dd>.pdf`, via `exportFilename` with the requester's
     timezone.
4. **Cancel.** Cancel, or leaving the page, aborts the request in flight, or skips the download if the merge is
   running. Nothing downloads and the selection stays. On a retry, the earlier successes stay too. On a first run, at
   `0589447`, they did not: `prior` is empty and `runBulkExport` threw away its partial results, so the selection was
   all that stayed (Thomas, #387). This is fixed in `be2a7f2` (§6, R1).
5. **Ranges on retry.** A retry reuses the ranges its run started with.

**Why the merge happens in the browser.** Each page stays one render inside the route's 60 s budget, and the combined
file never passes through Vercel's 4.5 MB response limit. Each part keeps its own header (title, export time, period).

**Access.** This is unchanged (B9). Every page goes through `/api/export/pdf` with the portal rule (`canOpenPortal`),
the session's role and the `enabledReports` check.

## §2 Verification method

- **Static.** Every anchor in §1 and §3 was confirmed at the stated line on `0589447`.
- **Units (vitest).** The full suite passes, 2742/2742.
  - `pages.test.ts` (7): sidebar order, hidden tab, hidden Organic Social Overview (Influencer goes back under
    Instagram), hidden report, no exportable report, unique keys.
  - `bulk.test.ts` (10): the Executive Overview's fixed window, models only for AEO, `carriesRange` in both directions,
    timezone-dated filename, strictly sequential with progress, failure kept, signal passed, cancel before the next page,
    cancel thrown mid-page.
  - `merge-pdfs.test.ts` (2): real `pdf-lib` PDFs with page sizes unique to each part, so order is proven; a non-PDF
    part rejects.
  - `export-pdf-button.bulk.test.tsx` (14): opening, All and per-report toggles, one page is byte-identical and never
    merged, three pages are posted in list order and merged in order, the failure list, retrying only the failed page,
    a partial download, merge failure, Cancel, cancel during the merge, a cancelled retry keeps its successes, a retry
    keeps its ranges, a page missing from the list falls back, no pages means print, and a non-server page offers
    Print this page.
  - The 18 existing `export-pdf-button.test.tsx` tests pass unchanged.
- **Parity.** `report-views.pages.test.tsx` runs both routes. They pass `bulk` with `exportablePages(client)`, the
  resolved current key, and the raw ranges. A hidden or unknown tab pre-selects the Overview. GA4 pre-selects nothing.
  For every fixture page, `currentKey ∈ pages`.
- **Snapshots.** The locked-months tree snapshots were re-recorded. A throwaway probe that stripped `bulk` from the
  serialised tree matched the old snapshots exactly, so `bulk` is the only change.
- **Live run on a local production build.** `e2e:export` passed 304/304. Part C mints a staff session for localhost
  only, opens Renaissance's Organic Social page, ticks the Executive Overview and AEO Overview, and exports. The
  download:
  - has 23 pages, which equals the 5 + 8 + 10 of the three single exports;
  - has stamps on pages 1, 6 and 14, in sidebar order;
  - keeps 63/63 post links (counted with `pdfinfo -url`, because `pdf-lib` writes compressed object streams that the
    byte-scanning `countLinks` can't see);
  - is all Letter landscape and dark to the edges.
  The part boundaries were also checked by eye.
- **Final whole-branch review.** A fresh reviewer found F1–F6 below. F1 was confirmed with a probe test that fired 4
  requests and a second merge. All six were fixed in `0589447`, each with a test.
- **Not run:** the Vercel preview (Chromium 153), Safari and Firefox downloads of a merged blob, and a full 16-page
  Renaissance selection.

## §3 Findings

Sev: **●** correctness, **○** cleanup/convention. Status: **CONFIRMED** (proven in-tree) / **PLAUSIBLE** (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| F1 | ● | CONFIRMED · fixed `0589447` | `components/export-pdf-button.tsx:271` | Combining wasn't counted as running, so a second export could start mid-merge and Cancel/unmount lost its controller. |
| F2 | ● | CONFIRMED · fixed `0589447` | `components/export-pdf-button.tsx:165` | On a report hidden from the portal (staff on the dashboard), `currentKey` wasn't in the list: the picker opened with nothing checked and no way to export the page. |
| F3 | ○ | CONFIRMED · fixed `0589447` | `components/export-pdf-button.tsx:271` | Every part's `ArrayBuffer` stayed in state after a successful download. |
| F4 | ● | CONFIRMED · fixed `0589447` | `components/export-pdf-button.tsx:271` | Cancelling Try again discarded the pages already exported. |
| F5 | ● | PLAUSIBLE · fixed `0589447` | `components/export-pdf-button.tsx:271` | A retry after navigating would use the new page's ranges, mixing ranges inside one PDF. |
| F6 | ○ | CONFIRMED · fixed `0589447` | `components/export-pdf-button.tsx:205` | The three "Overview" checkboxes had identical accessible names, there were no group semantics, and the live region mounted together with its first message. |
| 1 | ● | PLAUSIBLE | `components/export-pdf-button.tsx:90` | A merged download has only been run in headless Chrome. Safari and Firefox download a `Blob` from an attached `<a download>` the same way the single-page path does, but a multi-MB merged blob there is unverified. |
| 2 | ○ | CONFIRMED | `lib/export/pages.ts:32` | A report the client hides from its portal is never offered in bulk, even to staff on the dashboard, who can open it (F2 keeps its single-page export). |
| 3 | ○ | CONFIRMED | `components/export-pdf-button.tsx:271` | There is no overall time budget. A full Renaissance selection is 16 sequential requests, each allowed 70 s, so the worst case is about 19 min. Progress and Cancel are shown throughout. |
| 4 | ○ | CONFIRMED | `components/export-pdf-button.tsx` (403 lines) | `BulkPicker` and its helpers roughly triple the button file's size, so they could be a sibling module. |

## §4 Detail

**F1–F6: fixed on the branch.** Each one is pinned by a test in `export-pdf-button.bulk.test.tsx` or the parity test.
- **F1.** `run()` now covers both phases. `progress` stays non-null through "Combining n pages…", so the action buttons
  are hidden, the checkboxes are disabled and `onOpenChange` refuses to close. The download is skipped if the run's
  signal was aborted during the merge. `finally` clears `abortRef` only if it still holds this run's controller.
- **F2.** The button falls back to the single-page export when `currentKey` is non-null and not in `pages`.
- **F3.** `setResults(null)` runs after a download.
- **F4.** A cancel restores `prior`.
- **F5.** `rangesRef` captures `bulk` when a fresh run starts, and retries use it.
- **F6.** Each page's checkbox has `aria-label` set to "Report – Tab", each report is a `role="group"`, and the live
  region stays mounted.

**1. Merged-blob downloads outside Chrome.**
- *Mechanism:* `download()` builds `new Blob([pdf], { type: 'application/pdf' })` and clicks an attached
  `<a download>`. That is the same code the single-page path has used since #332, now shared. Only the size and the
  source of the bytes (a `pdf-lib` `Uint8Array`) differ.
- *Fix:* none expected. A manual check in Safari and Firefox on staging during stakeholder QA would close it.

**2. Reports hidden from the portal aren't in the bulk list.**
- *Mechanism:* spec B2 filters on `hiddenReports`, matching the portal sidebar. The dashboard sidebar filters only on
  `enabledReports`, so staff can open such a report, and since F2 they can export it on its own, but they can't add it
  to a bulk export.
- *Fix (decide together):* either keep B2 (bulk follows what the client can see, so a staff bulk export never holds a
  page the client couldn't open), or list such reports for staff only. That would mean passing the role into
  `exportablePages`.

**3. No overall time budget.**
- *Mechanism:* the run is sequential by design (B6: vendor rate limits, cache warming). Each request keeps its 70 s
  give-up. In the live run, pages took 2–8 s each when warm.
- *Fix (decide together):* leave it, show an estimate, or cap a run at around 10 minutes and list what's left as
  failed.

**4. File size.**
- *Mechanism:* `components/export-pdf-button.tsx` now holds the button, `requestPdf`, `download`, `Check` and
  `BulkPicker`.
- *Fix:* move `BulkPicker` and `Check` to `components/export/bulk-picker.tsx`, keeping `requestPdf`/`download` shared.

## §5 Follow-ups

Tracked separately. None of these is applied in this review PR.

- **Correctness:** none open. F1–F6 are fixed on the branch.
- **Needs a live check first:** **1.** A merged export in Safari and Firefox, and one full-client selection (16 pages
  for Renaissance) on staging. This is the highest-value check before stakeholder QA.
- **Decide together:** **2** (whether staff should see hidden reports in bulk) and **3** (an overall time budget).
- **Cleanup:** **4** (move `BulkPicker` to its own module).
- **From Thomas's review (§6):** the per-user export concurrency limit (#332's follow-up, now more pressing), and
  watching `pdf-lib`'s maintenance.

None of these blocks the ship. Item 1 is the only one that could change behaviour, and it shares the single-page
download path that is already in production.

## §6 Review fixes

Thomas reviewed #386 and #387 and approved both. He raised two minors on #386 and one clarification on #387 (folded into
§1, step 4). Both minors are fixed in `be2a7f2`, each with tests.

| # | Sev | Status | Location (at `0589447`) | Finding | Fix |
|---|---|---|---|---|---|
| R1 | ○ | CONFIRMED · fixed `be2a7f2` | `components/export-pdf-button.tsx:311` | A cancelled first run threw away the pages it had already exported. The likely Cancel is one stuck page late in a long run, which lost every finished render. | `runBulkExport` returns `{ results, cancelled }` with the pages it finished (a page cancelled mid-request is left out). The picker merges them into its results and lists the pages without a PDF ("Not exported: the export was cancelled."), with Try again (only those) and "Download the n that worked". Nothing downloads unless the person asks. |
| R2 | ○ | CONFIRMED · fixed `be2a7f2` | `components/export-pdf-button.tsx:309` | The `catch` treated every throw as a cancel, so an error from `download()`, `bulkFilename` or a bug ended the run silently. | Cancels no longer throw (the runner returns them). Any other throw shows "The PDF couldn't be created. Try again." and keeps the pages already exported. |

**Verification of the fixes:**
- **Unit tests:** `vitest` passes 2746/2746.
  - Runner: two cancel tests now check the returned partial results; a new test checks that a non-cancel error still rejects.
  - Picker: three new tests. A first-run cancel lists the missing page, and Try again exports only it, giving pages 1, 2, 3 in order. A first-run cancel followed by "Download the 2 that worked" downloads pages 1 and 2. A throwing `createObjectURL` shows the error.
- **Static checks:** `tsc`, `eslint` (branch files) and `check:rsc` are clean.
- **Build and live run:** `next build` passes, and `e2e:export` on the local production build passes, 318/318 ok. The bulk part C is unchanged: 23 = 5 + 8 + 10, in sidebar order.

**Thomas's unanchored notes, added to the follow-ups:**
- `pdf-lib` 1.17.1 has had no release since 2022. It's MIT and browser-only, and it only reads PDFs our own route made, so the exposure is low, but it is unmaintained.
- One click can now start up to 16 sequential server renders. That makes the per-user export concurrency limit (a follow-up since #332) more pressing, because two tabs can run two bulk exports at once.
