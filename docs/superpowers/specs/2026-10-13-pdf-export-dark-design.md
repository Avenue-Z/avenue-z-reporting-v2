# PDF export, dark like the reporting page — design

**Date:** 2026-10-13 · **Status:** approved in chat (Paul, 2026-10-13); awaiting spec review
**Builds on:** `2026-10-06-organic-social-pdf-export-v2-design.md`, `2026-10-08-pdf-export-all-reports-design.md`,
`2026-10-09-pdf-export-executive-overview-design.md` (the server-rendered export, on `dev` and `staging` since #375).
Everything those specs say about the pipeline still holds, unless this one changes it: readiness, auth, page breaks,
tables, hidden controls, expanded views and fonts.

---

## 1. Why

Stakeholder feedback on staging (via Paul, 2026-10-13): "some charts are black and some are white… Any chance we could get the whole page to be black and look like the reporting page itself?"

The export prints on white paper, but it keeps each chart on its dark panel, because the brand colours (`#60FF80`, `#60FDFF`, …) are unreadable on white. So charts are black, while cards, tables and text are white. Every report is designed dark, so a dark PDF is both consistent and closer to what the client sees.

## 2. Decisions

| # | Decision |
|---|---|
| K1 | **Dark everywhere, all four sections** (Organic Social, AEO, Paid Media, Executive Overview). The PDF looks like the live page. |
| K2 | **Edge-to-edge dark pages.** Every page is black to its edges, with the same 0.4 in margin of space around the content on every page, including pages that continue a section. |
| K3 | **No light or print-friendly variant** (Paul: "no need for a light version"). |
| K4 | **Production waits for this.** The white version is not promoted to `main`; this replaces it on `staging` first. |
| K5 | **Plain black page** (`#000000`, the live `--background`). The live page's faint radial glow (`.bg-glow`) is left out: repeated on every PDF page it would read as a stain. |

## 3. How (spike-proven)

A throwaway spike (2026-10-13, local Chrome 146, the real `page.pdf()` call) tried four ways to get dark pages:

| Approach | Result |
|---|---|
| Today's `page.pdf({ margin: 0.4in })` with a dark root background | **No.** The margins print white: a white frame on every page. |
| No margin, padding on a wrapper | **No.** Continuation pages start flush against the top edge. |
| No margin, wrapper padding with `box-decoration-break: clone` | Works. |
| **CSS `@page { margin: 0.4in; background: #000 }` with `preferCSSPageSize: true`** | **Works**, and keeps today's content box exactly. Chosen. |

**Rendering (`lib/export/render-pdf.ts`):**
- `page.pdf()` drops its `margin` option and passes `preferCSSPageSize: true`.
- The page size and margins come from the export page's `@page` rule: `size: 11in 8.5in; margin: 0.4in`.
- `CONTENT_WIDTH` (979) and `CONTENT_HEIGHT` (739) are unchanged, so is every page-break decision.

**The `@page` rule lives in the export page's own inline `<style>`** (`app/export/[clientSlug]/[section]/page.tsx`, beside today's `html, body` override), not in `export-theme.css`.
- Why: Next.js can bundle CSS across routes. An `@page { background: #000 }` leaking into another route's stylesheet would turn browser printing of reports that still use `window.print()` (GA4, Inbound Funnel, …) black.
- The inline `html, body` override becomes `background: #000`.

**Theme (`app/export/export-theme.css`):**
- **Kept:** everything that makes a PDF read well:
  - the font stacks (`--font-sans`, `--font-mono`);
  - `data-export-block`, `keep-with-next`, the table rules (`table`, `row`, `thead`, `table-more`), `scroll`, `wrap`, `hide`;
  - the `.no-print` backstop;
  - `a[data-export-link]`.
- **Removed:** everything that re-colours for white paper:
  - the `--color-white`/`color`/`background` overrides on `.export-theme`;
  - the Surfaces, Text, inline-colour, `data-export-bars` and Borders blocks;
  - the `[data-export-chart]` panel rules.

**Markers and export-only classes that only served white paper are removed with them, so nothing is left orphaned:**
- `data-export-chart`, on the 14 components that set it;
- `data-export-bars` (contact pacing, pipeline owners);
- Paid Search hero's export-only panel classes (`rounded-lg border … bg-bg-surface p-5`). Live, it has no panel, so the PDF now matches.

**Untouched:** behaviour gated on `useExportMode()`: labels for toggles, expanded Journey cards, no hover layers, the CRM deadline, no Status column, footnotes.

**The header** (client name, page title, export stamp) keeps its classes. On black, `text-white` and `text-text-muted` render as they do live.

## 4. What changes on paper

- **Background:** black page; cards and charts on `#272727` surfaces, as live.
- **Colours:**
  - brand colours (deltas, pills, bars, chart lines) print as designed;
  - the UGC pill, the CRM bars and the KPI deltas return to their live colours;
  - the Executive Overview's contact bars and owner bars print in live brand green on black.
- **Consistency:** charts are no longer a different colour from the cards around them.
- **Text:** text and glyph content are unchanged, so staff = client checks, filenames and stamps are unaffected.

## 5. Error handling

Unchanged.

One risk to check rather than assume: the deployed Chromium (`@sparticuz/chromium` 153) must honour `@page` `background` and `preferCSSPageSize` as local Chrome 146 does. If it doesn't, the fallback is the `box-decoration-break: clone` approach (§3 row 3), which the spike also proved. This is verified on the first Vercel preview, before the review record is written.

## 6. Testing

**Unit:**
- `render-pdf` passes `preferCSSPageSize: true` and no `margin`.
- The export page's inline style has `@page` with `size: 11in 8.5in`, `margin: 0.4in`, `background: #000` and a dark `html, body`.
- The theme test asserts that the white-paper remaps are gone and the layout rules remain.
- Tests that asserted `data-export-chart`, `data-export-bars` or the hero panel are updated to assert their absence. They fail first.

**Goldens:** AEO goldens lose only their `data-export-chart` attribute lines, proven line by line as in PR 2.

**Live acceptance** (`e2e/export/acceptance.mts`), as today, plus a new per-PDF check: **every page is dark to its corners**. Each page is rasterized at low resolution (`pdftoppm -gray`) and its four corner pixels are sampled. It fails on any light corner, which is the white-frame failure. All existing checks stay:
- no controls;
- staff = client;
- content box;
- full width;
- fonts;
- size.

**Page-by-page review:** a contact sheet of every section's PDF, checking:
- no white frame;
- consistent dark cards and charts;
- legible muted text;
- no stranded titles.

**Vercel preview:** one signed-in export on the PR's preview deploy, for the Chromium 153 check (§5).

## 7. Process

- A feature branch off `dev`, `feat/pdf-export-dark`, with its own PR and review-record PR. Thomas reviews.
- Then `dev` → `staging` for Tina's QA, then `staging` → `main` with Thomas's go-ahead.
- The white export, currently on `staging`, is not promoted to production on its own (K4).

## 8. Risks and follow-ups

- **Chromium 153 `@page` support** (§5): checked on the preview; there is a proven fallback.
- **Ink:** dark pages use much more ink when printed. Accepted (K3).
- **PDF size:** solid page backgrounds are vector fills, so the size impact is negligible. The 4.5 MB check stays.
