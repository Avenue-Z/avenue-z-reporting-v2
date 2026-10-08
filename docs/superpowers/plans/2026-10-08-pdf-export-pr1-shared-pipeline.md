# PDF Export — PR 1: Shared Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the Organic Social-only server PDF export so the route, request, export page and button work for any section in an allow-list. The allow-list ships as `['organic-social']`, so users see no change until PR 2 (AEO) and PR 3 (Paid Media) switch their sections on.

**Architecture:**
- **Request:** `ExportRequest` gains `section` and `models`.
- **Resolving the view:** a pure resolver, `resolveExportView` (lib), turns client, section and tab into `{ section, subsectionId, pageTitle, channel }`. The route and the export page both use it.
- **Building the report:** a separate builder, `exportReportElement` (components), returns the live report component with the props the report pages pass. Only the export page uses it, so the route never imports report components.
- **Parity test:** pins both functions to the real portal and dashboard routes.
- **Charts:** the shared `BarChart` and `ComboChart` turn off animation in export mode.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, vitest + Testing Library, Recharts 3, puppeteer-core / @sparticuz/chromium (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md` §4, §9, §10 (PR 1 parts).

## Deviations from the spec (decided while planning)

1. **The spec's single `exportReportView` is split in two.** `resolveExportView` (pure, in `lib/`) returns the tab and title; `exportReportElement` (in `components/`) builds the report element. This keeps the route handler from importing every report component (server components, some with client children), which it would otherwise bundle for no use.
2. **No `periodShown` field.** Every resolved Organic Social, AEO and Paid Media tab uses the page range (both pages' `usesPageRange`), so the export always stamps a period. The parity test asserts the page's button has a non-null `periodLabel` for each resolved tab, which pins this. A later section that doesn't use the page range adds the field then.
3. **The AEO-only charts' animation move to PR 2.** That's the slope chart, the bot-vs-human scatter and PR Influence's cluster bar chart. PR 1 covers the shared `BarChart` and `ComboChart`.

## Global Constraints

- **Branch:** `feat/pdf-export-shared-pipeline`, cut from `origin/dev`. One PR into `dev`, plus a review-record PR, `docs/qa/pdf-export-shared-pipeline-code-review.md` (CLAUDE.md "Branch Flow"). Never merge without Paul's go-ahead.
- **Allow-list:** `SERVER_EXPORT_SECTIONS` ships as exactly `['organic-social']`. Every behaviour visible to users stays as it is today.
- **Request input:** role and client identity never come from the request body. Every body field is validated with a strict pattern before it reaches a URL.
- **Fixed values:** the 40 s ready budget, 55 s print deadline, 4 MB refusal, and the log-line format (one field added) are unchanged.
- **Unchanged files:** no live report page behaviour changes, apart from the button receiving `section` and `models`.
- **Before every commit:** run `git checkout -q -- CLAUDE.md`, because `next build` and `next dev` regenerate it.
- **Tests:** new vitest files must match a glob in `vitest.config.ts`'s `include`, or be added to it.
- **Commits:** end the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Deploy skew.** A page loaded before this PR posts a body with no `section`. Expect it to export Organic Social as before, not fail with 400. Pinned in Task 1.
2. **A section that's enabled but not switched on.** `peec-ai` is enabled for the client but not in the allow-list. A POST naming it is a 400, and opening `/export/<slug>/peec-ai` directly is a 404. Chromium never launches. Pinned in Tasks 1, 3 and 4.
3. **A tab the client has hidden.** `subsection: 'technical-audit'` with `technical-audit` in `hiddenReports` resolves to the AEO Overview, as the page does, never the hidden tab. Pinned in Task 2.
4. **Hostile `models`.** `models: 'ChatGPT&x=1'` or a 500-character string is a 400. Unknown model names inside a valid string are dropped by `parseModelsParam`, as on the page. Pinned in Task 1.
5. **Page drift.** The dashboard drops Paid Media Overview's `compareRange` and the portal passes it. The export follows the portal, and the test names the drift instead of hiding it. Pinned in Task 2.

---

### Task 1: Section allow-list and request fields

**Files:**
- Create: `lib/export/sections.ts`
- Modify: `lib/export/request.ts`
- Test: `lib/export/request.test.ts`

**Interfaces:**
- Produces:
  - `type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media'`
  - `SERVER_EXPORT_SECTIONS: readonly ServerExportSection[]`
  - `isServerExportSection(s: unknown): s is ServerExportSection` (true only for sections in the allow-list)
  - `ExportRequest` gains `section: ServerExportSection` and `models: string | null`
  - `exportPagePath(r)` returns `/export/<slug>/<section>?…`

- [ ] **Step 1: Write the failing tests.** Replace the top of `lib/export/request.test.ts` and add the new cases:

```ts
import { expect, test } from 'vitest'
import { exportPagePath, parseExportRequest } from './request'

const ok = { clientSlug: 'renaissance', section: 'organic-social', subsection: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, models: null, tz: 'America/New_York' }

test('a well-formed body parses', () => {
  expect(parseExportRequest(ok)).toEqual(ok)
  expect(parseExportRequest({ ...ok, subsection: 'instagram', compareRange: 'previous_period' }))
    .toEqual({ ...ok, subsection: 'instagram', compareRange: 'previous_period' })
})

// A page loaded before the export took a section posts none; its button was Organic Social's.
test('a body with no section is Organic Social', () => {
  const { section: _, ...old } = ok
  expect(parseExportRequest(old)).toEqual(ok)
})

// Only sections switched on for the server export (lib/export/sections.ts). AEO and Paid Media are
// enabled by their own PRs; until then their button prints in the browser and the route refuses them.
test.each(['peec-ai', 'paid-media', 'ga4', '../dashboard', 3])('a section not switched on (%s) is refused', (section) => {
  expect(parseExportRequest({ ...ok, section })).toBeNull()
})

test('the model filter passes through as the page wrote it', () => {
  expect(parseExportRequest({ ...ok, models: 'ChatGPT,Claude' })?.models).toBe('ChatGPT,Claude')
})

test.each([
  ['a query in it', 'ChatGPT&x=1'],
  ['a space', 'Chat GPT'],
  ['too long', 'a'.repeat(129)],
  ['not a string', ['ChatGPT']],
])('a model filter with %s is refused', (_, models) => {
  expect(parseExportRequest({ ...ok, models })).toBeNull()
})
```

Keep the existing `role and any other field…`, `rejects %s` and `unknown timezone` tests unchanged; they now use the new `ok`. Replace the path test with:

```ts
test('the export page path is the section, then only the view parameters, encoded', () => {
  expect(exportPagePath(ok)).toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&tz=America%2FNew_York')
  expect(exportPagePath({ ...ok, subsection: 'linkedin', compareRange: 'previous_period' }))
    .toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&compareRange=previous_period&subsection=linkedin&tz=America%2FNew_York')
  expect(exportPagePath({ ...ok, section: 'peec-ai', subsection: 'pr-influence', models: 'ChatGPT,Claude' }))
    .toBe('/export/renaissance/peec-ai?dateRange=custom%3A2026-09-01%2C2026-09-30&subsection=pr-influence&models=ChatGPT%2CClaude&tz=America%2FNew_York')
})
```

The last `exportPagePath` call types `section: 'peec-ai'` directly, because `exportPagePath` takes an `ExportRequest`, not a body.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/export/request.test.ts`
Expected: FAIL. `parseExportRequest` returns no `section` or `models`, the path has no section, and `peec-ai` isn't refused.

- [ ] **Step 3: Create `lib/export/sections.ts`**

```ts
// Which report sections the PDF export renders on the server (spec 2026-10-08-pdf-export-all-reports-design §4).
// A section joins SERVER_EXPORT_SECTIONS only once its components have export forms: PR 2 adds 'peec-ai', PR 3
// 'paid-media'. Until then its Export PDF button prints in the browser, and the route and export page refuse it.

export type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media'

export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social']

export function isServerExportSection(s: unknown): s is ServerExportSection {
  return typeof s === 'string' && (SERVER_EXPORT_SECTIONS as readonly string[]).includes(s)
}
```

- [ ] **Step 4: Update `lib/export/request.ts`**

Change the interface, parser and path builder:

```ts
import { isServerExportSection, type ServerExportSection } from './sections'

/** What the Export PDF button asks for. Role and client identity are never here: the route takes them
 *  from the session (app/api/export/pdf/route.ts). Every field is validated strictly, because the
 *  slug and ranges go into the URL the server's own browser opens. */
export interface ExportRequest {
  clientSlug: string
  /** Which report. A body without one is Organic Social: a page loaded before other sections could export. */
  section: ServerExportSection
  subsection: string | null
  dateRange: string
  compareRange: string | null
  /** AEO's model filter as the page's `?models=` holds it (comma-separated names), or null. */
  models: string | null
  /** The requester's IANA timezone, for the stamp and the filename date. */
  tz: string
}

const SLUG = /^[a-z0-9-]{1,64}$/
const RANGE = /^[A-Za-z0-9_:,-]{1,64}$/
const MODELS = /^[A-Za-z,]{1,128}$/
```

In `parseExportRequest`, after the `compareRange` check and before the `return`:

```ts
  const section = b.section ?? 'organic-social'
  if (!isServerExportSection(section)) return null
  if (b.models != null && (typeof b.models !== 'string' || !MODELS.test(b.models))) return null
```

The return gains `section` and `models`:

```ts
  return {
    clientSlug: b.clientSlug,
    section,
    subsection: (b.subsection as string | null | undefined) ?? null,
    dateRange: b.dateRange,
    compareRange: (b.compareRange as string | null | undefined) ?? null,
    models: (b.models as string | null | undefined) ?? null,
    tz: safeTimeZone(b.tz),
  }
```

`exportPagePath`:

```ts
/** The export page the server's browser opens for this request (app/export/[clientSlug]/[section]). */
export function exportPagePath(r: ExportRequest): string {
  const sp = new URLSearchParams()
  sp.set('dateRange', r.dateRange)
  if (r.compareRange) sp.set('compareRange', r.compareRange)
  if (r.subsection) sp.set('subsection', r.subsection)
  if (r.models) sp.set('models', r.models)
  sp.set('tz', r.tz)
  return `/export/${r.clientSlug}/${r.section}?${sp.toString()}`
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run lib/export/request.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check, then commit**

Run: `npx tsc --noEmit -p .`. Expected errors only where the route builds `r` from `parsed`, which Task 4 fixes. If anything else errors, fix it here.

```bash
git checkout -q -- CLAUDE.md
git add lib/export/sections.ts lib/export/request.ts lib/export/request.test.ts
git commit -m "feat(export): the export request names its section and carries AEO's model filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Resolving the view, building the report, and the parity test

**Files:**
- Create: `lib/export/report-view.ts`
- Create: `components/export/report-element.tsx`
- Create: `components/export/report-views.pages.test.tsx`
- Delete: `lib/export/organic-social-view.ts`, `lib/export/organic-social-view.pages.test.tsx`. Their cases move into the new test.

**Interfaces:**
- Consumes: `ServerExportSection` (Task 1).
- Produces:
  - `interface ExportView { section: ServerExportSection; subsectionId: string | null; pageTitle: string; channel: DashChannel | null }`
  - `resolveExportView(client: ExportViewClient, section: ServerExportSection, subsection: string | null): ExportView`
  - `type ExportViewClient = OrganicTabsClient` (`{ dashSocialConfig?, hiddenReports? }`)
  - `interface ExportViewParams { clientSlug: string; dateRange: string; compareRange: string | null; models: AEOModel[] | null }`
  - `exportReportElement(view: ExportView, p: ExportViewParams): ReactElement`

- [ ] **Step 1: Write the failing parity test** in `components/export/report-views.pages.test.tsx`

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/**
 * The export renders the live report: for every section and tab the export can render, the element
 * exportReportElement builds is the one each real report route renders (same component, same props),
 * and resolveExportView's title is the page's title. Spec 2026-10-08-pdf-export-all-reports-design §4.
 * Report components are stubbed by name, so nothing fetches.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined), requirePortalAccess: vi.fn(async () => undefined) }))
// vi.mock factories are hoisted above the file, so the helper they call must be too.
const { stub } = vi.hoisted(() => ({ stub: (name: string) => ({ [name]: { [name]: () => null }[name] }) }))
vi.mock('@/components/report-sections/organic-social', () => stub('OrganicSocialReport'))
vi.mock('@/components/report-sections/peec-ai', () => stub('PeecAIReport'))
vi.mock('@/components/report-sections/peec-ai/pr-influence', () => stub('PRInfluenceReport'))
vi.mock('@/components/report-sections/peec-ai/content-impact', () => stub('ContentImpactReport'))
vi.mock('@/components/report-sections/peec-ai/technical-audit', () => stub('TechnicalAuditReport'))
vi.mock('@/components/report-sections/paid-media/overview', () => stub('PaidMediaOverviewReport'))
vi.mock('@/components/report-sections/paid-search', () => stub('PaidSearchReport'))
vi.mock('@/components/report-sections/meta-ads', () => stub('MetaAdsReport'))
vi.mock('@/components/report-sections/linkedin-ads', () => stub('LinkedInAdsReport'))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { auth } from '@/auth'
import { parseModelsParam } from '@/lib/peec/models'
import { resolveExportView, type ExportViewClient } from '@/lib/export/report-view'
import { exportReportElement } from './report-element'
import type { ServerExportSection } from '@/lib/export/sections'

const REPORTS = new Set(['OrganicSocialReport', 'PeecAIReport', 'PRInfluenceReport', 'ContentImpactReport', 'TechnicalAuditReport',
  'PaidMediaOverviewReport', 'PaidSearchReport', 'MetaAdsReport', 'LinkedInAdsReport'])
const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'peec-ai', 'paid-media'], hiddenReports: [] as string[],
  dashSocialConfig: { brandId: 1 }, reportSectionConfig: {},
}
const Q = { dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period', models: 'ChatGPT,Claude' }
const CASES: [ServerExportSection, (string | undefined)[]][] = [
  ['organic-social', [undefined, 'organic-linkedin', 'not-a-tab']],
  ['peec-ai', [undefined, 'pr-influence', 'content-impact', 'technical-audit', 'not-a-tab']],
  ['paid-media', [undefined, 'paid-search', 'meta', 'linkedin', 'not-a-tab']],
]
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))
const params = { clientSlug: 'c', dateRange: Q.dateRange, compareRange: Q.compareRange, models: parseModelsParam(Q.models) }

async function onPage(Route: typeof PortalSpa, client: typeof CLIENT, section: string, subsection?: string) {
  getClientBySlug.mockResolvedValue(client)
  const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
    searchParams: Promise.resolve({ section, ...Q, ...(subsection ? { subsection } : {}) }) } as never))
  if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
  const [report] = findElements(r.element, (e) => REPORTS.has(nameOf(e.type)))
  const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
  return { report, button }
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com', clientSlug: 'c' } } as never)
})

for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  for (const [section, tabs] of CASES) {
    test.each(tabs)(`${routeName}: ${section} tab %s exports the report the page renders, titled as the page titles it`, async (subsection) => {
      const { report, button } = await onPage(Route, CLIENT, section, subsection)
      const view = resolveExportView(CLIENT as ExportViewClient, section, subsection ?? null)
      const element = exportReportElement(view, params)
      expect(nameOf(element.type)).toBe(nameOf(report.type))
      // Known drift, named rather than hidden: the dashboard route drops Paid Media Overview's compareRange; the
      // portal passes it, and the export follows the portal. Recorded in PR 1's review record.
      const drift = routeName === 'dashboard' && nameOf(report.type) === 'PaidMediaOverviewReport'
      expect(element.props).toEqual(drift ? { ...report.props, compareRange: Q.compareRange } : report.props)
      expect(view.pageTitle).toBe(button.props.pageTitle)
      // Every resolved tab of these sections uses the page range, so the export always stamps a period.
      if (subsection !== 'not-a-tab') expect(button.props.periodLabel).not.toBeNull()
    })
  }

  test(`${routeName}: a tab the client has hidden exports its section's Overview, as the page renders it`, async () => {
    const hidden = { ...CLIENT, hiddenReports: ['technical-audit'] }
    const { report, button } = await onPage(Route, hidden, 'peec-ai', 'technical-audit')
    const view = resolveExportView(hidden as ExportViewClient, 'peec-ai', 'technical-audit')
    expect(view.subsectionId).toBeNull()
    expect(nameOf(exportReportElement(view, params).type)).toBe(nameOf(report.type))
    expect(nameOf(report.type)).toBe('PeecAIReport')
    expect(view.pageTitle).toBe(button.props.pageTitle)
  })
}

test('one lookup gives the tab, its channel and its title; an unknown tab is Overview', () => {
  const c = CLIENT as ExportViewClient
  expect(resolveExportView(c, 'organic-social', 'organic-linkedin')).toEqual({ section: 'organic-social', subsectionId: 'organic-linkedin', channel: 'LINKEDIN', pageTitle: 'LinkedIn' })
  expect(resolveExportView(c, 'organic-social', null)).toEqual({ section: 'organic-social', subsectionId: null, channel: null, pageTitle: 'Organic Social' })
  expect(resolveExportView(c, 'peec-ai', 'pr-influence')).toEqual({ section: 'peec-ai', subsectionId: 'pr-influence', channel: null, pageTitle: 'PR Influence' })
  expect(resolveExportView(c, 'peec-ai', 'not-a-tab')).toEqual({ section: 'peec-ai', subsectionId: null, channel: null, pageTitle: 'Answer Engine Optimization' })
  expect(resolveExportView(c, 'paid-media', null)).toEqual({ section: 'paid-media', subsectionId: null, channel: null, pageTitle: 'Overview' })
  expect(resolveExportView(c, 'paid-media', 'meta')).toEqual({ section: 'paid-media', subsectionId: 'meta', channel: null, pageTitle: 'Meta Advertising' })
})
```

The `stub` helper names each function (a computed key names an arrow function), so `nameOf` reads `PeecAIReport` and so on. If a route imports another export from one of these module paths and the test fails with "No export named X", change that `vi.mock` to `async (orig) => ({ ...(await orig<object>()), ...stub('Name') })`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run components/export/report-views.pages.test.tsx`
Expected: FAIL. `@/lib/export/report-view` and `./report-element` don't exist.

- [ ] **Step 3: Create `lib/export/report-view.ts`**

```ts
// Which view an export is of, resolved exactly as the report pages resolve it (app/{portal,dashboard}/[clientSlug]/
// reports/page.tsx; pinned by components/export/report-views.pages.test.tsx). Pure: the route uses it without
// importing any report component. An unknown or hidden tab is the section's Overview, as on the page.
import { AEO_SUBSECTIONS, PAID_MEDIA_SUBSECTIONS, REPORT_NAMES, resolveOrganicSubsection, type OrganicTabsClient } from '@/lib/constants'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { ServerExportSection } from './sections'

export type ExportViewClient = OrganicTabsClient

export interface ExportView {
  section: ServerExportSection
  /** The resolved tab id, or null for the section's Overview. */
  subsectionId: string | null
  /** The page title, as the report page's header and Export PDF button show it. */
  pageTitle: string
  /** Organic Social's platform tab channel; null otherwise. */
  channel: DashChannel | null
}

/** A tab from `subs` the client hasn't hidden, or null (Overview). */
function visibleTab(subs: readonly { id: string | null; label: string }[], client: ExportViewClient, subsection: string | null) {
  if (!subsection || client.hiddenReports?.includes(subsection)) return null
  return subs.find((s) => s.id === subsection) ?? null
}

export function resolveExportView(client: ExportViewClient, section: ServerExportSection, subsection: string | null): ExportView {
  if (section === 'organic-social') {
    const entry = resolveOrganicSubsection(client, subsection)
    return {
      section,
      subsectionId: entry.id,
      channel: entry.channel,
      pageTitle: entry.channel == null ? (REPORT_NAMES['organic-social'] ?? 'Organic Social') : entry.label,
    }
  }
  if (section === 'peec-ai') {
    const tab = visibleTab(AEO_SUBSECTIONS, client, subsection)
    return { section, subsectionId: tab?.id ?? null, channel: null, pageTitle: tab ? tab.label : (REPORT_NAMES['peec-ai'] ?? 'peec-ai') }
  }
  const tab = visibleTab(PAID_MEDIA_SUBSECTIONS, client, subsection)
  // The page titles Paid Media's Overview "Overview", not the section name.
  return { section, subsectionId: tab?.id ?? null, channel: null, pageTitle: tab ? tab.label : 'Overview' }
}
```

- [ ] **Step 4: Create `components/export/report-element.tsx`**

```tsx
// The live report component the export page renders for a view, with the props the report pages pass it
// (getReportComponent in app/{portal,dashboard}/[clientSlug]/reports/page.tsx; pinned by report-views.pages.test.tsx).
// Server-only: it imports the report components, so the export route (which only needs resolveExportView) never does.
import type { ReactElement } from 'react'
import type { AEOModel } from '@/lib/peec/models'
import type { ExportView } from '@/lib/export/report-view'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { PaidMediaOverviewReport } from '@/components/report-sections/paid-media/overview'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { LinkedInAdsReport } from '@/components/report-sections/linkedin-ads'

export interface ExportViewParams {
  clientSlug: string
  dateRange: string
  compareRange: string | null
  models: AEOModel[] | null
}

export function exportReportElement(view: ExportView, { clientSlug, dateRange, compareRange, models }: ExportViewParams): ReactElement {
  switch (view.section) {
    case 'organic-social':
      // Locked months resolve inside OrganicSocialReport from the raw range, as on the page.
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} channel={view.channel} />
    case 'peec-ai':
      if (view.subsectionId === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
      if (view.subsectionId === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange ?? undefined} models={models} />
      if (view.subsectionId === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
    case 'paid-media':
      if (view.subsectionId === 'meta')        return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (view.subsectionId === 'linkedin')    return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (view.subsectionId === 'paid-search') return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      // As the portal route; the dashboard route drops compareRange here (a live-page drift, PR 1 review record).
      return <PaidMediaOverviewReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
  }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run components/export/report-views.pages.test.tsx`
Expected: PASS for every route × section × tab, plus the hidden-tab case and the lookup test.

If a props case fails, the export's props differ from the page's. Change `report-element.tsx` to match the **portal** route. The only exception is the drift the test names. Don't edit the report pages.

- [ ] **Step 6: Delete the Organic Social-only resolver**

Run: `git rm lib/export/organic-social-view.ts lib/export/organic-social-view.pages.test.tsx`

The route and export page still import `organicSocialExportView`; Tasks 3 and 4 switch them over. Don't commit until `npx tsc --noEmit -p .` is clean, which means doing Tasks 3 and 4 first.

The page-button tests that lived in the deleted file move to Task 5.

---

### Task 3: The export page for any section

**Files:**
- Move: `app/export/[clientSlug]/organic-social/page.tsx` → `app/export/[clientSlug]/[section]/page.tsx`
- Move: `app/export/[clientSlug]/organic-social/page.test.tsx` → `app/export/[clientSlug]/[section]/page.test.tsx`
- Modify both.

**Interfaces:**
- Consumes: `isServerExportSection` (Task 1); `resolveExportView` and `exportReportElement` (Task 2); `parseModelsParam` (`lib/peec/models.ts`).
- Produces: `GET /export/[clientSlug]/[section]?subsection&dateRange&compareRange&models&tz`.

- [ ] **Step 1: Move the files**

```bash
mkdir -p "app/export/[clientSlug]/[section]"
git mv "app/export/[clientSlug]/organic-social/page.tsx" "app/export/[clientSlug]/[section]/page.tsx"
git mv "app/export/[clientSlug]/organic-social/page.test.tsx" "app/export/[clientSlug]/[section]/page.test.tsx"
```

- [ ] **Step 2: Write the failing tests.** In `page.test.tsx`, change `open` to take the section, and add the cases:

```tsx
const open = (sp: Record<string, string>, section = 'organic-social') =>
  runRoute(ExportPage({ params: Promise.resolve({ clientSlug: 'renaissance', section }), searchParams: Promise.resolve(sp) } as never))
```

```tsx
// Only sections switched on for the server export render here (lib/export/sections.ts). A section the client has
// enabled but that has no export yet is a 404, so this page can't print a report its components aren't ready for.
test('a section not switched on for the export is a 404, even when the client has it enabled', async () => {
  getClientBySlug.mockResolvedValue({ ...CLIENT, enabledReports: ['organic-social', 'peec-ai'] })
  await expect(open({ dateRange: 'last_30_days' }, 'peec-ai')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) })
})

test('an unknown section is a 404', async () => {
  await expect(open({ dateRange: 'last_30_days' }, 'not-a-section')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) })
})
```

These use the same 404 assertion as the existing `'a client without Organic Social is a 404'` test.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run "app/export/[clientSlug]/[section]/page.test.tsx"`
Expected: FAIL. The page still resolves through `organicSocialExportView`, which no longer exists, and has no section param.

- [ ] **Step 4: Rewrite the page body**

In `app/export/[clientSlug]/[section]/page.tsx`, replace the imports of `organicSocialExportView` and `OrganicSocialReport` with:

```tsx
import { isServerExportSection } from '@/lib/export/sections'
import { resolveExportView } from '@/lib/export/report-view'
import { exportReportElement } from '@/components/export/report-element'
import { parseModelsParam } from '@/lib/peec/models'
```

Update the header comment's first lines:

```tsx
// The PDF export page (specs 2026-10-06-organic-social-pdf-export-v2 §5, 2026-10-08-pdf-export-all-reports §4).
// Not a page anyone navigates to: the export route's headless browser opens it with the requester's own
// session (app/api/export/pdf), waits for ExportReadyReporter, and prints it. It renders the same report
// component the live page renders (components/export/report-element.tsx).
```

Change the signature and body:

```tsx
export default async function ReportExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; section: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { clientSlug, section } = await params
  const session = await requirePortalAccess(clientSlug)
  const sp = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client || !isServerExportSection(section) || !client.enabledReports.includes(section)) notFound()

  const dateRange = str(sp.dateRange) ?? 'last_30_days'
  const compareRange = str(sp.compareRange)
  const tz = safeTimeZone(sp.tz)
  const view = resolveExportView(client, section, str(sp.subsection))
  const report = exportReportElement(view, { clientSlug, dateRange, compareRange, models: parseModelsParam(str(sp.models)) })
  // The period stamped is the range the report serves: Organic Social's locked month for an opted-in client (the
  // same lookup OrganicSocialBody makes), else the requested range. No month to serve, no period.
  const locked = section === 'organic-social' ? lockedRangeFor(client, session.user?.role, dateRange, requestClock()) : null
  const served = locked ? (locked.month?.dateRange ?? null) : dateRange
```

In the JSX, replace `<OrganicSocialReport … />` inside `ExportModeProvider` with `{report}`. Everything else stays: the header, `{view.pageTitle}`, the stamp, the font `<link>` and `ExportReadyReporter`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run "app/export"`
Expected: PASS. The existing tests are unchanged apart from `open`, and the two new 404 tests pass.

---

### Task 4: The route for any section

**Files:**
- Modify: `app/api/export/pdf/route.ts`
- Test: `app/api/export/pdf/route.test.ts`

**Interfaces:**
- Consumes: `ExportRequest` with `section` and `models` (Task 1), `resolveExportView` (Task 2).

- [ ] **Step 1: Write the failing tests.** Append to `route.test.ts`:

```ts
// A section the client has enabled but that isn't switched on for the export (lib/export/sections.ts) is
// refused before Chromium launches; the page's button still prints in the browser.
test('a section not switched on for the export is a 400 and nothing renders', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  getClientBySlug.mockResolvedValue({ ...RENAISSANCE, enabledReports: ['organic-social', 'peec-ai'] })
  const res = await post({ ...body, section: 'peec-ai' })
  expect(res.status).toBe(400)
  expect(renderPdf).not.toHaveBeenCalled()
})

test('the server browser opens the section the request names, and the log line says which', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  await post({ ...body, section: 'organic-social', subsection: 'organic-linkedin' })
  expect(renderPdf.mock.calls[0][0].url).toMatch(/\/export\/renaissance\/organic-social\?/)
  const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0]))
  expect(lines.some((l) => /\[export\] client=renaissance section=organic-social view=organic-linkedin outcome=ok/.test(l))).toBe(true)
})

test('a page loaded before sections were added (no section in the body) still exports Organic Social', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  const res = await post(body) // `body` has no section
  expect(res.status).toBe(200)
  expect(renderPdf.mock.calls[0][0].url).toMatch(/\/export\/renaissance\/organic-social\?/)
})
```

Update any existing assertion that matches the log line with `client=… view=…` to include `section=organic-social` between them. Run the file once after Step 3 to find them.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run app/api/export/pdf/route.test.ts`
Expected: FAIL. `organicSocialExportView` is gone, and there's no `section=` in the log.

- [ ] **Step 3: Update the route**

Replace the `organicSocialExportView` import with `import { resolveExportView } from '@/lib/export/report-view'`. Then:

```ts
  const log = (r: Pick<ExportRequest, 'clientSlug' | 'section' | 'subsection'> | null, outcome: string, step?: string) =>
    console.info(`[export] client=${r?.clientSlug ?? '-'} section=${r?.section ?? '-'} view=${r?.subsection ?? 'overview'} outcome=${outcome}${step ? ` step=${step}` : ''} ms=${Date.now() - started}`)
```

```ts
  const client = await getClientBySlug(parsed.clientSlug)
  if (!client || !client.enabledReports.includes(parsed.section)) {
    log(parsed, 'not-found')
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  // The tab as the page resolves it: an unknown or hidden tab is the section's Overview.
  const view = resolveExportView(client, parsed.section, parsed.subsection)
  const r: ExportRequest = { ...parsed, subsection: view.subsectionId }
```

The rest is unchanged: `exportFilename(client.name, view.pageTitle, …)` and `exportPagePath(r)`. The 400 for a section not in the allow-list comes from `parseExportRequest` returning null, so the existing `bad-request` branch handles it.

Update the file's header comment: "POST /api/export/pdf — the server-rendered PDF export (specs 2026-10-06 …, 2026-10-08-pdf-export-all-reports)".

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run app/api/export/pdf/route.test.ts lib/export app/export components/export`
Expected: PASS.

- [ ] **Step 5: Type-check, then commit Tasks 2–4 together**

Run: `npx tsc --noEmit -p .`. Expected: clean.

```bash
git checkout -q -- CLAUDE.md
git add -A lib/export components/export "app/export" app/api/export
git commit -m "feat(export): one export page and route for any section, pinned to the live report pages

resolveExportView (pure, used by the route) and exportReportElement (used by the export
page) replace organicSocialExportView. A parity test runs both real report routes for
every Organic Social, AEO and Paid Media tab and holds the export's component, props and
title to the page's, naming the one drift: the dashboard drops Paid Media Overview's
compareRange. Only Organic Social is switched on (lib/export/sections.ts).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The button sends the section; report pages offer it for allow-listed sections

**Files:**
- Modify: `components/export-pdf-button.tsx` (the `ServerExport` type)
- Modify: `app/portal/[clientSlug]/reports/page.tsx:289-292`, `app/dashboard/[clientSlug]/reports/page.tsx:273-276`
- Test: `components/export/report-views.pages.test.tsx` (append), `components/export-pdf-button.test.tsx`
- Re-baseline: `lib/organic-social/__snapshots__/locked-months-parity.test.tsx.snap`

**Interfaces:**
- Consumes: `isServerExportSection` (Task 1); `serializeModelsParam` (`lib/peec/models.ts`).
- Produces: `ServerExport { clientSlug; section: ServerExportSection; subsection: string | null; dateRange; compareRange: string | null; models: string | null }`.

- [ ] **Step 1: Write the failing tests.** Append to `components/export/report-views.pages.test.tsx`:

```tsx
// The button exports on the server only for sections switched on (lib/export/sections.ts); every other section
// keeps the browser print until its own PR switches it on.
for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  test(`${routeName}: Organic Social's button exports the served view on the server, naming its section`, async () => {
    const { button } = await onPage(Route, CLIENT, 'organic-social', 'organic-linkedin')
    expect(button.props.serverExport).toEqual({ clientSlug: 'c', section: 'organic-social', subsection: 'organic-linkedin',
      dateRange: Q.dateRange, compareRange: Q.compareRange, models: null })
  })

  test.each(['peec-ai', 'paid-media'])(`${routeName}: %s keeps the browser print until its section is switched on`, async (section) => {
    const { button } = await onPage(Route, CLIENT, section)
    expect(button.props.serverExport).toBeUndefined()
  })
}
```

In `components/export-pdf-button.test.tsx`, find each `serverExport` fixture and add `section: 'organic-social', models: null`. Then assert the POST body now carries `section`. Look for the test that inspects `fetch`'s body, and add `section: 'organic-social'` and `models: null` to its expected object.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/export components/export-pdf-button.test.tsx`
Expected: FAIL. `serverExport` has no `section` or `models`.

- [ ] **Step 3: Update the `ServerExport` type** in `components/export-pdf-button.tsx`:

```ts
import type { ServerExportSection } from '@/lib/export/sections'

/** The view a server export renders (app/api/export/pdf). Never a role or a client identity: the route takes
 *  those from the session. */
export interface ServerExport {
  clientSlug: string
  section: ServerExportSection
  subsection: string | null
  dateRange: string
  compareRange: string | null
  /** AEO's `?models=` filter, or null. */
  models: string | null
}
```

Update the `serverExport` prop's doc comment: "Set on sections switched on for the server export (lib/export/sections.ts)…".

- [ ] **Step 4: Update both report pages.** In each, replace the `serverExport` spread on `ExportPdfButton` with:

```tsx
          {...(isServerExportSection(activeSection)
            ? { serverExport: {
                clientSlug,
                section: activeSection,
                subsection: activeSection === 'organic-social' ? (organicEntry?.id ?? null) : (subsection ?? null),
                dateRange: servedDateRange,
                compareRange: servedCompareRange,
                models: activeSection === 'peec-ai' && models ? serializeModelsParam(models) : null,
              } }
            : {})} />
```

Add the imports `import { isServerExportSection } from '@/lib/export/sections'`, and `serializeModelsParam` to the existing `@/lib/peec/models` import. In the dashboard page, `parseModelsParam` comes in via `@/lib/peec/models` and `AEOModel` via an inline `import()`, so add a normal `import { serializeModelsParam } from '@/lib/peec/models'`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run components/export components/export-pdf-button.test.tsx lib/export-period.pages.test.tsx`
Expected: PASS.

- [ ] **Step 6: Re-baseline the locked-months parity snapshot, and prove it's only the button**

Run: `npx vitest run lib/organic-social/locked-months-parity.test.tsx`
Expected: FAIL. The Organic Social button's `serverExport` gained `section` and `models`, and every digest hashes the whole tree.

Prove that's the only change before updating. Run the throwaway probe from the #332 record (`docs/qa/organic-social-pdf-export-v2-code-review.md`, T16):
1. Copy the test to `lib/organic-social/zz-parity-probe.test.tsx`.
2. In its `serialise`, filter out every element of type `ExportPdfButton`.
3. Write all digests to a JSON file.
4. Run it on this branch and on `origin/dev` (a temporary `git worktree` with `node_modules` symlinked).
5. Compare the two files. They must be identical, then delete the probe and the worktree.

Then run:

```bash
npx vitest run lib/organic-social/locked-months-parity.test.tsx -u
```

Record the probe result (cases compared, identical) in the commit message and in the review record.

- [ ] **Step 7: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/export-pdf-button.tsx components/export-pdf-button.test.tsx components/export "app/portal/[clientSlug]/reports/page.tsx" "app/dashboard/[clientSlug]/reports/page.tsx" lib/organic-social/__snapshots__/locked-months-parity.test.tsx.snap
git commit -m "feat(export): the button names its section; pages offer the server export per section

Only sections in SERVER_EXPORT_SECTIONS get serverExport (still just Organic Social).
locked-months-parity re-baselined: with ExportPdfButton removed, every case hashes
identical to origin/dev (probe, N cases).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Replace `N` with the probe's case count.

---

### Task 6: Shared charts draw complete in the export

**Files:**
- Modify: `components/charts/bar-chart.tsx`, `components/charts/combo-chart.tsx`
- Create: `components/charts/export-charts.test.tsx`
- Modify: `vitest.config.ts` (pin the new test file next to `components/charts/line-chart.test.tsx`)

**Interfaces:**
- Consumes: `useExportMode` (`components/export/export-mode.tsx`).

The AEO-only charts (slope chart, bot-vs-human scatter, PR Influence's cluster bar chart) get this change in PR 2, next to their export forms. Their inputs are AEO-specific, and PR 2 builds fixtures for them anyway.

- [ ] **Step 1: Write the failing test** in `components/charts/export-charts.test.tsx`

```tsx
import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'

// Records each Bar and Line's props (the export turns animation off), then renders the real one. Recharts finds
// its children by type, so the recorders carry the real components' displayNames.
const { barProps, lineProps } = vi.hoisted(() => ({ barProps: [] as Record<string, unknown>[], lineProps: [] as Record<string, unknown>[] }))
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  const Bar = Object.assign((p: Record<string, unknown>) => { barProps.push(p); return <actual.Bar {...p} /> }, { displayName: actual.Bar.displayName })
  const Line = Object.assign((p: Record<string, unknown>) => { lineProps.push(p); return <actual.Line {...p} /> }, { displayName: actual.Line.displayName })
  return {
    ...actual, Bar, Line,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 300 }),
  }
})

import { BarChart } from './bar-chart'
import { ComboChart } from './combo-chart'
import { ExportModeProvider } from '@/components/export/export-mode'

const DATA = [{ d: 'Sep 1', a: 3, b: 5 }, { d: 'Sep 2', a: 9, b: 2 }]
const charts = () => (
  <>
    <BarChart data={DATA} xKey="d" yKeys={[{ key: 'a' }]} />
    <ComboChart data={DATA} xKey="d" bar={{ key: 'a', color: '#39A0FF', label: 'A' }} line={{ key: 'b', color: '#60FF80', label: 'B' }} />
  </>
)

// A PDF taken mid-animation prints half-drawn bars (spec 2026-10-08-pdf-export-all-reports-design §4).
test('in the export, bars and lines draw complete on first paint, and the bar chart keeps its dark panel', () => {
  barProps.length = 0; lineProps.length = 0
  const { container } = render(<ExportModeProvider>{charts()}</ExportModeProvider>)
  expect(barProps.length).toBe(2)
  expect(lineProps.length).toBe(1)
  expect([...barProps, ...lineProps].every((p) => p.isAnimationActive === false)).toBe(true)
  expect(container.querySelectorAll('[data-export-chart]')).toHaveLength(1) // BarChart owns its panel; ComboChart's is its parent's
})

test('outside the export, the charts are unchanged: animated, no export marker', () => {
  barProps.length = 0; lineProps.length = 0
  const { container } = render(charts())
  expect([...barProps, ...lineProps].every((p) => !('isAnimationActive' in p))).toBe(true)
  expect(container.querySelector('[data-export-chart]')).toBeNull()
})
```

Add `'components/charts/export-charts.test.tsx',` to `vitest.config.ts`'s `include`, right after `'components/charts/line-chart.test.tsx',`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run components/charts/export-charts.test.tsx`
Expected: FAIL. `isAnimationActive` is never passed, and there's no `data-export-chart`.

- [ ] **Step 3: Update `bar-chart.tsx`**

```tsx
import { useExportMode } from '@/components/export/export-mode'
```

At the top of `BarChart`:

```tsx
  // In the PDF export the bars must be complete on first paint (no grow-in animation to catch half way), and the
  // panel keeps the dark theme its colours were chosen for (app/export/export-theme.css).
  const exportMode = useExportMode()
```

On the panel `<div className="rounded-lg …">`, add `{...(exportMode ? { 'data-export-chart': '' } : {})}`. On each `<Bar …>`, add `{...(exportMode ? { isAnimationActive: false } : {})}`. Spread both, so the props outside the export are exactly what they were before, which keeps snapshots stable.

- [ ] **Step 4: Update `combo-chart.tsx`** the same way: import `useExportMode`, `const exportMode = useExportMode()`, and spread `{...(exportMode ? { isAnimationActive: false } : {})}` onto the `<Bar>` and the `<Line>`. ComboChart has no panel of its own; its parent card is the panel, which PR 3 marks.

- [ ] **Step 5: Run the test and confirm it passes, then run the full suite**

Run: `npx vitest run components/charts/export-charts.test.tsx`
Expected: PASS.

Run: `npx vitest run`
Expected: all pass. If a snapshot changes, a prop changed outside export mode; fix the spread rather than updating the snapshot.

- [ ] **Step 6: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/charts/bar-chart.tsx components/charts/combo-chart.tsx components/charts/export-charts.test.tsx vitest.config.ts
git commit -m "feat(export): bar and combo charts draw complete in the export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Acceptance, verification, PRs

**Files:**
- Modify: `e2e/export/acceptance.mts` (bodies name `section: 'organic-social'`; one bodiless-section run)
- Create (separate branch): `docs/qa/pdf-export-shared-pipeline-code-review.md`

- [ ] **Step 1: Update the acceptance bodies.** In `exportAs` calls, add `section: 'organic-social'` to the Renaissance and A Place for Mom bodies. Then add one deploy-skew check after the Renaissance export, reusing the same token:

```ts
  // A page loaded before sections were added posts no section; it must still export Organic Social.
  const skew = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: 'renaissance' },
    { clientSlug: 'renaissance', subsection: null, dateRange: 'last_30_days' }, 'renaissance-no-section')
  check(!!skew, 'a body with no section still exports Organic Social')
```

- [ ] **Step 2: Full verification**

```bash
npx vitest run
npx tsc --noEmit -p .
git diff --name-only origin/dev...HEAD | grep -E '\.(ts|tsx|mts)$' | xargs npx eslint
npm run build
git checkout -q -- CLAUDE.md
```

Expected: all tests pass, `tsc` is clean, and the changed files have 0 lint errors. The build compiles `/export/[clientSlug]/[section]` and `/api/export/pdf`.

Then run the acceptance against a local production build (Node 26):

```bash
APP_URL=http://localhost:3457 AUTH_TRUST_HOST=true CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx next start -p 3457
```

In a second shell:

```bash
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3457 npm run e2e:export
```

Expected: all checks pass, including the no-section run. Stop the server afterwards.

- [ ] **Step 3: Commit, push, and open the PR into `dev`**

```bash
git checkout -q -- CLAUDE.md
git add e2e/export/acceptance.mts
git commit -m "test(export): acceptance names the section; a body without one still exports Organic Social

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/pdf-export-shared-pipeline
gh pr create --base dev --title "feat(export): one export pipeline for any section (PDF export PR 1 of 3)" --body-file pr1-body.md
```

Write `pr1-body.md` in the scratchpad first. It covers:
- what changes (route, page, request, button, charts);
- that users see nothing new (`SERVER_EXPORT_SECTIONS = ['organic-social']`);
- the parity test and its one named drift;
- the snapshot probe result;
- the verification numbers;
- "Not for merge before review".

End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Open the review-record PR.** Branch `docs/pdf-export-shared-pipeline-review` from `origin/dev`, with `docs/qa/pdf-export-shared-pipeline-code-review.md` in the CLAUDE.md skeleton:
- **Header:** the diff range `origin/dev..<PR head>`.
- **§1 How it works:** request → resolveExportView → page → exportReportElement.
- **§2 Verification:** the parity test, the snapshot probe, and acceptance.
- **§3 Findings:** at least:
  - the dashboard's dropped Paid Media Overview `compareRange` (● PLAUSIBLE, live-page drift, not changed here);
  - the slope, scatter and PR charts deferred to PR 2;
  - any finding from implementation.
- **§4 Detail.**
- **§5 Follow-ups.**

Title: `docs(review): PDF export shared pipeline (PR #<n>) code review record`. Don't merge either PR.
