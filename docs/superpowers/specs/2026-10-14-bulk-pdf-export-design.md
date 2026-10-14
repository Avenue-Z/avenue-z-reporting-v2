# Bulk PDF export — design

**Date:** 2026-10-14 · **Status:** decided by Claude at Paul's request ("get it back to me without any of my input"); reviewed through the PR
**Builds on:** the server PDF export, now on `main`: specs `2026-10-08-pdf-export-all-reports`, `2026-10-09-pdf-export-executive-overview` and `2026-10-13-pdf-export-dark`. The single-page export is unchanged; this adds a way to export several pages at once.

---

## 1. Request

Paul (2026-10-14): "Can we make it so we can bulk export multiple pages? When you click export pdf you get a small popup that lets you select what pages you want to export from the current client's report."

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| B1 | **Export PDF opens a small popover** listing the client's exportable pages, grouped by report: one heading per report with a checkbox for the whole report, one checkbox per tab, and "All pages" at the top. The current page is pre-selected. | This is the request. Pre-selecting the current page keeps the old one-page export to two clicks. |
| B2 | **The pages listed** are the client's server-exportable pages in sidebar order. A report is listed when it's in `SERVER_EXPORT_SECTIONS`, in the client's `enabledReports`, and not in `hiddenReports`, ordered by `ALL_REPORT_SLUGS`. Its tabs are those the sidebar shows: AEO `visibleSubsections(AEO_SUBSECTIONS)`, Paid Media `visibleSubsections(PAID_MEDIA_SUBSECTIONS)`, Organic Social `organicSocialSubsections`, and the Executive Overview as one page. | These match exactly what the client can open. A hidden tab never appears, because `resolveExportView` would export it as the Overview again (a duplicate). |
| B3 | **One combined PDF.** Each selected page is exported through the existing `/api/export/pdf`, one request per page. The browser merges the PDFs in list order (B2, not click order) with `pdf-lib`, loaded only when merging. | One request per page keeps each render inside the route's 60 s budget; a single server render of ten tabs would not fit. The merge happens in the browser, so the merged file isn't subject to Vercel's 4.5 MB response limit. Each page keeps its own header (title, export time, period). |
| B4 | **One page selected:** the download is that page's PDF, byte for byte as today, with the server's filename. **Several:** `<Client> – Report (<n> pages) – <yyyy-MM-dd>.pdf`, in the viewer's local date. | The single-page behaviour is unchanged, and the combined file says what it is. |
| B5 | **Ranges:** every page uses the current page's raw range (the URL's `dateRange` and `compareRange`), as the sidebar carries it between reports. Two exceptions: the Executive Overview always posts `last_30_days` and no comparison (#354), and only AEO pages get the `models` filter. | This matches what the person sees clicking through the reports. Organic Social still resolves a locked month itself, as on its page. |
| B6 | **Exported one at a time,** with progress ("Exporting 2 of 6: Paid Search") and Cancel. | Sequential requests don't trip vendor rate limits (Supermetrics 429), and the first page warms caches for the rest. Cancel aborts the request in flight and keeps nothing. |
| B7 | **Failures don't stop the run.** After the run, the popover lists each failed page with its reason (the same messages as today), then offers "Try again", which re-exports only the failed pages, and "Download the <n> that worked". | One slow vendor shouldn't cost the whole export, and nothing is downloaded until the person decides. |
| B8 | **No exportable page** (a client whose only reports are GA4 and the like): the button prints the page in the browser, as today, with no popover. **On a page that isn't server-exportable** (e.g. GA4) but where the client has other pages: the popover lists those, nothing is pre-selected, and a "Print this page" link runs the browser print. | Nothing gets worse; bulk works from any page. |
| B10 | **Amendments made while building** (PR feat/bulk-pdf-export). (a) Each page carries its sidebar tab `label`, not its page title: the popover nests tabs under their report, and progress and failures name a page "Report – Tab" ("Paid Media – Overview"). (b) B5's ranges follow the sidebar's `carriesRange`: for a client with locked Organic Social months the range doesn't cross between Organic Social and the other reports; the page across takes its default (Organic Social: its locked month). (c) Final review: a page missing from the list (staff on a report the client hides from its portal) keeps the single-page export; combining counts as running (Cancel works, nothing else starts); a cancelled retry keeps the pages already exported; a retry reuses the run's ranges. | (a) Three tabs are labelled "Overview". (b) Matches what the person sees clicking through the sidebar. (c) Found in review; each is pinned by a test. |
| B9 | **Access is unchanged:** each page goes through the same route, with the same portal rule, session role and section check. | No new server surface. |

## 3. Components

- **`lib/export/pages.ts` (new, pure):** `exportablePages(client): ExportPage[]`, each with `{ key, section, subsection, reportTitle, title }`. The title is `resolveExportView(...).pageTitle` (B2).
- **`lib/export/bulk.ts` (new, pure):**
  - `runBulkExport(pages, exportPage, { onProgress, signal })` runs B6 and B7, returning per-page `{ ok: true; pdf: ArrayBuffer; filename }` or `{ ok: false; error }`.
  - `bulkFilename(clientName, n, now)` builds the B4 name.
  - `bulkRequest(page, ranges)` builds each page's request (B5).
- **`lib/export/merge-pdfs.ts` (new):** `mergePdfs(parts: ArrayBuffer[]): Promise<Uint8Array>` with `pdf-lib`'s `copyPages`, which keeps each page's links.
- **`components/export-pdf-button.tsx`:**
  - The one-request fetch becomes `requestPdf(view, signal)`, returning `{ ok, pdf, filename } | { ok: false, error }` and shared by both paths.
  - A new `bulk` prop, `{ pages: ExportPage[]; currentKey: string | null; dateRange; compareRange; models }`, turns on the popover (Radix `Popover`, already in the app).
- **Both report pages** (`app/{portal,dashboard}/[clientSlug]/reports/page.tsx`) pass `bulk`, built from `exportablePages(client)` and the page's raw ranges.

## 4. Error handling

- **Per page:** the existing route errors (`still-loading`, `forbidden`, `too-large`, a 70 s request timeout) become per-page reasons (B7).
- **Merge failure** (a corrupt part): "The PDF couldn't be combined. Try again", and nothing downloads.
- **Cancel:** the request in flight is aborted, and the run ends with nothing downloaded.

## 5. Testing

- **Unit:**
  - `exportablePages` follows the sidebar's sources for a Renaissance-like client: order, hidden tabs, Organic Social channels and the Influencer tab, no GA4.
  - `bulkRequest` gives the Executive Overview its fixed ranges and only AEO the models filter.
  - `runBulkExport`: sequential order; progress events; failures recorded while the run continues; retrying only failed pages; Cancel aborts.
  - `mergePdfs` gives combined page counts in order, tested with real `pdf-lib`-made PDFs.
  - The button:
    - with `bulk`, it opens the popover with the current page checked;
    - with one page selected it downloads as today, through the server filename;
    - the failure list and buttons work;
    - with no exportable pages it prints.
- **Parity:** both report routes pass `bulk` with `exportablePages(client)` and the current page's key.
- **Live, local production build:** a puppeteer script signs in to the dashboard report page (a minted local session). It opens the popover, selects three pages across reports, exports, captures the download, and checks the merged PDF's page count equals the sum of the parts and that each part's title is in order.

## 6. Out of scope

- A server-side bulk route or a background job.
- Zip downloads.
- Per-page ranges.
- Reports that aren't server-exportable (GA4, Inbound Funnel, …).
