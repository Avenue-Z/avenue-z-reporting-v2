# Bulk PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export PDF opens a popover where the person picks any of the client's exportable pages, and gets one combined PDF.

**Approach:**
1. A pure list of the client's exportable pages, matching the sidebar.
2. A pure, sequential runner that calls the existing single-page `/api/export/pdf` once per page.
3. A browser-side merge with `pdf-lib`.
4. The button grows a Radix popover when it receives a `bulk` prop. Without it, it behaves exactly as today.
5. Both report routes pass `bulk`.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Radix Popover (`components/ui/popover.tsx`), `pdf-lib@1.17.1` (new, MIT), vitest + Testing Library, puppeteer-core (live check).

**Spec:** `docs/superpowers/specs/2026-10-14-bulk-pdf-export-design.md`

**Branch:** `feat/bulk-pdf-export`, off `origin/dev` (`2b86120`). The PR targets `dev`. **Do not merge.**

## Global Constraints

- **Nothing changes server-side:** no new route, and the single-page export and its access rules are untouched (B9).
- **Without `bulk`, the button is byte-for-byte today's.** All existing `export-pdf-button.test.tsx` tests pass unchanged.
- **Order:** pages are listed and merged in sidebar order (B2), never click order.
- **Ranges (B5):**
  - the Executive Overview posts `last_30_days` and `compareRange: null`;
  - only `peec-ai` pages carry `models`;
  - every other page carries the current page's raw `dateRange` and `compareRange`.
- **Requests (B6):** sequential, with progress and Cancel. Failures are listed with a retry for just those pages and an option to download the rest (B7).
- **`pdf-lib`** is loaded with `import()` only when merging two or more parts.
- **Process:**
  - test-first;
  - `check:rsc` before pushing;
  - mint sessions against localhost only.

## Review Focus

1. **A client with hidden tabs or a hidden Organic Social Overview.** The list must match the sidebar exactly, with no duplicate Overview export. Pinned in Task 1.
2. **Starting from a page that isn't server-exportable** (GA4) for a client with exportable pages: nothing pre-selected, "Print this page" works. **A client with no exportable page:** the button prints with no popover. Pinned in Task 4.
3. **A page failing mid-run** (`still-loading`, timeout): the run continues; retry re-exports only the failed pages; "Download the n that worked" merges only the successes, in order. Pinned in Tasks 2 and 4.
4. **Cancel mid-run:** the request in flight is aborted, nothing downloads, and the popover returns to selection. Pinned in Task 2 (runner) and Task 4 (button).
5. **A large selection** (13 pages for Renaissance). Every request stays within its own 70 s timeout; the merged file's size is unbounded client-side, which is fine. Checked live in Task 6.

---

## File map

| File | Responsibility |
|---|---|
| `lib/export/pages.ts` (+ test) | `exportablePages(client)`: the B2 list. |
| `lib/export/bulk.ts` (+ test) | `bulkRequest(page, ranges)` (B5), `bulkFilename(client, n, now)` (B4), `runBulkExport(pages, exportOne, opts)` (B6, B7). |
| `lib/export/merge-pdfs.ts` (+ test) | `mergePdfs(parts)` with `pdf-lib`. |
| `components/export-pdf-button.tsx` (+ new `export-pdf-button.bulk.test.tsx`) | `requestPdf()`, extracted and shared; the popover when `bulk` is set. |
| `app/{portal,dashboard}/[clientSlug]/reports/page.tsx`, `components/export/report-views.pages.test.tsx` | Pass `bulk`, and pin it. |
| `e2e/export/acceptance.mts` | Part C: a live bulk export through the real popover. |

---

### Task 1: `exportablePages`

`ExportPage = { key: string; section: ServerExportSection; subsection: string | null; reportTitle: string; title: string }`. The key is `` `${section}:${subsection ?? ''}` ``.

- [ ] **Step 1: Write the failing tests** (`lib/export/pages.test.ts`).
  - A client with `enabledReports` `['executive-overview','peec-ai','ga4','paid-media','organic-social','request-a-report']`, `hiddenReports: ['technical-audit','content-impact']`, `dashSocialConfig: { channels: ['INSTAGRAM','LINKEDIN'] }` gives, in order:
    1. Executive Overview;
    2. AEO Overview, PR Influence;
    3. Paid Media Overview, Paid Search, Meta Advertising, LinkedIn Advertising;
    4. Organic Social Overview, then the Instagram and LinkedIn tabs, each with the titles `resolveExportView` gives.
  - No GA4 and no Request a Report.
  - A hidden Organic Social Overview (`organic-overview`) leaves it out, and the list starts at Instagram.
  - A report in `hiddenReports` is left out entirely.
  - A client with only `ga4` gives `[]`.
  - Every key is unique.

- [ ] **Step 2: Run and watch it fail.** Then implement it from `ALL_REPORT_SLUGS`, `isServerExportSection`, `visibleSubsections`, `organicSocialSubsections` and `resolveExportView`. Run and watch it pass.

- [ ] **Step 3: Commit** `feat(export): the client's exportable pages, in sidebar order`.

### Task 2: the bulk runner

- [ ] **Step 1: Write the failing tests** (`lib/export/bulk.test.ts`).
  - **`bulkRequest`:**
    - an Executive Overview page gives `dateRange: 'last_30_days', compareRange: null, models: null`;
    - an AEO page gives the ranges and `models`;
    - a Paid Media page gives the ranges and `models: null`.
  - **`bulkFilename('Renaissance', 3, new Date(2026, 9, 14))`** gives `'Renaissance – Report (3 pages) – 2026-10-14.pdf'`.
  - **`runBulkExport`:**
    - calls `exportOne` one page at a time, in order;
    - calls `onProgress(i, page)` before each;
    - records `{ ok: false, error }` for a failing page and carries on;
    - an aborted `signal` stops before the next page and rejects with an `AbortError`;
    - passes the signal to `exportOne`.

- [ ] **Step 2: Implement it, watch it go from failing to passing, then commit** `feat(export): bulk export runner: one page at a time, failures kept, cancellable`.

### Task 3: `mergePdfs`

- [ ] **Step 1: Add the dependency.** `npm install pdf-lib@1.17.1`. Add `lib/export/merge-pdfs.ts` to `vitest.config.ts` includes if the `lib/export/**` glob doesn't cover it.

- [ ] **Step 2: Write the failing test.** Make three PDFs with `pdf-lib` (2, 1 and 3 pages, each page's text drawn as an "A1", "A2", "B1"… marker) and merge them. The result has 6 pages, in order; check the page sizes and that the order follows the input.

- [ ] **Step 3: Implement it** as `PDFDocument.create()` plus `copyPages` for each part, in order. Run it and watch it pass.

- [ ] **Step 4: Commit** `feat(export): merge exported PDFs in the browser (pdf-lib)`.

### Task 4: the popover

- [ ] **Step 1: Write the failing tests** (`components/export-pdf-button.bulk.test.tsx`, `'use client'` if needed for `check:rsc`). Pass `bulk` with 3 pages across 2 reports and `currentKey` set to the second page.
  - **Opening:** clicking opens a dialog listing the pages under their report headings, with the current page checked and the others not.
  - **Select all:** "All pages" checks all of them; a report checkbox toggles its tabs.
  - **One page:** exporting just the current page posts once and downloads under the server's filename. `pdf-lib` is not loaded (no merge).
  - **Two pages:** exporting posts twice, in list order, then downloads `<Client> – Report (2 pages) – <date>.pdf`. Merge with a mocked `mergePdfs`, and assert the parts' order.
  - **A failure:** one page answering `still-loading` lists it as "This report is still loading…". "Try again" posts only that page; "Download the 1 that worked" merges only the successes.
  - **Cancel:** mid-run, it aborts the fetch in flight, downloads nothing, and the selection is back.
  - **No exportable page:** `bulk.pages = []` means clicking prints (`window.print`).
  - **Not on an exportable page:** `currentKey: null` means nothing is checked, and "Print this page" calls `window.print`.

- [ ] **Step 2: Implement it.**
  - Extract `requestPdf(view, signal)`, used by `exportOnServer` and the runner.
  - Add the `bulk` prop and a `Popover` holding: the checkbox groups, "Export n pages", a progress line, Cancel, the failure list with its two buttons, and "Print this page".
  - The existing tests must stay green unchanged.

- [ ] **Step 3: Commit** `feat(export): Export PDF opens a page picker for bulk export`.

### Task 5: the routes pass `bulk`

- [ ] **Step 1: Write the failing tests.** In the parity test, for both routes, a client page's button gets:
  - `bulk.pages` equal to `exportablePages(client)`;
  - `bulk.currentKey` equal to the current page's key (`null` on GA4);
  - `bulk.dateRange` and `bulk.compareRange` equal to the URL's;
  - `bulk.models` equal to the serialised models.

- [ ] **Step 2: Implement it in both routes, run the full suite, `tsc` and `check:rsc`, then commit** `feat(export): report pages offer bulk export of the client's pages`.

### Task 6: live check, final review, PR

- [ ] **Live part C in `acceptance.mts`.**
  - Mint an internal session and open `/dashboard/renaissance/reports?section=paid-media`.
  - Set the CDP download directory.
  - Click Export PDF and tick Executive Overview and AEO Overview (Paid Media Overview is pre-checked).
  - Click Export and wait for the file. Check:
    - its page count equals the three single exports' sum;
    - the page titles appear in sidebar order (Executive Overview, then AEO, then Paid Media);
    - every page is dark to its edges.
  - Build, run the whole acceptance, and look at the merged PDF's pages.
- [ ] **Final whole-branch review** by a fresh reviewer, then one fix pass.
- [ ] **PR to `dev`** and the review-record PR. **Do not merge.**
