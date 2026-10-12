# Organic Social PDF Export v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export PDF on Organic Social renders a dedicated export page in headless Chromium on the server, only once fully loaded, as a letter-landscape PDF where nothing is cut off, client-visible annotations print, and posts are links.

**Architecture:** A `POST /api/export/pdf` route authorises the requester like the portal page does, launches Chromium (`@sparticuz/chromium` on Vercel, local Chrome otherwise), forwards the requester's own session cookie, opens `/export/[clientSlug]/organic-social` at 979 px wide, waits for `window.__exportReady`, and prints with screen media. The export page renders the existing `OrganicSocialReport` inside an export-mode context; client components switch to static, block-structured rendering; a scoped stylesheet supplies the light theme and `break-inside: avoid` for `[data-export-block]`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Recharts 3, `puppeteer-core@25.12.0`, `@sparticuz/chromium@153.0.0`, vitest + Testing Library, poppler `pdftotext` (local acceptance script only).

**Spec:** `docs/superpowers/specs/2026-10-06-organic-social-pdf-export-v2-design.md`

## Global Constraints

- Page: US Letter landscape, `width: '11in', height: '8.5in'`, margins `0.4in` all sides; content box **979 × 739 CSS px**; viewport width **979**.
- Readiness cap **45 s**; route `maxDuration = 60`; one browser per request; browser closed in `finally`.
- Responses: 403 `{error:'forbidden'}` (no session / access denied), 404 `{error:'not-found'}` (client missing or Organic Social not enabled), 400 `{error:'bad-request'}` (invalid body), 504 `{error:'still-loading'}`, 500 `{error:'render-failed'}`.
- Role and client come only from the session; the request body never carries them.
- Never log cookie values or full URLs with query strings.
- Only `http(s)` URLs become links (`safeHref`).
- Printed annotations = not `hidden` and not draft-only (`noteOnly && !note`).
- Filename: `<Client> – <Page> – <YYYY-MM-DD>.pdf` (en dashes), the date in the requester's timezone.
- Stamp: `Exported <MMM d, yyyy, h:mm a> <tz abbrev> · Reporting period <range>` (period only where the page range applies, always true on Organic Social).
- Organic Social only; every other section keeps #320's browser-print button.
- Branch flow: work on `feat/organic-social-pdf-export-v2`; **open PRs only, never merge to dev, staging or main.**

## Deviations from the spec (decided while planning, recorded in the PR)

1. **Shared resolver narrowed.** `OrganicSocialBody` already resolves the locked month from the raw `dateRange` (`components/report-sections/organic-social/index.tsx:85-95`), so the export page passes the URL's range through and gets the live page's served range by construction. The new resolver covers only what the export header and filename need (tab, title, period), and a parity test pins it against both report pages. The pages are not refactored.
2. **Acceptance without MSW fixtures.** The DB is Neon over HTTP; faking Drizzle's SQL-over-HTTP responses would be brittle. Instead: (a) a deterministic **static fixture** rendered through the real `renderPdf` checks the block model (long sections, long note, many rows) and the never-ready → `ExportNotReadyError` path; (b) a **live** run of the real route on a local production build against Renaissance data checks the full pipeline. Both assert on the PDF via `pdftotext -bbox`. The script runs locally (CI has no Chromium); its output goes into the review record.
3. **Chart panels stay dark.** Brand line colours (`#60FDFF`, `#FFFC60`) are unreadable on white; the light theme keeps each chart's panel dark (`[data-export-chart]`) rather than inventing a print palette.

---

## File Structure

| File | Responsibility |
|---|---|
| `components/export/export-mode.tsx` (new, client) | `ExportModeProvider`, `useExportMode()`, `ExportReadyReporter` |
| `lib/export/readiness.ts` (new) | `isDocumentReady(doc)` — pure DOM check used by the reporter |
| `lib/export/filename.ts` (new) | `exportFilename()`, `contentDisposition()`, `exportStamp()` |
| `lib/export/request.ts` (new) | `parseExportRequest(body)` validation, `exportPagePath()` |
| `lib/export/organic-social-view.ts` (new) | `organicSocialExportView(client, subsection)` → `{ subsectionId, pageTitle }` |
| `lib/export/render-pdf.ts` (new) | `renderPdf({url, cookies}, deps)`, `ExportNotReadyError`, `ExportRenderError`, `launchChromium()` |
| `app/api/export/pdf/route.ts` (new) | Auth, validation, render, response, log line |
| `app/export/[clientSlug]/organic-social/page.tsx` (new) | The export page |
| `app/export/export-theme.css` (new) | Scoped light theme + block rules (imported by the export page only) |
| `lib/organic-social/annotations.ts` (modify) | add `isClientVisible(a)` |
| `components/report-sections/organic-social/export-annotations.tsx` (new, client) | Numbered static annotation list |
| `components/charts/line-chart.tsx` (modify) | `ChartMark.label`; animation off in export mode; mark labels |
| `components/report-sections/organic-social/trends.tsx` (modify) | Export rendering of `ChannelTrendChart` |
| `components/report-sections/organic-social/annotation-callouts.tsx` (modify) | use `isClientVisible`; export `Thumb` |
| `components/report-sections/organic-social/sortable-top-content.tsx` (modify) | Export rendering: heading glued, rows of 5, no pager/hidden/sort buttons |
| `components/report-sections/organic-social/post-card.tsx` (modify) | Export: whole-card link, link styling, no toggle, video poster |
| `components/report-sections/organic-social/parts/top-content.tsx` (modify) | Pass heading into `SortableTopContent` in export mode |
| `components/report-sections/organic-social/ctx.ts`, `index.tsx` (modify) | `exportMode` on the ctx / report props |
| `components/report-sections/organic-social/skeletons.tsx` (modify) | `data-export-pending` on `Pulse` |
| `components/report-sections/organic-social/platform-headlines.tsx` (modify) | `data-export-block` on each platform section |
| `components/report-sections/shared/shared-parts-header.tsx` (modify) | pending marker fallback |
| `components/report-sections/commentary/commentary-panel.tsx` (modify) | Export: approved entry only, no controls, one block |
| `components/export-pdf-button.tsx` (modify) | `serverExport` mode: POST, progress, download, inline error |
| `app/{portal,dashboard}/[clientSlug]/reports/page.tsx` (modify) | pass `serverExport` on Organic Social |
| `lib/auth/route-access.ts`, `proxy.ts` (modify) | treat `/export/<slug>` like `/portal/<slug>` |
| `next.config.ts`, `package.json`, `.env.example`, `vitest.config.ts` (modify) | deps, external packages, file tracing, env doc, test registration |
| `e2e/export/acceptance.ts`, `e2e/export/fixture.html`, `e2e/export/pdf-check.ts` (new) | Local acceptance script |

---

### Task 1: Dependencies, config, and export-mode context

**Files:** Modify `package.json`, `next.config.ts`, `.env.example`, `vitest.config.ts`. Create `components/export/export-mode.tsx`, `lib/export/readiness.ts`, `lib/export/readiness.test.ts`.

**Produces:** `ExportModeProvider({children})`, `useExportMode(): boolean`, `ExportReadyReporter()` (sets `window.__exportReady = true`), `isDocumentReady(doc: Document): boolean`.

- [ ] `npm install puppeteer-core@25.12.0 @sparticuz/chromium@153.0.0`
- [ ] `next.config.ts`: add `serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']` and `outputFileTracingIncludes: { '/api/export/pdf': ['./node_modules/@sparticuz/chromium/bin/**'] }`.
- [ ] `.env.example`: document `CHROME_EXECUTABLE_PATH` (local only; Vercel uses `@sparticuz/chromium`).
- [ ] Failing tests `lib/export/readiness.test.ts`: not ready while a `[data-export-pending]` exists; not ready while an `<img>` is incomplete; not ready while a `.recharts-responsive-container` has no `.recharts-surface`; ready otherwise.
- [ ] Implement `isDocumentReady`:

```ts
export function isDocumentReady(doc: Document): boolean {
  if (doc.querySelector('[data-export-pending]')) return false
  for (const img of Array.from(doc.images)) if (!img.complete) return false
  for (const rc of Array.from(doc.querySelectorAll('.recharts-responsive-container')))
    if (!rc.querySelector('.recharts-surface')) return false
  return true
}
```

- [ ] `export-mode.tsx`: context default `false`; `ExportReadyReporter` polls each animation frame, requires `isDocumentReady` true on two consecutive checks after `document.fonts.ready`, then sets `window.__exportReady = true` and stops.
- [ ] Register tests in `vitest.config.ts`; run; commit `feat(export): v2 deps, export-mode context and readiness check`.

### Task 2: Export request, filename, stamp, view

**Files:** Create `lib/export/request.ts`, `lib/export/filename.ts`, `lib/export/organic-social-view.ts` and their tests.

**Produces:**
- `parseExportRequest(body: unknown): ExportRequest | null` where `ExportRequest = { clientSlug: string; subsection: string | null; dateRange: string; compareRange: string | null; tz: string }` — slug/subsection `^[a-z0-9-]{1,64}$`, ranges ≤ 64 chars of `[A-Za-z0-9_:,-]`, `tz` valid for `Intl.DateTimeFormat` (else `'UTC'`).
- `exportPagePath(r: ExportRequest): string` → `/export/<slug>/organic-social?dateRange=…[&compareRange=…][&subsection=…]&tz=…`.
- `exportFilename(client: string, page: string, now: Date, tz: string): string` → `Renaissance – Organic Social – 2026-10-06.pdf` (date in `tz`; strips `/\\:*?"<>|` and control chars).
- `contentDisposition(name: string): string` → `attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>`.
- `exportStamp(now: Date, tz: string, period: string | null): string` → `Exported Oct 6, 2026, 10:17 AM EDT · Reporting period Sep 6 – Oct 5, 2026`.
- `organicSocialExportView(client, subsectionParam): { subsectionId: string | null; pageTitle: string }` using `resolveOrganicSubsection` — Overview title `REPORT_NAMES['organic-social'] ?? 'Organic Social'`, a tab's `organicEntry.label`; a parity test renders both report pages' trees for Overview and a platform tab and asserts the `ExportPdfButton`'s `pageTitle` equals `pageTitle` here.
- [ ] Tests first (valid/invalid bodies incl. role/clientSlug-in-body ignored, path encoding, filename sanitising and tz date, disposition encoding, stamp, view parity); implement; run; commit `feat(export): request parsing, filename, stamp and Organic Social view`.

### Task 3: `renderPdf`

**Files:** Create `lib/export/render-pdf.ts`, `lib/export/render-pdf.test.ts`.

**Produces:** `renderPdf(opts: { url: string; cookies: { name: string; value: string }[]; readyTimeoutMs?: number }, deps?: { launch: () => Promise<BrowserLike> }): Promise<Uint8Array>`; `class ExportNotReadyError`; `class ExportRenderError { step: 'launch'|'navigate'|'auth'|'pdf' }`; `launchChromium()`.

- [ ] Failing tests with a fake browser/page: success sets viewport 979×739, cookies for the URL, waits for `window.__exportReady === true`, `emulateMediaType('screen')`, `pdf` called with letter-landscape + 0.4in margins + `printBackground: true`, browser closed; ready timeout → `ExportNotReadyError` and browser closed; landing on `/login` or `/unauthorized` → `ExportRenderError('auth')`; HTTP ≥ 400 → `ExportRenderError('navigate')`; launch throws → `ExportRenderError('launch')`.
- [ ] Implement; `launchChromium()` uses `@sparticuz/chromium` (`executablePath()`, `args`, headless) when `process.env.VERCEL` is set, else `CHROME_EXECUTABLE_PATH` (throws `ExportRenderError('launch')` if unset).
- [ ] Run; commit `feat(export): renderPdf over puppeteer-core`.

### Task 4: Route and access

**Files:** Create `app/api/export/pdf/route.ts`, `app/api/export/pdf/route.test.ts`. Modify `lib/auth/route-access.ts` (+ its test), `proxy.ts`.

- [ ] Failing route tests (mock `@/auth`, `getClientBySlug`, `renderPdf`): no session → 403; client role, other slug → 403; client, own slug → 200 `application/pdf` with `Content-Disposition`; staff any slug → 200; body with `role`/`clientSlug` for another client cannot widen access; invalid body → 400; Organic Social not enabled → 404; `ExportNotReadyError` → 504; `ExportRenderError` → 500; only `authjs.session-token*` cookies forwarded.
- [ ] Route: `export const runtime = 'nodejs'`, `maxDuration = 60`; base URL = `VERCEL_URL` (https) → `APP_URL` → request origin; one `console.info('[export] …')` line with slug, subsection, outcome, ms, step.
- [ ] `routeAccess`: `(area === 'portal' || area === 'export') && canOpenPortal(slug, session)`; test added. `proxy.ts` matcher adds `'/export/:path*'`.
- [ ] Run; commit `feat(export): POST /api/export/pdf`.

### Task 5: Export page, theme, pending markers

**Files:** Create `app/export/[clientSlug]/organic-social/page.tsx`, `app/export/export-theme.css`. Modify `components/report-sections/organic-social/skeletons.tsx`, `shared/shared-parts-header.tsx`, `organic-social/ctx.ts`, `organic-social/index.tsx`, `platform-headlines.tsx`.

- [ ] Failing tests: `Pulse` carries `data-export-pending`; `SharedPartsHeader` fallback is a hidden pending marker; `PlatformSection` carries `data-export-block`; `OrganicSocialReport` passes `exportMode` into ctx.
- [ ] Page: `requirePortalAccess(slug)`; client + Organic Social enabled else `notFound()`; `organicSocialExportView`; header (logo `<img>`, client, title, `exportStamp(now, tz, exportPeriodLabel(served))` where served is the locked month when locked, else the URL range); `<TooltipProvider><ExportModeProvider><OrganicSocialReport … exportMode /></ExportModeProvider></TooltipProvider><ExportReadyReporter />`; wrapper `export-theme`, width 979 px; `<style>` sets `html, body { background:#fff }`.
- [ ] `export-theme.css`: `[data-export-block]{break-inside:avoid}`; light remaps for `bg-bg-surface`, `bg-bg-subtle`, `text-text-muted`, `text-white`, `text-white/90`, `border-white/[…]`, `bg-white/[…]`, brand green/red deltas; `[data-export-chart]` restores the dark panel.
- [ ] Run; commit `feat(export): export page, theme and pending markers`.

### Task 6: Annotations in the export

**Files:** Modify `lib/organic-social/annotations.ts` (+ test), `annotation-callouts.tsx`, `components/charts/line-chart.tsx` (+ test), `trends.tsx`. Create `export-annotations.tsx` (+ test).

- [ ] Failing tests: `isClientVisible` truth table; `LineChart` renders mark labels and sets `isAnimationActive={false}` under `ExportModeProvider`; `ChannelTrendChart` in export mode renders no note form / annotation toggle / callout hit areas, numbered marks only for client-visible on-series days, `ExportAnnotationList` with entries in date order with number, date, label, note, linked thumbnails, chart block marked `data-export-block` + `data-export-chart`; list heading inside the first entry's block.
- [ ] Implement; `shown` and `nothingPrintable` use `isClientVisible`.
- [ ] Run; commit `feat(export): annotations print as numbered marks and a list`.

### Task 7: Top Content and Commentary in the export

**Files:** Modify `sortable-top-content.tsx` (+ test), `post-card.tsx` (+ test), `parts/top-content.tsx`, `commentary-panel.tsx` (+ test).

- [ ] Failing tests: in export mode cards chunk into rows of 5 (`grid grid-cols-5`), first row's block holds the section heading (when given), "Sorted by Engagements" line and platform label; later rows their own blocks; no pager, sort buttons or hidden-influencer control; card is one `<a>` to `safeHref(url)` with "View post ↗"; no designation toggle; video shows its poster `<img>`; commentary shows the latest approved entry only, no editor/select/status/collapse, `data-export-block` on the section.
- [ ] Implement.
- [ ] Run; commit `feat(export): Top Content rows and Commentary for export`.

### Task 8: Button

**Files:** Modify `components/export-pdf-button.tsx` (+ test), both report pages (+ parity snapshot update).

- [ ] Failing tests: with `serverExport` the click POSTs `{clientSlug, subsection, dateRange, compareRange, tz}`, shows "Preparing PDF…", downloads the blob with the filename from `Content-Disposition`, shows the 504/403/500 messages inline; without it, unchanged print behaviour (existing tests stay green).
- [ ] Pages pass `serverExport` when `activeSection === 'organic-social'` (subsection = `organicEntry.id`, served ranges).
- [ ] Run full suite; update `locked-months-parity` snapshot only for the new prop (verify diff); commit `feat(export): Export PDF uses the server export on Organic Social`.

### Task 9: Acceptance script and verification

**Files:** Create `e2e/export/fixture.html`, `e2e/export/pdf-check.ts`, `e2e/export/acceptance.ts`; `package.json` script `e2e:export`.

- [ ] `pdf-check.ts`: run `pdftotext -bbox-layout`, parse pages/blocks/words; helpers `pageOf(text)`, `assertSamePage(a, b)`, `assertInsideContentBox()`, `countLinks(pdf)` (`/URI` occurrences), `assertAbsent(text)`.
- [ ] Fixture: synthetic export page (export-theme.css inlined) with 3 sections of many blocks, a title near a page end, a 1200 px-tall note block, 4 rows of 5 cards; plus a "never ready" variant. Through real `renderPdf` (local Chrome): titles share a page with first block; every non-oversized block on one page; nothing outside the content box; never-ready → `ExportNotReadyError`.
- [ ] Live: local `next build && next start`, minted Renaissance client cookie, POST the route for Overview; assert status 200, filename, stamp text, no skeleton text, all text inside the box, link count ≥ number of "View post" entries.
- [ ] `npx vitest run`, `npx tsc --noEmit`, lint changed files; run `npm run e2e:export`; commit.

### Task 10: PRs

- [ ] Check whether Vercel deployment protection covers preview deploys (`curl -sI` the PR's preview URL: a 401 with `_vercel_sso` means protected); record the answer and, if protected, the bypass need, in the PR.
- [ ] Push `feat/organic-social-pdf-export-v2`; open PR into `dev` (supersedes #320: note it builds on #320's commits); write `docs/qa/organic-social-pdf-export-v2-code-review.md` on `docs/organic-social-pdf-export-v2-review` off `dev`, open its PR. Request Thomas. **Do not merge anything.**
