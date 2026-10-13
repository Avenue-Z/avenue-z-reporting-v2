# PDF Export, Dark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the server-rendered PDF export prints dark, edge to edge, like the live reporting page, in all four sections.

**Approach:**
1. **Page:** `page.pdf()` takes its size and margins from a CSS `@page` rule (`preferCSSPageSize`). The export page's inline style paints that page black.
2. **Theme:** `export-theme.css` loses every white-paper re-colouring and keeps the layout rules.
3. **Markers:** the markers that only served white paper (`data-export-chart`, `data-export-bars`, Paid Search hero's export-only panel) are removed.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind v4, puppeteer-core 25 and `@sparticuz/chromium` 153, vitest, poppler (`pdftoppm`/`pdftotext`).

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-export-dark-design.md`

**Branch:** `feat/pdf-export-dark`, off `origin/dev` (`4253153`). The PR targets `dev`.

## Global Constraints

- **Edge to edge:** every PDF page is `#000000` to its edges, with a 0.4 in margin around the content on every page (K2).
- **Layout:** the content box is unchanged. `CONTENT_WIDTH` is 979 and `CONTENT_HEIGHT` is 739.
- **Where `@page` lives:** only in the export page's inline `<style>`, never in `export-theme.css` (it would leak into other routes' printing).
- **No variants:** no light or print variant (K3).
- **Unchanged behaviour:** nothing gated on `useExportMode()` changes, except removing the hero's export-only panel.
- **Live pages:** no change, apart from inert attributes disappearing.
- **Process:**
  - Test-first: every changed test runs RED first.
  - Run `check:rsc` before pushing.
  - Never log in on deployed environments.
  - Mint session cookies only against `localhost`.
  - Do not merge.

## Review Focus

1. **The deployed Chromium (153).** Does it honour `@page` `background` and `preferCSSPageSize` the way local Chrome 146 does? Pinned in Task 4: the real `@sparticuz/chromium` binary runs in a linux/amd64 container on the spike page.
2. **A section that continues onto a new page** (a long table, the Paid Search tab's 7 pages). Every continuation page keeps the top margin and has dark edges. Pinned in Task 4 (corner check on every page) and the page check.
3. **Muted text and borders on black.** `text-text-muted` (`#8A8A8A`) and `border-white/[0.06]` should read as they do live: nothing re-colours them now. Checked in the page review (Task 4).
4. **A section where nothing loads.** `NoData`, `LoadFailed`, `NeedsConnection` and Paid Media's fallback print as the live dark cards. Covered by the existing unit tests: the components are unchanged.
5. **Organic Social**, the export already on `staging`. Its KPI Check-In rings, YTD Review and annotations print as live, with no white panels left. Covered by the Task 4 page check (the APFM and Renaissance runs).

---

## File map

| File | Change |
|---|---|
| `lib/export/render-pdf.ts` (+ `.test.ts`) | `page.pdf()`: no `margin`, `preferCSSPageSize: true`. The `PageLike` type follows. |
| `app/export/[clientSlug]/[section]/page.tsx` (+ `page.test.tsx`) | Inline style: `@page { size: 11in 8.5in; margin: 0.4in; background: #000 }`, `html, body { background: #000 }`. |
| `app/export/export-theme.css` (+ `export-theme.test.ts`) | Remove the white-paper blocks. Keep fonts and layout rules. |
| 14 components with `data-export-chart`, 2 with `data-export-bars`, `paid-search/hero.tsx` | Remove the markers and the hero's export-only panel classes; remove comments that described them. |
| Tests asserting those markers | Assert absence or drop the assertion. Goldens are re-baselined, attribute lines only. |
| `e2e/export/pdf-check.ts` (+ `.test.ts`), `e2e/export/acceptance.mts` | A `lightCorners(file)` check that every page is dark at its corners, in `exportAs`. |

---

### Task 1: Pages print dark, edge to edge

**Files:** `lib/export/render-pdf.ts`, `lib/export/render-pdf.test.ts`, `app/export/[clientSlug]/[section]/page.tsx`, `app/export/[clientSlug]/[section]/page.test.tsx`.

**Interfaces:** `PageLike.pdf(o)` becomes `{ width?: string; height?: string; preferCSSPageSize: boolean; printBackground: boolean; timeout: number }`, with no `margin`.

- [ ] **Step 1: Write the failing tests**

In `render-pdf.test.ts`, replace the `toHaveBeenCalledWith` at line 31:

```ts
  // Spec 2026-10-13 §3: size and margins come from the export page's @page rule, which also paints the page black to its
  // edges; a page.pdf() margin would print as a white frame.
  expect(page.pdf).toHaveBeenCalledWith({ preferCSSPageSize: true, printBackground: true, timeout: expect.any(Number) })
```

In `page.test.tsx`, add:

```tsx
// Spec 2026-10-13 §3: every page is black to its edges with a 0.4 in margin. The @page rule is inline on this page only, so
// it can't reach another route's stylesheet (browser printing of GA4 and others).
test('the page sets a black Letter-landscape page with a 0.4 in margin, and a black body', async () => {
  const r = await open({})
  if ('redirect' in r) throw new Error('unexpected redirect')
  const css = findElements(r.element, (e) => e.type === 'style').map((e) => String((e.props as { children: unknown }).children)).join('\n')
  expect(css).toMatch(/@page\s*\{\s*size:\s*11in 8\.5in;\s*margin:\s*0\.4in;\s*background:\s*#000;?\s*\}/)
  expect(css).toMatch(/html,\s*body\s*\{\s*background:\s*#000 !important;\s*margin:\s*0;\s*\}/)
})
```

- [ ] **Step 2: Run and watch both fail.** Run `npx vitest run lib/export/render-pdf.test.ts "app/export/[clientSlug]/[section]/page.test.tsx"`. Expected: FAIL. `pdf` is called with `margin`, and the style has `#fff` and no `@page`.

- [ ] **Step 3: Implement.**
  - `render-pdf.ts`:
    - delete `const MARGIN = '0.4in'`;
    - the `page.pdf()` call becomes `{ preferCSSPageSize: true, printBackground: true, timeout: … }` (keep the existing timeout expression);
    - update the `PageLike.pdf` parameter type;
    - the `CONTENT_WIDTH`/`CONTENT_HEIGHT` comment says the 0.4 in margins come from the export page's `@page` rule.
  - `page.tsx`:

    ```tsx
          {/* The PDF page: Letter landscape, 0.4 in margins, black to its edges like the live page (spec 2026-10-13 §3). A
              page.pdf() margin would print white; @page's own background fills it. Inline here, never in a shared stylesheet. */}
          <style>{'@page { size: 11in 8.5in; margin: 0.4in; background: #000; } html, body { background: #000 !important; margin: 0; }'}</style>
    ```

- [ ] **Step 4: Run them; they pass.** Then run the whole `lib/export` and `app/export` folders.

- [ ] **Step 5: Commit** `feat(export): pages print black to their edges (CSS @page, no page.pdf margin)`.

---

### Task 2: The theme stops re-colouring for white paper

**Files:** `app/export/export-theme.css`, `app/export/export-theme.test.ts`.

- [ ] **Step 1: Write the failing test.**
  - Delete the theme tests that assert white-paper remaps: "inside a dark chart panel…", "bright brand text colours are darkened…", and "inline brand text colours are remapped…" with its helpers.
  - Add:

```ts
// Spec 2026-10-13 §3: the PDF prints dark like the live page, so nothing re-colours for white paper; the layout rules stay.
test('the theme re-colours nothing: no text, surface, border, inline-colour or chart-panel overrides', () => {
  expect(css).not.toMatch(/--color-white|background:\s*#fff|\.bg-bg-surface|\.text-text-muted|\.border-white|\[style[\^*$]=|data-export-chart|data-export-bars|color:\s*#(111|15803d|b91c1c)/i)
})

test('the layout rules, fonts and hiding stay', () => {
  for (const rule of ['.export-theme [data-export-block]', '.export-theme [data-export-keep-with-next]', '.export-theme [data-export-row] { break-inside: avoid; }',
    '.export-theme [data-export-table] thead { break-inside: avoid; }', '.export-theme [data-export-scroll]', '.export-theme [data-export-wrap] .truncate',
    '.export-theme [data-export-hide]', '.export-theme .no-print', "--font-sans: 'Nunito Sans', 'Noto Sans Math', 'Noto Color Emoji', sans-serif;"]) {
    expect(css).toContain(rule)
  }
})
```

- [ ] **Step 2: Run** `npx vitest run app/export/export-theme.test.ts`. Expected: the first new test FAILs.

- [ ] **Step 3: Implement.**
  - **Header comment:** say the export prints dark like the live page; this file only adds layout rules and fonts.
  - **`.export-theme`:** keep `--font-sans`, `--font-mono` and `font-family`. Remove `--color-white`, `color` and `background`.
  - **Delete:** the Surfaces, Text, inline-colour, `data-export-bars`, Borders and chart-panel blocks (lines 66–135 on `4253153`).
  - **Keep:** `a[data-export-link]`.

- [ ] **Step 4: Run them; they pass.** Then run the full suite. Golden and marker tests may still pass here; the markers are Task 3.

- [ ] **Step 5: Commit** `feat(export): the theme prints the page's own dark colours (white-paper remaps removed)`.

---

### Task 3: Remove the white-paper markers and the hero's export-only panel

**Files:**
- **Remove `data-export-chart`:**
  - `components/charts/bar-chart.tsx`, `line-chart.tsx` (drop the `panel` const; keep `exportMode` for animation and labels);
  - `executive-overview/{new-returning,sessions-trend-chart,channel-tabs-chart,demand-journey}.tsx`;
  - `peec-ai/{visibility-chart,content-impact,pr-influence-tables}.tsx`, `peec-ai/parts/domains-row.tsx`;
  - `paid-search/{hero,leads-section}.tsx`;
  - `organic-social/parts/kpi-check-in.tsx`.
- **Remove `data-export-bars`:** `executive-overview/{contact-pacing,pipeline-performance}.tsx`.
- **Hero:** keep the `data-export-block`; drop `'space-y-3 rounded-lg border border-white/[0.06] bg-bg-surface p-5'` (always `'space-y-3'`) and the comment about a dark panel.
- **Tests:** every test asserting `data-export-chart`, `data-export-bars` or the hero panel; the AEO goldens.

- [ ] **Step 1: Update the tests first.**
  - Each `hasAttribute('data-export-chart')` assertion becomes `.toBe(false)`, or is dropped where the test is about something else.
  - Add to `paid-search.export.test.tsx`: `expect(section.className).toBe('space-y-3')`.
  - The `data-export-bars` CSS test in `executive-overview/structure.export.test.tsx` is replaced:

```tsx
// Spec 2026-10-13: the bars print in their live brand green on the dark page; nothing marks or re-colours them.
test('the CRM bars carry no export colour marker', () => {
  expect(render(<ContactPacing data={CONTACTS} />).container.querySelector('[data-export-bars]')).toBeNull()
  expect(render(<PipelinePerformance data={PIPELINE} />).container.querySelector('[data-export-bars]')).toBeNull()
})
```

  - Drop its now-unused `readFileSync`, `join` and `renderToStaticMarkup` imports.
  - Find every assertion with `grep -rln "data-export-chart\|data-export-bars" components app lib | grep test`.

- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run components/charts components/report-sections`. Expected: the updated assertions FAIL. Goldens still pass: they hold the attribute, and Task 3 removes it.

- [ ] **Step 3: Implement.** Remove the attributes, the hero panel classes, and the comments that explain the dark panel.

- [ ] **Step 4: Re-baseline the goldens and prove the diff is attribute-only.**
  - Run `npx vitest run components/report-sections/peec-ai -u`.
  - Run `git diff -U0 -- '*.snap'`. Every removed line must be a `data-export-chart=""` attribute line or re-appear with only that attribute stripped; there must be no added content lines. Script it as in PR 2 and record the line count.

- [ ] **Step 5: Run the full suite, `tsc` and `check:rsc`; all green.** `grep -rn "data-export-chart\|data-export-bars" components app lib` must return nothing.

- [ ] **Step 6: Commit** `refactor(export): drop the white-paper markers (data-export-chart, data-export-bars) and the hero's export-only panel`.

---

### Task 4: Prove it — Chromium 153, every page dark, the page check

**Files:** `e2e/export/pdf-check.ts`, `e2e/export/pdf-check.test.ts`, `e2e/export/acceptance.mts`.

**Interfaces:**
- `export function cornerLevels(pgm: Buffer): number[]` returns the grey levels of the four corners of a binary PGM.
- `export function lightCorners(file: string): number[]` returns the 1-based pages with a corner lighter than 40/255.

- [ ] **Step 1: Write the failing test** (`pdf-check.test.ts`):

```ts
// Spec 2026-10-13 §6: a page whose corner isn't dark printed a white frame (the old page.pdf margin) or a white page.
test('the four corner levels of a PGM page', () => {
  const w = 3, h = 2, px = [10, 200, 20, 30, 40, 250]  // rows: [10 200 20] [30 40 250]
  const pgm = Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), Buffer.from(px)])
  expect(cornerLevels(pgm)).toEqual([10, 20, 30, 250])
})
```

- [ ] **Step 2: Run it and watch it fail** (no export).

- [ ] **Step 3: Implement.**
  - **`cornerLevels`:** parse the `P5` header (whitespace-separated width, height and max value, then a single whitespace byte) and read the corner bytes.
  - **`lightCorners`:** run `pdftoppm -gray -r 10 <file> <tmpdir>/p`, which writes `p-1.pgm`, `p-2.pgm`, …. Read each page, keep the page numbers where `Math.max(...cornerLevels) > 40`, then remove the tmpdir.
  - **`exportAs` in `acceptance.mts`:** add `check(lightCorners(file).length === 0, \`${name}: every page dark to its edges (light: ${lightCorners(file).join(', ') || 'none'})\`)`. Compute it once, not twice.

- [ ] **Step 4: Run it; it passes.** Then run the full suite.

- [ ] **Step 5: Chromium 153, the deployed binary** (Review Focus 1).
  - Run the spike page (approach D: `@page { margin: 0.4in; background: #1a1a1a }`, `preferCSSPageSize: true`, 60 cards) through `@sparticuz/chromium` 153 inside `docker run --platform linux/amd64 node:22`. Mount `puppeteer-core` and `@sparticuz/chromium` read-only from the worktree's `node_modules`.
  - Check every page's corners are dark and continuation pages keep their top margin, using the same measure as the spike.
  - If it fails, stop and switch to the spec's §5 fallback (`box-decoration-break: clone`) as a ruling.

- [ ] **Step 6: Build and run the live acceptance.** Run `npm run build`, start the server on port 3457 with `APP_URL` and `AUTH_TRUST_HOST`, then `npm run -s e2e:export`.
  - Expected: all checks pass, plus "every page dark to its edges" on every export.
  - Stop the server afterwards.

- [ ] **Step 7: Page check** (Review Focus 2, 3, 5).
  - Make a 40 px contact sheet of every client PDF (Organic Social, the APFM Instagram tab, AEO, Paid Media's four tabs, the Executive Overview), plus 110 dpi crops of a table continuation page, muted text and a KPI Check-In card.
  - Check:
    - no white frame or panel;
    - charts and cards are consistent;
    - muted text and borders read;
    - no stranded titles.
  - Any defect gets a test first, then the fix.

- [ ] **Step 8: Commit** `test(export): the acceptance run checks every page is dark to its edges`.

---

### Task 5: Final review, PR and review record

- [ ] **Final whole-branch review:** a fresh reviewer on the most capable model, on `4253153..HEAD`, with this plan, the spec and this Review Focus.
  - Re-grade the findings. Fix Critical and Important ones test-first in one pass. Defer Minors to the record.
- [ ] **PR:** push `feat/pdf-export-dark` and open the PR to `dev`, titled `feat(export): PDFs print dark, edge to edge, like the reporting page`. The body covers the before/after, the spike, the Chromium 153 container check, the acceptance and page-check results.
- [ ] **Review record:** branch `docs/pdf-export-dark-review` off `origin/dev`, file `docs/qa/pdf-export-dark-code-review.md`, in the CLAUDE.md skeleton, opened as its own PR.
- [ ] **Do not merge.**
