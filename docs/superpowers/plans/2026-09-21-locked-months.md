# Locked Months Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organic Social clients that opt in (`dash_social_config.reportingMonths`) get a month and year picker, month-to-month comparison, server-enforced client visibility (the 12th rule), and Commentary that follows the month; every other client, Renaissance included, is unchanged.

**Executed dry run (2026-09-21):** Tasks 0 to 7 were executed literally in a throwaway worktree: 1153 tests pass, tsc and the RSC check clean, Task 0's snapshots byte-identical after Task 7. Its three improvements are folded in (the editor snapshot uses `createElement`, every section test asserts parts rendered, the edge 29 Commentary test).

**Architecture:** One pure rules module (`lib/organic-social/reporting-months.ts`) decides the months, the served month and the comparison from the client's config, the viewer's role and one per-request clock. A thin server module (`locked-range.ts`) returns `null` for any client without the setting, which every caller treats as "do exactly what you do today". The SPA routes redirect or serve the month and swap the picker; the deep links swap the picker only; the Organic Social section re-checks as the last point before Dash; Commentary filters to the served month.

**Tech Stack:** Next.js 16.1 App Router (RSC), React 19.2, TypeScript strict, Vitest 3.2 (jsdom) with @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-21-locked-months-design.md` (approved 2026-09-21). Section and edge numbers below refer to it.

## Global Constraints

- Renaissance, and every client without `reportingMonths`, behave exactly as today: same returned element trees on all four routes, same output from `OrganicSocialBody`, same `CommentaryPanel` props, same panel and editor HTML. Task 0's snapshots are captured before any change and must not move. Never run `vitest -u` on them.
- Never edit: `lib/date-range.ts`, `lib/ga4/client.ts`, `lib/organic-social/frozen.ts`, the Organic Social getters, `lib/constants.ts`, any `@/lib/constants` import line, `components/layout/portal-sidebar.tsx`, the portal or dashboard layout.
- In the two deep-link pages change only the picker line, and add imports on their own lines directly after the existing `./report-date-range` import (zero conflicts with PR 255, spec section 7).
- `redirect()` is never inside a `try`. The dashboard SPA never redirects when `health=1` for an internal role.
- Team roles: exactly `INTERNAL_ADMIN`, `INTERNAL_ANALYST`. Anything else, no role, or a failed session read is a client.
- Clock: one per request (`requestClock()`); `today` is the America/New_York date; the live month ends on `lastCompleteUtcDay` (UTC yesterday); `liveDayInProgress` is UTC hour before 4.
- Config: `firstMonth` required `YYYY-MM`; `opensOnDay` integer 4 to 28, default 12; `weekendRule` `next-monday` or `previous-friday`, default `next-monday`; `comparison` `previous-month` or `previous-year`, default `previous-month`; unknown keys ignored; `MAX_REPORTING_MONTHS = 36`.
- Copy, exactly: `Live, team only`; `Team only until <Mon D>`; `Hidden from clients: config error`; `Your first report opens on <Mon D>`; `No reports are available yet`; `No reporting months yet` (team, plus the reason); `No commentary for <Month YYYY> yet`; `Clients see this from <Mon D>`; month label `September 2026`; live label `October 2026, through Oct 19`, plus ` (in progress)` when `liveDayInProgress`; comparison `vs August 2026`, live `vs Sep 1 to Sep 19`.
- Logs: `[organic-social] hidden month attempt slug=<slug> served=<range> requested=<json>` (request cut to 64 characters, JSON-escaped, U+2028 and U+2029 escaped); `[organic-social] reportingMonths setting is invalid slug=<slug> key=<key>`. The config is never logged.
- No client identifiers or figures anywhere (public repo). No em or en dashes in any added line. First person in docs and commit messages.
- Test first: every new test is run and seen failing before its code exists (Task 0 excepted: it characterises today's code and must pass on it). Snapshots never contain local-time output (normalise it).
- Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Edge case map (spec section 9 to tasks)

| Edge | Task | | Edge | Task |
|---|---|---|---|---|
| 1 auth throws or rejects | 3, 4 | | 16 one clock | 2 |
| 2 template lookup takes the config | 4 | | 17 live month never frozen | 1 |
| 3 lock read fails | 4 | | 18, 19, 20 | accepted in spec, nothing to build |
| 4, 5 logging, noise | 2, 4, 5 | | 21 panel keyed by month | 7 |
| 6 malformed config logged | 4 | | 22 client reaches hidden month by URL | 4, 5, 6 |
| 7 health sweep | 5 | | 23 Commentary leaks a month | 7 |
| 8 list bound | 1 | | 24 untrusted input in logs | 2 |
| 9 redirect loop | 1, 5 | | 25 payload widening | rollout (spec 11), not code |
| 10, 11 junk, arrays | 1, 5 | | 26, 27 | filed, not built |
| 12 compareRange tampering | 1, 5 | | 28 in-progress label | 1 |
| 13 config shapes | 1 | | 29 team note | 7 |
| 14 | declined in spec, filed | | 30 pick before redaction | 7 |
| 15 calendar | 1 | | | |

Each task re-derives its own rows against the files at build time, with a real `file:line`, and puts the table in its commit body.

## File Structure

| File | Responsibility |
|---|---|
| `lib/test-utils/element-tree.ts` (new) | Test helper: serialise a returned element tree, find elements, run a route and catch its redirect |
| `lib/organic-social/locked-months-parity.test.tsx` (new) | Task 0 route snapshots (non-opted clients) |
| `lib/organic-social/reporting-months.ts` + `.test.ts` (new) | Pure rules (spec section 3) |
| `lib/organic-social/locked-range.ts` + `.test.ts` (new) | `requestClock`, `lockedRangeFor` (null when not opted in), the two log helpers |
| `lib/db/schema.ts` | `reportingMonths?: unknown` on `DashSocialConfig` |
| `components/report-sections/organic-social/no-months.tsx` (new) | The one-line no-months card |
| `components/report-sections/organic-social/month-picker.tsx` + `.test.tsx` (new, client) | The dropdown |
| `components/report-sections/organic-social/range-control.tsx` + `.test.tsx` (new, server) | Resolves the range, renders the picker |
| `components/report-sections/organic-social/index.tsx` + `index.test.tsx` | Section lock; `requestedRange` to the header |
| `app/portal/[clientSlug]/reports/page.tsx`, `app/dashboard/[clientSlug]/reports/page.tsx` | SPA routes: resolve, redirect, serve, picker |
| `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | Deep links: picker only |
| `lib/organic-social/locked-months-routes.test.tsx` (new) | Outer acceptance test: an opted-in client on the real routes |
| `lib/commentary/month.ts` + `.test.ts` (new) | `monthOfEntry`, `eligibleEntries`, `pickMonthDefault`, `clientOpensNote`, `isOrganicSocialViewKey` |
| `lib/commentary/initial-period.ts` + `.test.ts` (new) | The editor's starting period (kept out of `month.ts` so the client bundle stays small) |
| `components/report-sections/commentary/monthly.tsx` (new) | Commentary for opted-in Organic Social views |
| `components/report-sections/commentary/index.tsx`, `commentary-panel.tsx`, `commentary-editor.tsx` | Branch to monthly; optional props |
| `components/report-sections/commentary/commentary-parity.test.tsx` (new) | Task 0 `CommentaryPanel` props snapshot, then Task 7's monthly tests. A new file, not `index.test.tsx`, because that file's queries mock is a fixed object the new tests need to vary |
| `components/report-sections/commentary/commentary-panel.test.tsx` | Task 0 panel and editor HTML snapshots, then the new optional props |
| `components/report-sections/shared/shared-parts-header.tsx`, `shared/parts/registry.tsx` + header test | Optional `requestedRange` |

---

### Task 0: Pre-change snapshots (characterise today, before any change)

**Files:**
- Create: `lib/test-utils/element-tree.ts`
- Create: `lib/organic-social/locked-months-parity.test.tsx`
- Create: `components/report-sections/commentary/commentary-parity.test.tsx`
- Modify (append tests only): `components/report-sections/commentary/commentary-panel.test.tsx`, `components/report-sections/organic-social/index.test.tsx`

**Interfaces:**
- Produces: `lib/test-utils/element-tree.ts` exports `elementTree(node: unknown): unknown`, `findElements(node: unknown, pred: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[]`, `type RouteResult = { redirect: string } | { element: unknown }`, `runRoute(p: Promise<unknown>): Promise<RouteResult>`, `redirectOf(p: Promise<unknown>): Promise<string | null>`. Tasks 4, 5 and 6 import them.

All of this passes against today's code. The snapshot files are the pre-change record.

- [ ] **Step 1: Renaissance drift check, before**

Run: `REPO=$PWD bash ~/.claude/renaissance-baseline/check-drift.sh > /tmp/lm-drift-before.txt 2>&1; echo "exit $?"; tail -3 /tmp/lm-drift-before.txt`
Expected: `exit 0` and `RESULT: no drift in Renaissance's row, users, KPI surface or part pins.`

- [ ] **Step 2: Write the helper**

`lib/test-utils/element-tree.ts`:

```ts
// Test helper (not app code): walk and serialise the element tree a server component or route
// RETURNS, without rendering it. Used by the locked months parity and acceptance tests.
import { isValidElement, type ReactElement } from 'react'

type El = ReactElement<Record<string, unknown>>

function typeName(t: unknown): string {
  if (typeof t === 'string') return t
  if (typeof t === 'symbol') return t.description ?? String(t)
  const f = t as { displayName?: string; name?: string } | null
  return f?.displayName ?? f?.name ?? 'Anonymous'
}

/** A JSON-safe copy of a returned tree: component types become names, functions become '[fn]'. */
export function elementTree(node: unknown): unknown {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) return node.map(elementTree)
  if (typeof node === 'function') return '[fn]'
  if (typeof node !== 'object') return node
  if (!isValidElement(node)) {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, elementTree(v)]))
  }
  const e = node as El
  return {
    type: typeName(e.type),
    key: e.key,
    props: Object.fromEntries(Object.entries(e.props ?? {}).map(([k, v]) => [k, elementTree(v)])),
  }
}

/** Every element in a returned tree (through every prop, not only children) matching `pred`. */
export function findElements(node: unknown, pred: (e: El) => boolean): El[] {
  const out: El[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (!isValidElement(n)) return
    const e = n as El
    if (pred(e)) out.push(e)
    Object.values(e.props ?? {}).forEach(walk)
  }
  walk(node)
  return out
}

export type RouteResult = { redirect: string } | { element: unknown }

/** Awaits a route; a Next redirect (digest `NEXT_REDIRECT;replace;<url>;307;`) comes back as its URL. */
export async function runRoute(p: Promise<unknown>): Promise<RouteResult> {
  try {
    return { element: await p }
  } catch (err) {
    const d = (err as { digest?: unknown }).digest
    if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT;')) return { redirect: d.split(';')[2] }
    throw err
  }
}

export async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  const r = await runRoute(p)
  return 'redirect' in r ? r.redirect : null
}
```

- [ ] **Step 3: Write the route snapshot test**

`lib/organic-social/locked-months-parity.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { elementTree, runRoute, type RouteResult } from '@/lib/test-utils/element-tree'

/**
 * Pre-change record for locked months (spec section 8). For clients WITHOUT `reportingMonths`, the
 * four real route modules must return exactly the same element tree after the build as before it.
 * The section is stubbed with a named component so its props are what the route passed; nothing
 * renders and nothing fetches. Each case is stored as a digest of the whole serialised tree, plus
 * one full tree per route and fixture for reading.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import PortalDeepLink from '@/app/portal/[clientSlug]/reports/[reportSlug]/page'
import DashboardDeepLink from '@/app/dashboard/[clientSlug]/reports/[reportSlug]/page'
import { auth } from '@/auth'

const serialise = (r: RouteResult) => ('redirect' in r ? r : { tree: elementTree(r.element) })
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

// Shapes, not values. Keys mirror the production baseline (~/.claude/renaissance-baseline).
const FIXTURES = {
  'renaissance-shaped': {
    name: 'Client', slug: 'c', logoUrl: null,
    enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'request-a-report', 'executive-overview'],
    hiddenReports: ['technical-audit', 'content-impact'],
    dashSocialConfig: { brandId: 1 },
    reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } },
  },
  // hiddenReports deliberately omits 'organic-overview': PR 255 changes that shape's landing tab on
  // purpose, so pinning it here would tie this record to whether 255 merged first. The lock gates
  // only on reportingMonths, so this shape exercises the same path.
  'new-client-shaped, no reportingMonths': {
    name: 'Client', slug: 'c', logoUrl: null,
    enabledReports: ['organic-social'],
    hiddenReports: [],
    dashSocialConfig: { brandId: 1, channels: ['instagram', 'facebook', 'linkedin'] },
    reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } },
  },
} as const

const RANGES: (string | string[] | undefined)[] = [
  undefined, 'last_30_days', 'last_month', 'custom:2026-08-01,2026-08-31', 'custom:2026-08-01,2026-08-15', 'junk', ['last_30_days', 'x'],
]
const COMPARES: (string | undefined)[] = [undefined, 'previous_year']
const ROLES = ['INTERNAL_ADMIN', 'CLIENT_VIEWER'] as const

const sp = (o: Record<string, unknown>) => Promise.resolve(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)))
const ROUTES: Record<string, (q: Record<string, unknown>) => Promise<unknown>> = {
  'portal spa': (q) => PortalSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: sp({ section: 'organic-social', ...q }) } as never),
  'dashboard spa': (q) => DashboardSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: sp({ section: 'organic-social', ...q }) } as never),
  'portal deep link': (q) => PortalDeepLink({ params: Promise.resolve({ clientSlug: 'c', reportSlug: 'organic-social' }), searchParams: sp(q) } as never),
  'dashboard deep link': (q) => DashboardDeepLink({ params: Promise.resolve({ clientSlug: 'c', reportSlug: 'organic-social' }), searchParams: sp(q) } as never),
}

beforeEach(() => vi.mocked(auth).mockReset())

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
  for (const [routeName, route] of Object.entries(ROUTES)) {
    test(`${routeName}, ${fixtureName}: returned tree is unchanged`, async () => {
      getClientBySlug.mockResolvedValue(fixture)
      const digests: Record<string, string> = {}
      let representative: unknown = null
      for (const role of ROLES) {
        vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com' } } as never)
        for (const dateRange of RANGES) {
          for (const compareRange of COMPARES) {
            const out = serialise(await runRoute(route({ dateRange, compareRange })))
            digests[`${role} ${JSON.stringify(dateRange)} ${compareRange ?? '-'}`] = digest(out)
            if (role === 'INTERNAL_ADMIN' && dateRange === undefined && compareRange === undefined) representative = out
          }
        }
        if (routeName === 'dashboard spa' || routeName === 'portal deep link') {
          digests[`${role} health`] = digest(serialise(await runRoute(route({ dateRange: 'last_30_days', health: '1' }))))
        }
      }
      expect({ digests, representative }).toMatchSnapshot()
    })
  }
}

test('renaissance-shaped: another section on the SPA routes is unchanged', async () => {
  getClientBySlug.mockResolvedValue(FIXTURES['renaissance-shaped'])
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com' } } as never)
  const q = sp({ section: 'paid-media', dateRange: 'last_30_days' })
  const portal = serialise(await runRoute(PortalSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: q } as never)))
  const dash = serialise(await runRoute(DashboardSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: q } as never)))
  expect({ portal: digest(portal), dash: digest(dash) }).toMatchSnapshot()
})
```

- [ ] **Step 4: Run it twice and confirm the snapshot is stable**

Run: `npx vitest run lib/organic-social/locked-months-parity.test.tsx && npx vitest run lib/organic-social/locked-months-parity.test.tsx`
Expected: both PASS, `9 passed`; the first writes `lib/organic-social/__snapshots__/locked-months-parity.test.tsx.snap`, the second reports no written or updated snapshots.

- [ ] **Step 5: Write the Commentary props snapshot**

`components/report-sections/commentary/commentary-parity.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

/**
 * Pre-change record for locked months (spec section 8): the props CommentarySection hands the panel
 * (what crosses the RSC boundary) for a client WITHOUT `reportingMonths`, on every view key that
 * renders Commentary, for an editor, an approver and a client email; and a failing auth() still
 * throws. Task 7 adds the locked-months tests to this file.
 */
let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => { captured = props; return null },
}))
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getCommentaryForView: async () => ENTRIES }))

const E = (id: string, periodStart: string, periodEnd: string, status: 'approved' | 'draft', updatedAt: string): CommentaryEntry => ({
  id, viewKey: 'organic-social:instagram', bodyHtml: `<p>${id}</p>`, periodStart, periodEnd, status,
  updatedBy: 'writer@avenuez.com', updatedAt, approvedBy: status === 'approved' ? 'approver@avenuez.com' : null,
  approvedAt: status === 'approved' ? updatedAt : null, deletedAt: null, deletedBy: null,
})
const ENTRIES: CommentaryEntry[] = [
  E('sep', '2026-09-01', '2026-09-30', 'approved', '2026-10-05T10:00:00.000Z'),
  E('aug', '2026-08-01', '2026-08-31', 'approved', '2026-09-05T10:00:00.000Z'),
  E('sep-draft', '2026-09-01', '2026-09-30', 'draft', '2026-10-06T10:00:00.000Z'),
]

import { CommentarySection } from './index'

const VIEW_KEYS = ['organic-social', 'organic-social:instagram', 'meta-ads', 'linkedin-ads', 'paid-search', 'peec-ai', 'peec-ai:pr-influence', 'peec-ai:content-impact'] as const
const EMAILS = ['writer@avenuez.com', 'approver@avenuez.com', 'client@example.com']
const NON_OPTED = { id: 'client-1', slug: 'c', dashSocialConfig: { brandId: 1 } }

beforeEach(() => { captured = null; process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com' })

async function panelProps(client: unknown, viewKey: string, email: string, role: string, extra: Record<string, unknown> = {}) {
  getClientBySlug.mockResolvedValue(client)
  mockAuth.mockResolvedValue({ user: { email, role } })
  captured = null
  const el = await CommentarySection({ clientSlug: 'c', viewKey: viewKey as never, ...extra } as never)
  if (el) render(el)
  return captured
}

test('what a client without reportingMonths hands the panel, per view key, email and role', async () => {
  const out: Record<string, unknown> = {}
  for (const viewKey of VIEW_KEYS) for (const email of EMAILS) for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
    out[`${viewKey} ${email} ${role}`] = await panelProps(NON_OPTED, viewKey, email, role)
  }
  expect(out).toMatchSnapshot()
})

test('a failing auth() still throws, as today', async () => {
  getClientBySlug.mockResolvedValue(NON_OPTED)
  mockAuth.mockRejectedValue(new Error('session down'))
  await expect(CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).rejects.toThrow('session down')
})
```

- [ ] **Step 6: Append the panel and editor HTML snapshots to `commentary-panel.test.tsx`**

Add at the end of the file (it already mocks `next/navigation` and `@/app/actions/commentary`; add `import { CommentaryEditor } from './commentary-editor'` next to its `CommentaryPanel` import, and `import { createElement, type ReactElement } from 'react'`):

```tsx
// Pre-change record for locked months (spec section 8): the panel and the editor render the same
// HTML without the new optional props. Local-time stamps are normalised so the snapshot does not
// depend on the machine's timezone (CI runs in UTC).
const localTime = /[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M/g
const html = (el: ReactElement) => render(el).container.innerHTML.replace(localTime, '<local time>')

test('panel and editor HTML without the new optional props', () => {
  const SECOND: CommentaryEntry = { ...ENTRY, id: 'e2', periodStart: '2026-05-01', periodEnd: '2026-05-31', status: 'draft' }
  const panel = (canEdit: boolean, entries: CommentaryEntry[]) => html(
    <CommentaryPanel clientSlug="acme" viewKey="peec-ai" entries={entries} initialId={entries[0]?.id ?? null}
      capabilities={{ canEdit, canApprove: false }} history={[]} />,
  )
  expect({
    editorTwoEntries: panel(true, [ENTRY, SECOND]),
    clientOneEntry: panel(false, [ENTRY]),
    editorEmpty: panel(true, []),
    // createElement, not JSX: scripts/check-rsc-props.ts scans test files too and flags a JSX
    // function prop on a client component in a file without 'use client'.
    newEditor: html(createElement(CommentaryEditor, { clientSlug: 'acme', viewKey: 'peec-ai', onDone: () => {} })),
    editEditor: html(createElement(CommentaryEditor, { clientSlug: 'acme', viewKey: 'peec-ai', entry: ENTRY, onDone: () => {} })),
  }).toMatchSnapshot()
})
```

- [ ] **Step 7: Append the section output snapshot to `components/report-sections/organic-social/index.test.tsx`**

Add `import { elementTree } from '@/lib/test-utils/element-tree'` to the imports, then at the end of the file:

```tsx
// Pre-change record for locked months (spec section 8): for a client without reportingMonths the
// section's OUTPUT (every part and the ctx it receives) is unchanged, on the happy path and when
// BOTH lookups fail. Extends the truthy-only test above.
test('OrganicSocialBody output is unchanged for a client without reportingMonths', async () => {
  const base = buildOrganicSocialCtx({ clientSlug: 'renaissance', channel: 'INSTAGRAM', dateRange: 'last_month', compareRange: 'previous_period' })
  getSectionTemplate.mockResolvedValue(null)
  getClientBySlug.mockResolvedValue({ slug: 'renaissance', dashSocialConfig: { brandId: 1 }, reportSectionConfig: {} })
  const happy = elementTree(await OrganicSocialBody({ ctx: base }))
  const overview = elementTree(await OrganicSocialBody({ ctx }))
  getSectionTemplate.mockRejectedValue(new Error('DB down'))
  getClientBySlug.mockRejectedValue(new Error('DB down'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const bothFail = elementTree(await OrganicSocialBody({ ctx: base }))
  err.mockRestore()
  expect({ happy, overview, bothFail }).toMatchSnapshot()
})
```

- [ ] **Step 8: Run all of Task 0 twice, then commit**

Run: `npx vitest run lib/organic-social/locked-months-parity.test.tsx components/report-sections/commentary components/report-sections/organic-social/index.test.tsx` (twice)
Expected: all PASS both times; the second run writes nothing. Open each new `.snap` file and confirm it contains no local-time string and no real client identifier.

```bash
git add lib/test-utils/element-tree.ts lib/organic-social/locked-months-parity.test.tsx lib/organic-social/__snapshots__ components/report-sections/commentary/commentary-parity.test.tsx components/report-sections/commentary/commentary-panel.test.tsx components/report-sections/commentary/__snapshots__ components/report-sections/organic-social/index.test.tsx components/report-sections/organic-social/__snapshots__
git commit -m "test(organic-social): pre-change snapshots for locked months

Captured against today's code before any locked months change: the four
routes' returned trees for clients without reportingMonths (every URL
shape, both roles, health mode), the props Commentary hands its panel on
every view key, the panel and editor HTML, and the Organic Social
section's output. They must not move.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: The rules (`reporting-months.ts`)

**Files:**
- Create: `lib/organic-social/reporting-months.ts`
- Test: `lib/organic-social/reporting-months.test.ts`

**Interfaces:**
- Produces (exact): `MAX_REPORTING_MONTHS = 36`; types `Clock = { today: string; lastCompleteUtcDay: string; liveDayInProgress: boolean }`, `Viewer = 'team' | 'client'`, `MonthOption`, `LockedRange` (as spec 4.1); `viewerForRole(role: unknown): Viewer`, `hasReportingMonths(client: unknown): boolean`, `clockFor(now: Date): Clock`, `opensOn(key: string, opensOnDay: number, weekendRule: 'next-monday' | 'previous-friday'): string`, `parseReportingMonths(v: unknown): { ok: true; cfg: {...}; badKey: string | null } | { ok: false; key: string }`, `resolveLockedRange(cfgValue: unknown, viewer: Viewer, clock: Clock, requested: unknown): LockedRange`, `noMonthsText(r: LockedRange, viewer: Viewer): string`, `firstOf(key)`, `lastOf(key)`, `monthOf(day)`, `monthTitle(key)`, `shortDay(day)`.

**Edge cases this task closes** (re-derive with `file:line` at build): 8 cap, 9 fixed point, 10 and 11 input shapes, 12 comparison derived, 13 config shapes, 15 calendar, 17 live end, 28 label.

- [ ] **Step 1: Write the failing tests**

`lib/organic-social/reporting-months.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  MAX_REPORTING_MONTHS, clockFor, hasReportingMonths, noMonthsText, opensOn, parseReportingMonths,
  resolveLockedRange, viewerForRole, type Clock,
} from './reporting-months'
import { isPeriodOpen } from './frozen'

const C = (today: string, lastCompleteUtcDay: string, liveDayInProgress = false): Clock => ({ today, lastCompleteUtcDay, liveDayInProgress })
const CFG = { firstMonth: '2026-08' }
const OCT20 = C('2026-10-20', '2026-10-19')
const keys = (r: { months: { key: string }[] }) => r.months.map((m) => m.key)

describe('viewer and opt in', () => {
  test('only the two internal roles are the team; anything else is a client', () => {
    expect(viewerForRole('INTERNAL_ADMIN')).toBe('team')
    expect(viewerForRole('INTERNAL_ANALYST')).toBe('team')
    for (const r of ['CLIENT_VIEWER', 'CLIENT_ADMIN', 'INTERNAL_OTHER', undefined, null, 1, '']) expect(viewerForRole(r)).toBe('client')
  })
  test('opted in means the config has its own reportingMonths key, whatever the value', () => {
    expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: CFG } })).toBe(true)
    expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: null } })).toBe(true)
    const inherited = Object.create({ reportingMonths: CFG })
    for (const c of [{ dashSocialConfig: { brandId: 1 } }, { dashSocialConfig: null }, { dashSocialConfig: 'x' }, { dashSocialConfig: [] }, { dashSocialConfig: inherited }, null, undefined, 'c']) {
      expect(hasReportingMonths(c)).toBe(false)
    }
  })
})

describe('clock', () => {
  test('today is New York, the live month ends on the last complete UTC day', () => {
    expect(clockFor(new Date('2026-10-20T14:00:00Z'))).toEqual(C('2026-10-20', '2026-10-19', false))
    expect(clockFor(new Date('2026-10-21T01:00:00Z'))).toEqual(C('2026-10-20', '2026-10-20', true))
    expect(clockFor(new Date('2026-11-02T03:30:00Z'))).toEqual(C('2026-11-01', '2026-11-01', true))
    expect(clockFor(new Date('2026-03-08T07:30:00Z'))).toEqual(C('2026-03-08', '2026-03-07', false))
  })
  test('the live range is open to the freeze check at every sampled moment of 2026 (edge 17)', () => {
    let lives = 0
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3 * 3600 * 1000) {
      const now = new Date(t)
      const live = resolveLockedRange({ firstMonth: '2025-01' }, 'team', clockFor(now), undefined).months.find((m) => m.live)
      if (!live) continue
      lives++
      expect(isPeriodOpen(live.dateRange.split(',')[1], now.toISOString().slice(0, 10))).toBe(true)
    }
    expect(lives).toBeGreaterThan(2800)
  })
})

describe('opening day', () => {
  test('defaults: the 12th, a weekend moves to the Monday after (worked calendar, spec 3.4)', () => {
    expect(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-08'].map((k) => opensOn(k, 12, 'next-monday')))
      .toEqual(['2026-09-14', '2026-10-12', '2026-11-12', '2026-12-14', '2027-01-12', '2027-09-13'])
  })
  test('previous-friday moves a weekend day back; day 4 on a Sunday opens Friday the 2nd', () => {
    expect(opensOn('2026-11', 12, 'previous-friday')).toBe('2026-12-11')
    expect(opensOn('2027-08', 12, 'previous-friday')).toBe('2027-09-10')
    expect(opensOn('2026-09', 4, 'previous-friday')).toBe('2026-10-02')
    expect(isPeriodOpen('2026-09-30', '2026-10-02')).toBe(false)
  })
})

describe('config (edge 13)', () => {
  test('firstMonth is required; a malformed whole value fails with its key', () => {
    expect(parseReportingMonths(null)).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths('2026-08')).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths([])).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths({})).toEqual({ ok: false, key: 'firstMonth' })
    expect(parseReportingMonths({ firstMonth: '2026-13' })).toEqual({ ok: false, key: 'firstMonth' })
    expect(parseReportingMonths({ firstMonth: 202608 })).toEqual({ ok: false, key: 'firstMonth' })
  })
  test('optional knobs default, validate, and name the first bad one; unknown keys are ignored', () => {
    expect(parseReportingMonths({ firstMonth: '2026-08', extra: 1 })).toEqual({ ok: true, badKey: null, cfg: { firstMonth: '2026-08', opensOnDay: 12, weekendRule: 'next-monday', comparison: 'previous-month' } })
    expect(parseReportingMonths({ firstMonth: '2026-08', opensOnDay: 28, weekendRule: 'previous-friday', comparison: 'previous-year' })).toMatchObject({ ok: true, badKey: null })
    expect(parseReportingMonths({ firstMonth: '2026-08', opensOnDay: 4 })).toMatchObject({ ok: true, badKey: null })
    for (const [k, v] of [['opensOnDay', 3], ['opensOnDay', 29], ['opensOnDay', 4.5], ['opensOnDay', '12'], ['weekendRule', 'x'], ['comparison', 'x']] as const) {
      expect(parseReportingMonths({ firstMonth: '2026-08', [k]: v })).toMatchObject({ ok: true, badKey: k })
    }
  })
})

describe('months, defaults and comparison on 20 Oct 2026', () => {
  test('a client sees September and August and lands on September', () => {
    const r = resolveLockedRange(CFG, 'client', OCT20, undefined)
    expect(keys(r)).toEqual(['2026-09', '2026-08'])
    expect(r.month).toEqual({
      key: '2026-09', label: 'September 2026', dateRange: 'custom:2026-09-01,2026-09-30',
      compareRange: 'custom:2026-08-01,2026-08-31', compareLabel: 'vs August 2026', live: false, opensOn: '2026-10-12', tag: null,
    })
    expect([r.outcome, r.reason, r.hiddenMonthAttempt]).toEqual(['absent', 'ok', false])
  })
  test('the team also sees October live and lands on the most recent finished month', () => {
    const r = resolveLockedRange(CFG, 'team', OCT20, undefined)
    expect(keys(r)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(r.months[0]).toMatchObject({
      label: 'October 2026, through Oct 19', dateRange: 'custom:2026-10-01,2026-10-19',
      compareRange: 'custom:2026-09-01,2026-09-19', compareLabel: 'vs Sep 1 to Sep 19', live: true, tag: 'Live, team only',
    })
    expect(r.month?.key).toBe('2026-09')
  })
  test('August compares with July, which is never pickable', () => {
    const aug = resolveLockedRange(CFG, 'client', OCT20, 'custom:2026-08-01,2026-08-31').month
    expect([aug?.compareRange, aug?.compareLabel]).toEqual(['custom:2026-07-01,2026-07-31', 'vs July 2026'])
  })
  test('before the opening day the team sees the finished month tagged; the client does not see it', () => {
    const oct5 = C('2026-10-05', '2026-10-04')
    expect(resolveLockedRange(CFG, 'team', oct5, undefined).months[1]).toMatchObject({ key: '2026-09', tag: 'Team only until Oct 12' })
    expect(keys(resolveLockedRange(CFG, 'client', oct5, undefined))).toEqual(['2026-08'])
    expect(keys(resolveLockedRange(CFG, 'client', C('2026-10-12', '2026-10-11'), undefined))).toEqual(['2026-09', '2026-08'])
    expect(resolveLockedRange(CFG, 'team', C('2026-12-12', '2026-12-11'), undefined).months[1]).toMatchObject({ key: '2026-11', tag: 'Team only until Dec 14' })
  })
  test('on the 1st before 00:00 UTC of the 2nd there is no live month; a new client defaults to the live month', () => {
    const r = resolveLockedRange(CFG, 'team', C('2026-11-01', '2026-10-31'), undefined)
    expect(keys(r)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(r.months.some((m) => m.live)).toBe(false)
    const fresh = resolveLockedRange({ firstMonth: '2026-10' }, 'team', OCT20, undefined)
    expect([keys(fresh), fresh.month?.key, fresh.month?.live]).toEqual([['2026-10'], '2026-10', true])
  })
  test('the in-progress label shows while the UTC hour is before 4 (edge 28)', () => {
    expect(resolveLockedRange(CFG, 'team', C('2026-10-20', '2026-10-20', true), undefined).months[0].label)
      .toBe('October 2026, through Oct 20 (in progress)')
  })
  test('same days of last month, clamped; previous-year across a leap day', () => {
    expect(resolveLockedRange(CFG, 'team', C('2027-03-31', '2027-03-30'), undefined).months[0].compareRange).toBe('custom:2027-02-01,2027-02-28')
    const yearly = { firstMonth: '2026-08', comparison: 'previous-year' }
    expect(resolveLockedRange(yearly, 'team', OCT20, undefined).month).toMatchObject({ compareRange: 'custom:2025-09-01,2025-09-30', compareLabel: 'vs September 2025' })
    expect(resolveLockedRange(yearly, 'team', C('2028-02-29', '2028-02-29', true), undefined).months[0].compareRange).toBe('custom:2027-02-01,2027-02-28')
  })
  test('a malformed comparison falls back to previous-month for the team', () => {
    expect(resolveLockedRange({ firstMonth: '2026-08', comparison: 'x' }, 'team', OCT20, undefined).month?.compareRange).toBe('custom:2026-08-01,2026-08-31')
  })
})

describe('matching a request', () => {
  const client = (req: unknown, clock = OCT20) => resolveLockedRange(CFG, 'client', clock, req)
  test('the canonical string is a fixed point, every day and both viewers (edge 9)', () => {
    for (let t = Date.UTC(2026, 7, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
      for (const hour of [2, 14]) {
        const clock = clockFor(new Date(t + hour * 3600000))
        for (const viewer of ['team', 'client'] as const) {
          for (const m of resolveLockedRange(CFG, viewer, clock, undefined).months) {
            const again = resolveLockedRange(CFG, viewer, clock, m.dateRange)
            expect([again.outcome, again.month?.key]).toEqual(['canonical', m.key])
          }
        }
      }
    }
  })
  test('a client reaching for the live month is a hidden-month attempt and gets the default', () => {
    expect(client('custom:2026-10-01,2026-10-19')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-09' } })
    expect(client('custom:2026-10-01,2026-10-05')).toMatchObject({ hiddenMonthAttempt: true })
  })
  test('a client reaching for a whole unopened month is an attempt; a partial one is not', () => {
    const oct5 = C('2026-10-05', '2026-10-04')
    expect(client('custom:2026-09-01,2026-09-30', oct5)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-08' } })
    expect(client('custom:2026-09-01,2026-09-15', oct5)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false })
  })
  test('the current month is not an attempt while no live month exists', () => {
    expect(client('custom:2026-11-01,2026-11-01', C('2026-11-01', '2026-10-31'))).toMatchObject({ hiddenMonthAttempt: false })
  })
  test('stale presets, junk, arrays, partial or impossible ranges and months before firstMonth are replaced silently (edges 10, 11)', () => {
    for (const req of ['last_30_days', 'junk', '', ['a', 'b'], 'custom:2026-09-01,2026-09-15', 'custom:2026-09-31,2026-09-30', 'custom:2026-09-30,2026-09-01', 'custom:2026-07-01,2026-07-31', 'custom:2026-08-01', 'custom:2026-09-01,2026-10-31']) {
      expect(client(req)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-09' } })
    }
    expect(client('custom:2026-08-01,2026-08-31')).toMatchObject({ outcome: 'canonical', month: { key: '2026-08' } })
  })
  test("a team member's live link from an earlier day still means the live month", () => {
    expect(resolveLockedRange(CFG, 'team', OCT20, 'custom:2026-10-01,2026-10-05')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-10', live: true } })
    expect(resolveLockedRange(CFG, 'team', OCT20, 'custom:2026-10-01,2026-10-31')).toMatchObject({ month: { key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19' } })
  })
})

describe('no months and bad config', () => {
  test('malformed config: no months for anyone, the key named', () => {
    for (const v of ['team', 'client'] as const) {
      expect(resolveLockedRange(null, v, OCT20, 'x')).toEqual({ months: [], month: null, outcome: 'replaced', hiddenMonthAttempt: false, reason: 'malformed-config', malformedKey: 'reportingMonths', firstOpensOn: null })
    }
    expect(resolveLockedRange({}, 'client', OCT20, undefined)).toMatchObject({ outcome: 'absent', malformedKey: 'firstMonth' })
  })
  test('a bad optional knob: the team keeps its months, tagged; clients get none', () => {
    const bad = { firstMonth: '2026-08', opensOnDay: 3 }
    const team = resolveLockedRange(bad, 'team', OCT20, undefined)
    expect([keys(team), team.reason, team.malformedKey, team.month?.key]).toEqual([['2026-10', '2026-09', '2026-08'], 'malformed-config', 'opensOnDay', '2026-09'])
    expect(team.months.map((m) => m.tag)).toEqual(['Live, team only', 'Hidden from clients: config error', 'Hidden from clients: config error'])
    expect(resolveLockedRange(bad, 'client', OCT20, undefined)).toMatchObject({ months: [], month: null, firstOpensOn: null, reason: 'malformed-config' })
  })
  test('a future firstMonth: not started, and the client is told when the first report opens', () => {
    const later = { firstMonth: '2027-01' }
    expect(resolveLockedRange(later, 'team', OCT20, undefined)).toMatchObject({ months: [], month: null, reason: 'not-started' })
    const r = resolveLockedRange(later, 'client', OCT20, undefined)
    expect(r.firstOpensOn).toBe('2027-02-12')
    expect(noMonthsText(r, 'client')).toBe('Your first report opens on Feb 12')
  })
  test('the first month finished but not open yet: the client is told the date', () => {
    const r = resolveLockedRange({ firstMonth: '2026-09' }, 'client', C('2026-10-05', '2026-10-04'), undefined)
    expect([r.reason, r.firstOpensOn, noMonthsText(r, 'client')]).toEqual(['not-open-yet', '2026-10-12', 'Your first report opens on Oct 12'])
  })
  test('the no-months copy for each viewer (spec 3.8)', () => {
    expect(noMonthsText(resolveLockedRange(null, 'client', OCT20, undefined), 'client')).toBe('No reports are available yet')
    expect(noMonthsText(resolveLockedRange(null, 'team', OCT20, undefined), 'team')).toBe('No reporting months yet: the reportingMonths setting is invalid (reportingMonths)')
    expect(noMonthsText(resolveLockedRange({ firstMonth: '2027-01' }, 'team', OCT20, undefined), 'team')).toBe('No reporting months yet: the first reporting month has not started')
  })
  test('the list is capped at MAX_REPORTING_MONTHS, even from an absurd firstMonth (edge 8)', () => {
    expect(MAX_REPORTING_MONTHS).toBe(36)
    for (const v of ['team', 'client'] as const) {
      const r = resolveLockedRange({ firstMonth: '0001-01' }, v, OCT20, undefined)
      expect(r.months).toHaveLength(36)
      expect(r.months[r.months.length - 1].key).toBe(v === 'team' ? '2023-11' : '2023-10')
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts`
Expected: FAIL, `Failed to resolve import "./reporting-months"`.

- [ ] **Step 3: Write the implementation**

`lib/organic-social/reporting-months.ts`:

```ts
// Locked months: which reporting months a viewer may pick, which one to serve, and what it compares
// against. Pure: no I/O, no React, no clock read (the clock is an argument). The rules are in
// docs/superpowers/specs/2026-09-21-locked-months-design.md, section 3. Inputs are `unknown` on
// purpose: the jsonb config and the URL param are untrusted at runtime whatever their types say.

export const MAX_REPORTING_MONTHS = 36

export type Clock = { today: string; lastCompleteUtcDay: string; liveDayInProgress: boolean }
export type Viewer = 'team' | 'client'
export type MonthOption = {
  key: string
  label: string
  dateRange: string
  compareRange: string
  compareLabel: string
  live: boolean
  opensOn: string
  tag: string | null
}
export type LockedRange = {
  months: MonthOption[]
  month: MonthOption | null
  outcome: 'canonical' | 'absent' | 'replaced'
  hiddenMonthAttempt: boolean
  reason: 'ok' | 'malformed-config' | 'not-started' | 'not-open-yet'
  malformedKey: string | null
  firstOpensOn: string | null
}

type WeekendRule = 'next-monday' | 'previous-friday'
type Comparison = 'previous-month' | 'previous-year'
type Config = { firstMonth: string; opensOnDay: number; weekendRule: WeekendRule; comparison: Comparison }
type Parsed = { ok: true; cfg: Config; badKey: string | null } | { ok: false; key: string }

const TEAM_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const utc = (day: string) => new Date(`${day}T00:00:00Z`)
const addDays = (day: string, n: number) => { const d = utc(day); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(2000, 0, 1))
  d.setUTCFullYear(y, m - 1 + n, 1)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}`
}
const isDay = (s: string) => { const d = utc(s); return !Number.isNaN(d.getTime()) && isoDay(d) === s }

export const firstOf = (key: string) => `${key}-01`
export const lastOf = (key: string) => addDays(`${addMonths(key, 1)}-01`, -1)
export const monthOf = (day: string) => day.slice(0, 7)
const daysIn = (key: string) => Number(lastOf(key).slice(8))

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

export function viewerForRole(role: unknown): Viewer {
  return typeof role === 'string' && TEAM_ROLES.has(role) ? 'team' : 'client'
}

/** Opted in = dash_social_config is a plain object with its OWN reportingMonths key, whatever its
 *  value (spec 3.1). Synchronous, no I/O. */
export function hasReportingMonths(client: unknown): boolean {
  if (!isPlainObject(client)) return false
  const cfg = client.dashSocialConfig
  return isPlainObject(cfg) && hasOwn(cfg, 'reportingMonths')
}

/** One clock per request (spec 3.2). */
export function clockFor(now: Date): Clock {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    today: `${part('year')}-${part('month')}-${part('day')}`,
    lastCompleteUtcDay: addDays(isoDay(now), -1),
    liveDayInProgress: now.getUTCHours() < 4,
  }
}

/** The day finished month `key` opens to clients: day `opensOnDay` of the next month, off a weekend. */
export function opensOn(key: string, opensOnDay: number, weekendRule: WeekendRule): string {
  const day = `${addMonths(key, 1)}-${pad(opensOnDay)}`
  const weekday = utc(day).getUTCDay()
  if (weekday === 6) return addDays(day, weekendRule === 'next-monday' ? 2 : -1)
  if (weekday === 0) return addDays(day, weekendRule === 'next-monday' ? 1 : -2)
  return day
}

export function parseReportingMonths(value: unknown): Parsed {
  if (!isPlainObject(value)) return { ok: false, key: 'reportingMonths' }
  const firstMonth = value.firstMonth
  if (typeof firstMonth !== 'string' || !MONTH_RE.test(firstMonth)) return { ok: false, key: 'firstMonth' }
  let badKey: string | null = null
  const bad = (k: string) => { if (badKey === null) badKey = k }
  let opensOnDay = 12
  if (hasOwn(value, 'opensOnDay')) {
    const v = value.opensOnDay
    if (typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 28) opensOnDay = v
    else bad('opensOnDay')
  }
  let weekendRule: WeekendRule = 'next-monday'
  if (hasOwn(value, 'weekendRule')) {
    const v = value.weekendRule
    if (v === 'next-monday' || v === 'previous-friday') weekendRule = v
    else bad('weekendRule')
  }
  let comparison: Comparison = 'previous-month'
  if (hasOwn(value, 'comparison')) {
    const v = value.comparison
    if (v === 'previous-month' || v === 'previous-year') comparison = v
    else bad('comparison')
  }
  return { ok: true, cfg: { firstMonth, opensOnDay, weekendRule, comparison }, badKey }
}

function comparisonFor(key: string, end: string, live: boolean, comparison: Comparison) {
  const ref = addMonths(key, comparison === 'previous-year' ? -12 : -1)
  if (!live) return { range: `custom:${firstOf(ref)},${lastOf(ref)}`, label: `vs ${monthTitle(ref)}` }
  const refEnd = `${ref}-${pad(Math.min(Number(end.slice(8)), daysIn(ref)))}`
  return { range: `custom:${firstOf(ref)},${refEnd}`, label: `vs ${shortDay(firstOf(ref))} to ${shortDay(refEnd)}` }
}

function option(key: string, live: boolean, end: string, cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock): MonthOption {
  const open = opensOn(key, cfg.opensOnDay, cfg.weekendRule)
  const cmp = comparisonFor(key, end, live, cfg.comparison)
  const label = live
    ? `${monthTitle(key)}, through ${shortDay(end)}${clock.liveDayInProgress ? ' (in progress)' : ''}`
    : monthTitle(key)
  let tag: string | null = null
  if (viewer === 'team') {
    if (live) tag = 'Live, team only'
    else if (badKey) tag = 'Hidden from clients: config error'
    else if (clock.today < open) tag = `Team only until ${shortDay(open)}`
  }
  return { key, label, dateRange: `custom:${firstOf(key)},${end}`, compareRange: cmp.range, compareLabel: cmp.label, live, opensOn: open, tag }
}

const liveExists = (current: string, clock: Clock) => clock.lastCompleteUtcDay >= firstOf(current)

/** Newest first: the team gets the live month (when there is one) and every finished month back to
 *  firstMonth; a client gets the finished months that have opened. Bounded by MAX_REPORTING_MONTHS. */
function monthsFor(cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock): MonthOption[] {
  const current = monthOf(clock.today)
  const out: MonthOption[] = []
  if (viewer === 'team' && current >= cfg.firstMonth && liveExists(current, clock)) {
    out.push(option(current, true, clock.lastCompleteUtcDay, cfg, badKey, viewer, clock))
  }
  if (viewer === 'client' && badKey) return out
  let key = addMonths(current, -1)
  for (let i = 0; i < MAX_REPORTING_MONTHS + 2 && key >= cfg.firstMonth && out.length < MAX_REPORTING_MONTHS; i++, key = addMonths(key, -1)) {
    if (viewer === 'client' && clock.today < opensOn(key, cfg.opensOnDay, cfg.weekendRule)) continue
    out.push(option(key, false, lastOf(key), cfg, badKey, viewer, clock))
  }
  return out
}

function parseCustom(s: string): { start: string; end: string } | null {
  const m = CUSTOM_RE.exec(s)
  if (!m) return null
  const [, start, end] = m
  return isDay(start) && isDay(end) && start <= end ? { start, end } : null
}

export function resolveLockedRange(cfgValue: unknown, viewer: Viewer, clock: Clock, requested: unknown): LockedRange {
  const present = requested !== undefined
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) {
    return { months: [], month: null, outcome: present ? 'replaced' : 'absent', hiddenMonthAttempt: false, reason: 'malformed-config', malformedKey: parsed.key, firstOpensOn: null }
  }
  const { cfg, badKey } = parsed
  const current = monthOf(clock.today)
  const months = monthsFor(cfg, badKey, viewer, clock)
  const req = typeof requested === 'string' ? parseCustom(requested) : null
  const reqKey = req && req.start === firstOf(monthOf(req.start)) && monthOf(req.end) === monthOf(req.start) ? monthOf(req.start) : null
  const match = reqKey
    ? months.find((m) => m.key === reqKey && (m.live || req!.end === lastOf(m.key))) ?? null
    : null
  const month = match ?? (viewer === 'team' ? months.find((m) => !m.live) ?? months[0] : months[0]) ?? null
  const outcome: LockedRange['outcome'] = !present ? 'absent' : month && requested === month.dateRange ? 'canonical' : 'replaced'
  // A hidden-month attempt (logged): a whole-month or live-month request for a month that exists but
  // is not in a CLIENT's list, i.e. the live month or a finished month that has not opened (spec 3.7).
  const wholeOrLive = reqKey !== null && (reqKey === current ? liveExists(current, clock) : req!.end === lastOf(reqKey))
  const hiddenMonthAttempt = viewer === 'client' && match === null && wholeOrLive
    && reqKey! >= cfg.firstMonth && reqKey! <= current && !months.some((m) => m.key === reqKey)
  const reason: LockedRange['reason'] = badKey ? 'malformed-config'
    : months.length ? 'ok'
    : cfg.firstMonth > current ? 'not-started' : 'not-open-yet'
  const firstOpensOn = months.length === 0 && viewer === 'client' && !badKey ? opensOn(cfg.firstMonth, cfg.opensOnDay, cfg.weekendRule) : null
  return { months, month, outcome, hiddenMonthAttempt, reason, malformedKey: badKey, firstOpensOn }
}

/** The one line shown when a viewer has no months (spec 3.8). */
export function noMonthsText(r: LockedRange, viewer: Viewer): string {
  if (viewer === 'client') return r.firstOpensOn ? `Your first report opens on ${shortDay(r.firstOpensOn)}` : 'No reports are available yet'
  if (r.reason === 'malformed-config') return `No reporting months yet: the reportingMonths setting is invalid (${r.malformedKey ?? 'reportingMonths'})`
  if (r.reason === 'not-started') return 'No reporting months yet: the first reporting month has not started'
  return 'No reporting months yet'
}
```

Note on `addMonths`: it uses `setUTCFullYear` rather than `Date.UTC(y, ...)` because `Date.UTC` maps years 0 to 99 to 1900 to 1999, which would break an absurd `firstMonth` such as `0001-01`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts --reporter=verbose`
Expected: PASS, every test. Quote each test's own result line in the task report.

- [ ] **Step 5: Commit** (body: this task's edge rows with real `file:line`)

```bash
git add lib/organic-social/reporting-months.ts lib/organic-social/reporting-months.test.ts
git commit -m "feat(organic-social): locked months rules, pure

Which reporting months a viewer may pick, which one to serve, the
comparison, and how a URL request resolves (spec section 3). No I/O and no
clock read; config and request are untrusted input.

## Edge cases
<this task's rows, each with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Server glue, logging, schema type

**Files:**
- Create: `lib/organic-social/locked-range.ts`
- Modify: `lib/db/schema.ts` (inside `interface DashSocialConfig`, directly after the line `  channels?: string[]`, currently line 139)
- Test: `lib/organic-social/locked-range.test.ts`

**Interfaces:**
- Consumes: Task 1 `clockFor`, `hasReportingMonths`, `resolveLockedRange`, `viewerForRole`, `Clock`, `LockedRange`.
- Produces: `requestClock: () => Clock`; `lockedRangeFor(client: unknown, role: unknown, requested: unknown, clock: Clock): LockedRange | null`; `logHiddenMonthAttempt(slug: string, requested: unknown, served: string): void`; `logMalformedConfig(slug: string, key: string | null): void`.

**Edge cases:** 4 and 5 (one line, only for attempts), 16 (clock passed), 24 (escaping, config never logged).

- [ ] **Step 1: Write the failing tests**

`lib/organic-social/locked-range.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { lockedRangeFor, logHiddenMonthAttempt, logMalformedConfig, requestClock } from './locked-range'

const CLOCK = { today: '2026-10-20', lastCompleteUtcDay: '2026-10-19', liveDayInProgress: false }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

test('a client without the key gets null, which every caller treats as today', () => {
  for (const c of [{ dashSocialConfig: { brandId: 1 } }, null, undefined, { dashSocialConfig: null }]) {
    expect(lockedRangeFor(c, 'CLIENT_VIEWER', 'custom:2026-10-01,2026-10-19', CLOCK)).toBeNull()
  }
})

test('an opted-in client resolves with the role and the clock it is given', () => {
  const c = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
  expect(lockedRangeFor(c, 'CLIENT_VIEWER', undefined, CLOCK)?.month?.key).toBe('2026-09')
  expect(lockedRangeFor(c, 'INTERNAL_ADMIN', undefined, CLOCK)?.months[0].live).toBe(true)
  expect(lockedRangeFor(c, undefined, undefined, CLOCK)?.months[0].live).toBe(false)
})

test('requestClock builds the clock from the current time', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T01:00:00Z'))
  expect(requestClock()).toEqual({ today: '2026-10-20', lastCompleteUtcDay: '2026-10-20', liveDayInProgress: true })
})

test('a hidden-month attempt logs one line: slug, served range, the request cut to 64 and escaped', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const raw = `\u2028custom:2026-10-01,2026-10-19\u2029${'x'.repeat(100)}`
  logHiddenMonthAttempt('c', raw, 'custom:2026-09-01,2026-09-30')
  expect(warn).toHaveBeenCalledTimes(1)
  const line = String(warn.mock.calls[0][0])
  expect(line.startsWith('[organic-social] hidden month attempt slug=c served=custom:2026-09-01,2026-09-30 requested=')).toBe(true)
  expect(line).not.toMatch(/[\u2028\u2029]/)
  expect(line.split('requested=')[1]).toBe(JSON.stringify(raw.slice(0, 64)).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))
  logHiddenMonthAttempt('c', ['a', 'b'], 'x')
  expect(String(warn.mock.calls[1][0]).endsWith('requested="a,b"')).toBe(true)
})

test('a malformed config logs the slug and the key, never the config', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  logMalformedConfig('c', 'opensOnDay')
  logMalformedConfig('c', null)
  expect(err.mock.calls).toEqual([
    ['[organic-social] reportingMonths setting is invalid slug=c key=opensOnDay'],
    ['[organic-social] reportingMonths setting is invalid slug=c key=reportingMonths'],
  ])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/organic-social/locked-range.test.ts`
Expected: FAIL, `Failed to resolve import "./locked-range"`.

- [ ] **Step 3: Write the implementation and the schema field**

`lib/organic-social/locked-range.ts`:

```ts
// Server glue for locked months (spec 4.2). `lockedRangeFor` returns null for any client without
// reportingMonths, and every caller treats null as "do exactly what you do today".
import { cache } from 'react'
import { clockFor, hasReportingMonths, resolveLockedRange, viewerForRole, type Clock, type LockedRange } from './reporting-months'

/** One clock per request, shared by the route, the picker, the section and Commentary (spec 3.2).
 *  Outside a request React's cache does not memoise, so callers pass the clock down explicitly. */
export const requestClock = cache((): Clock => clockFor(new Date()))

export function lockedRangeFor(client: unknown, role: unknown, requested: unknown, clock: Clock): LockedRange | null {
  if (!hasReportingMonths(client)) return null
  const cfg = (client as { dashSocialConfig: Record<string, unknown> }).dashSocialConfig.reportingMonths
  return resolveLockedRange(cfg, viewerForRole(role), clock, requested)
}

const escapeLineSeparators = (s: string) => s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** One line per hidden-month attempt, from exactly one layer per request. The request is untrusted:
 *  normalised to a string, cut to 64 characters, JSON-escaped. */
export function logHiddenMonthAttempt(slug: string, requested: unknown, served: string): void {
  const raw = typeof requested === 'string' ? requested : Array.isArray(requested) ? requested.map(String).join(',') : String(requested)
  const cut = escapeLineSeparators(JSON.stringify(raw.slice(0, 64)))
  console.warn(`[organic-social] hidden month attempt slug=${slug} served=${served} requested=${cut}`)
}

/** The slug and the key at fault only: the config holds the brand id and is never logged. */
export function logMalformedConfig(slug: string, key: string | null): void {
  console.error(`[organic-social] reportingMonths setting is invalid slug=${slug} key=${key ?? 'reportingMonths'}`)
}
```

In `lib/db/schema.ts`, directly after the line `  channels?: string[]` inside `export interface DashSocialConfig`, add:

```ts
  /** Locked months for Organic Social (docs/superpowers/specs/2026-09-21-locked-months-design.md).
   *  Present with any value means opted in; validated at runtime, so typed unknown. */
  reportingMonths?: unknown
```

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run lib/organic-social/locked-range.test.ts --reporter=verbose && npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit** (body: this task's edge rows with real `file:line`)

```bash
git add lib/organic-social/locked-range.ts lib/organic-social/locked-range.test.ts lib/db/schema.ts
git commit -m "feat(organic-social): locked months server glue and logging

lockedRangeFor is null for any client without reportingMonths (today's
path everywhere). One clock per request. A hidden-month attempt logs the
slug, the served range and the request cut to 64 characters and escaped;
a malformed config logs the slug and key, never the config.

## Edge cases
<this task's rows, each with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The picker, the control and the no-months card

**Files:**
- Create: `components/report-sections/organic-social/no-months.tsx`, `month-picker.tsx`, `range-control.tsx`
- Test: `components/report-sections/organic-social/month-picker.test.tsx`, `range-control.test.tsx`

**Interfaces:**
- Consumes: Task 1 `MonthOption`, `noMonthsText`, `viewerForRole`; Task 2 `lockedRangeFor`, `requestClock`.
- Produces: `NoMonths({ text }: { text: string })`; `MonthPicker({ months, value, emptyText }: { months: MonthOption[]; value: string | null; emptyText: string | null })` (client component); `OrganicRangeControl({ client, requested, role }: { client: unknown; requested: unknown; role?: string | null })` (async server component; the routes render it only for an opted-in client).

**Edge cases:** 1 (a throw and a rejection both mean client), 12 (the picker never writes `compareRange`).

- [ ] **Step 1: Write the failing tests**

`components/report-sections/organic-social/month-picker.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { MonthOption } from '@/lib/organic-social/reporting-months'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/portal/c/reports',
  useSearchParams: () => new URLSearchParams('section=organic-social&subsection=instagram&dateRange=x&compareRange=previous_year&models=a'),
}))
import { MonthPicker } from './month-picker'

const M = (key: string, label: string, tag: string | null, compareLabel: string, dateRange: string): MonthOption => ({
  key, label, tag, compareLabel, dateRange, compareRange: 'custom:x', live: tag === 'Live, team only', opensOn: `${key}-12`,
})
const MONTHS = [
  M('2026-10', 'October 2026, through Oct 19', 'Live, team only', 'vs Sep 1 to Sep 19', 'custom:2026-10-01,2026-10-19'),
  M('2026-09', 'September 2026', null, 'vs August 2026', 'custom:2026-09-01,2026-09-30'),
]
beforeEach(() => push.mockClear())

test('newest first with tags; the selected month and its comparison shown', () => {
  const { container } = render(<MonthPicker months={MONTHS} value="2026-09" emptyText={null} />)
  expect([...container.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['October 2026, through Oct 19 (Live, team only)', 'September 2026'])
  expect((container.querySelector('select') as HTMLSelectElement).value).toBe('2026-09')
  expect(container.textContent).toContain('vs August 2026')
})

test('choosing a month keeps the other params, sets dateRange and drops compareRange', () => {
  const { container } = render(<MonthPicker months={MONTHS} value="2026-09" emptyText={null} />)
  fireEvent.change(container.querySelector('select')!, { target: { value: '2026-10' } })
  expect(push).toHaveBeenCalledWith('/portal/c/reports?section=organic-social&subsection=instagram&dateRange=custom%3A2026-10-01%2C2026-10-19&models=a')
})

test('no months: a disabled control showing the text, and nothing pushes', () => {
  const { container } = render(<MonthPicker months={[]} value={null} emptyText="Your first report opens on Feb 12" />)
  expect(container.querySelector('select')).toBeNull()
  expect(container.textContent).toBe('Your first report opens on Feb 12')
  expect(push).not.toHaveBeenCalled()
})
```

`components/report-sections/organic-social/range-control.test.tsx`:

```tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { auth } from '@/auth'
import { OrganicRangeControl } from './range-control'
import { MonthPicker } from './month-picker'

const OPTED = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T14:00:00Z')); vi.mocked(auth).mockReset() })
afterEach(() => vi.useRealTimers())

async function pickerProps(a: Parameters<typeof OrganicRangeControl>[0]) {
  const el = await OrganicRangeControl(a)
  expect(el?.type).toBe(MonthPicker)
  return el!.props as { months: { key: string }[]; value: string | null; emptyText: string | null }
}

test('a passed role is used and the session is not read', async () => {
  const p = await pickerProps({ client: OPTED, requested: undefined, role: 'CLIENT_VIEWER' })
  expect([p.months.map((m) => m.key), p.value, p.emptyText]).toEqual([['2026-09', '2026-08'], '2026-09', null])
  expect(auth).not.toHaveBeenCalled()
})

test('with no role passed it reads the session; the team sees the live month', async () => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN' } } as never)
  expect((await pickerProps({ client: OPTED, requested: undefined })).months[0].key).toBe('2026-10')
})

test('a session read that throws or rejects means client rules (edge 1)', async () => {
  vi.mocked(auth).mockImplementation(() => { throw new Error('sync') })
  expect((await pickerProps({ client: OPTED, requested: undefined })).months.map((m) => m.key)).toEqual(['2026-09', '2026-08'])
  vi.mocked(auth).mockRejectedValue(new Error('async'))
  expect((await pickerProps({ client: OPTED, requested: undefined })).months.map((m) => m.key)).toEqual(['2026-09', '2026-08'])
})

test('the requested month is selected when it is in the list', async () => {
  expect((await pickerProps({ client: OPTED, requested: 'custom:2026-08-01,2026-08-31', role: 'CLIENT_VIEWER' })).value).toBe('2026-08')
})

test('no months: the picker gets the spec 3.8 text; a client without the key gets nothing', async () => {
  const later = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } }
  expect((await pickerProps({ client: later, requested: undefined, role: 'CLIENT_VIEWER' })).emptyText).toBe('Your first report opens on Feb 12')
  expect(await OrganicRangeControl({ client: { dashSocialConfig: { brandId: 1 } }, requested: undefined, role: null })).toBeNull()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/report-sections/organic-social/month-picker.test.tsx components/report-sections/organic-social/range-control.test.tsx`
Expected: FAIL, unresolved imports `./month-picker` and `./range-control`.

- [ ] **Step 3: Write the three components**

`components/report-sections/organic-social/no-months.tsx`:

```tsx
/** The one line shown instead of Organic Social's parts when a viewer has no reporting months
 *  (locked months spec 3.8). */
export function NoMonths({ text }: { text: string }) {
  return <p className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 text-sm text-text-muted">{text}</p>
}
```

`components/report-sections/organic-social/month-picker.tsx`:

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { MonthOption } from '@/lib/organic-social/reporting-months'

/** Month and year picker for locked-months clients (spec 4.3). Labels, tags and comparisons arrive
 *  formatted from the server; the browser never formats a date. Choosing a month sets dateRange to
 *  its canonical range and removes compareRange; every other param is kept. */
export function MonthPicker({ months, value, emptyText }: { months: MonthOption[]; value: string | null; emptyText: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (months.length === 0) {
    return <span aria-disabled="true" className="text-sm text-text-muted">{emptyText ?? 'No reporting months yet'}</span>
  }

  const selected = months.find((m) => m.key === value) ?? null
  const choose = (key: string) => {
    const month = months.find((m) => m.key === key)
    if (!month) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', month.dateRange)
    params.delete('compareRange')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <label className="flex flex-col items-end gap-0.5">
      <span className="sr-only">Reporting month</span>
      <select
        value={selected?.key ?? ''}
        onChange={(e) => choose(e.target.value)}
        className="rounded-md border border-white/10 bg-bg-surface px-3.5 py-2 text-sm font-medium text-white"
      >
        {months.map((m) => (
          <option key={m.key} value={m.key}>{m.tag ? `${m.label} (${m.tag})` : m.label}</option>
        ))}
      </select>
      {selected && <span className="text-[11px] text-text-muted">{selected.compareLabel}</span>}
    </label>
  )
}
```

`components/report-sections/organic-social/range-control.tsx`:

```tsx
import { auth } from '@/auth'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { noMonthsText, viewerForRole } from '@/lib/organic-social/reporting-months'
import { MonthPicker } from './month-picker'

/** The Organic Social picker for a locked-months client (spec 4.4). The routes render it only for
 *  such a client. Reads the session only when no role is passed; a throw or a rejection both mean
 *  client rules. */
export async function OrganicRangeControl({ client, requested, role }: { client: unknown; requested: unknown; role?: string | null }) {
  let viewerRole = role
  if (viewerRole === undefined) {
    try { viewerRole = (await auth())?.user?.role ?? null } catch { viewerRole = null }
  }
  const locked = lockedRangeFor(client, viewerRole, requested, requestClock())
  if (!locked) return null
  return (
    <MonthPicker
      months={locked.months}
      value={locked.month?.key ?? null}
      emptyText={locked.month ? null : noMonthsText(locked, viewerForRole(viewerRole))}
    />
  )
}
```

- [ ] **Step 4: Run tests, tsc and the RSC check**

Run: `npx vitest run components/report-sections/organic-social/month-picker.test.tsx components/report-sections/organic-social/range-control.test.tsx --reporter=verbose && npx tsc --noEmit && npm run -s check:rsc`
Expected: PASS; tsc exit 0; the RSC check passes.

- [ ] **Step 5: Commit** (body: this task's edge rows with real `file:line`)

```bash
git add components/report-sections/organic-social/no-months.tsx components/report-sections/organic-social/month-picker.tsx components/report-sections/organic-social/range-control.tsx components/report-sections/organic-social/month-picker.test.tsx components/report-sections/organic-social/range-control.test.tsx
git commit -m "feat(organic-social): month picker and range control for locked months

The picker gets its months, labels, tags and comparison from the server
and only ever writes dateRange (compareRange removed). The control reads
the session only when no role is passed; a failed read means client rules.

## Edge cases
<this task's rows, each with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The section enforces the month

**Files:**
- Modify: `components/report-sections/organic-social/index.tsx` (`OrganicSocialBody` only; the outer header prop is Task 7)
- Test: `components/report-sections/organic-social/index.test.tsx` (append)

**Interfaces:**
- Consumes: Task 1 `noMonthsText`, `viewerForRole`; Task 2 `lockedRangeFor`, `logHiddenMonthAttempt`, `logMalformedConfig`, `requestClock`; Task 3 `NoMonths`.

**Edge cases:**

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 2 | external failure | the template lookup fails and takes the config with it, so a deep link skips the lock | `index.tsx` `Promise.all` (lines 61-70 today) | fix: separate lock read; test |
| 3 | external failure | the lock read itself fails | new lock read | fix: today's path (no Dash getter can load without the same lookup); test |
| 6 | operator visibility | a malformed config silently blanks the section | section | fix: `logMalformedConfig`; test |
| 22 | security | a deep link serves a hidden month | the section is the last point before Dash | fix: served range replaces the ctx; test |

- [ ] **Step 1: Append the failing tests to `index.test.tsx`**

Extend the vitest import to `import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'`, and add `import { render } from '@testing-library/react'`, `import { auth } from '@/auth'`, `import type { OrganicSocialCtx } from './ctx'`. Then append:

```tsx
describe('locked months in the section', () => {
  const OPTED = { slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } }, reportSectionConfig: {} }
  const SEP = 'custom:2026-09-01,2026-09-30'
  const LIVE = 'custom:2026-10-01,2026-10-19'
  let seen: OrganicSocialCtx[] = []
  let restoreLookup: () => void = () => {}
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
    seen = []
    const registry = await import('@/lib/report-sections/registry')
    const spy = vi.spyOn(registry, 'lookup').mockReturnValue({ render: (c: OrganicSocialCtx) => { seen.push(c); return null } } as never)
    restoreLookup = () => spy.mockRestore()
    getSectionTemplate.mockResolvedValue(null)
  })
  afterEach(() => { restoreLookup(); vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })
  const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role } } as never)
  const ctxFor = (dateRange: string) => buildOrganicSocialCtx({ clientSlug: 'c', channel: 'INSTAGRAM', dateRange, compareRange: 'previous_year' })

  test('a client asking for the live month gets September and its comparison, logged once (edge 22)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue(OPTED)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect([c.dateRange, c.compareRange]).toEqual([SEP, 'custom:2026-08-01,2026-08-31'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('the team with a stale preset gets the most recent finished month; nothing is logged', async () => {
    as('INTERNAL_ADMIN'); getClientBySlug.mockResolvedValue(OPTED)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
    expect(warn).not.toHaveBeenCalled()
  })

  test('a template-lookup failure does not disable the lock (edge 2)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue(OPTED); getSectionTemplate.mockRejectedValue(new Error('DB down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })

  test('the lock read failing runs today\'s path (edge 3)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockRejectedValue(new Error('DB down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx0 = ctxFor(LIVE)
    await OrganicSocialBody({ ctx: ctx0 })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c).toEqual({ ...ctx0, role: 'CLIENT_VIEWER' })
  })

  test('no months: the one line and no parts', async () => {
    as('CLIENT_VIEWER')
    getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } })
    const el = await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(seen).toEqual([])
    expect(render(el).container.textContent).toBe('Your first report opens on Feb 12')
  })

  test('a malformed config is logged by slug and key (edge 6); the team keeps its month on a bad knob', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: null } })
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(err).toHaveBeenCalledWith('[organic-social] reportingMonths setting is invalid slug=c key=reportingMonths')
    expect(seen).toEqual([])
    as('INTERNAL_ADMIN'); getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08', opensOnDay: 3 } } })
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(err).toHaveBeenLastCalledWith('[organic-social] reportingMonths setting is invalid slug=c key=opensOnDay')
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })

  test('a session read that fails means client rules', async () => {
    vi.mocked(auth).mockImplementation(() => { throw new Error('sync') })
    getClientBySlug.mockResolvedValue(OPTED)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail and every earlier test still passes**

Run: `npx vitest run components/report-sections/organic-social/index.test.tsx`
Expected: the new lock tests FAIL (the parts get the requested range; no line; no log), except the edge 3 test which already passes on today's code; Task 0's snapshot and every earlier test PASS.

- [ ] **Step 3: Implement in `components/report-sections/organic-social/index.tsx`**

Add, directly after `import { OverviewSkeleton } from './skeletons'`:

```tsx
import { lockedRangeFor, logHiddenMonthAttempt, logMalformedConfig, requestClock } from '@/lib/organic-social/locked-range'
import { noMonthsText, viewerForRole } from '@/lib/organic-social/reporting-months'
import { NoMonths } from './no-months'
```

In `OrganicSocialBody`, leave the role read and the template `try` block exactly as they are. Replace the line

```tsx
  const resolved = resolveSection(template, override)
```

with

```tsx
  // Locked months (spec 4.6). The lock reads its config on its own, so a template-lookup failure
  // cannot disable it. getClientBySlug is request-deduplicated and every route awaited it first, so
  // this adds no query. If it still fails, today's path runs: every Dash getter needs the same
  // lookup, so no data can load.
  let lockClient: unknown
  let lockReadFailed = false
  try { lockClient = await getClientBySlug(rctx.clientSlug) } catch { lockReadFailed = true }
  const locked = lockReadFailed ? null : lockedRangeFor(lockClient, role, rctx.dateRange, requestClock())
  if (locked?.reason === 'malformed-config') logMalformedConfig(rctx.clientSlug, locked.malformedKey)
  if (locked && !locked.month) return <NoMonths text={noMonthsText(locked, viewerForRole(role))} />
  if (locked?.month && locked.outcome === 'replaced' && locked.hiddenMonthAttempt) {
    logHiddenMonthAttempt(rctx.clientSlug, rctx.dateRange, locked.month.dateRange)
  }
  const pctx: OrganicSocialCtx = locked?.month
    ? { ...rctx, dateRange: locked.month.dateRange, compareRange: locked.month.compareRange }
    : rctx
  const resolved = resolveSection(template, override)
```

and in the `resolved.map` body change `impl?.render(rctx, r)` to `impl?.render(pctx, r)`.

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run components/report-sections/organic-social --reporter=verbose && npx tsc --noEmit`
Expected: PASS, including Task 0's section snapshot unchanged; tsc exit 0.

- [ ] **Step 5: Commit** (body: the table above, re-derived with real `file:line`)

```bash
git add components/report-sections/organic-social/index.tsx components/report-sections/organic-social/index.test.tsx
git commit -m "feat(organic-social): the section enforces the locked month

The last point before Dash: an opted-in client's parts get the served
month and its comparison, whatever route they came from. The lock reads
its config on its own, so a template-lookup failure cannot disable it; if
that read fails, today's path runs (no Dash data can load without it).
No months shows one line and no parts.

## Edge cases
<the Task 4 table, each row with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: SPA routes resolve, redirect and serve

**Files:**
- Modify: `app/portal/[clientSlug]/reports/page.tsx`, `app/dashboard/[clientSlug]/reports/page.tsx`
- Test: `lib/organic-social/locked-months-routes.test.tsx` (new)

**Interfaces:**
- Consumes: Task 0 `findElements`, `runRoute`, `redirectOf`; Task 1 `hasReportingMonths`; Task 2 `lockedRangeFor`, `logHiddenMonthAttempt`, `requestClock`; Task 3 `OrganicRangeControl`.

**Edge cases:**

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 7 | operator visibility | the health sweep marks the dashboard SPA down after a redirect | dashboard SPA health branch (line 192 today) | fix: resolve before it, redirect after it; test |
| 9 | bounds | redirect loop | the redirect condition | fix: only `replaced` with a month; canonical never redirects; sweep test re-runs every target |
| 11 | input | a repeated `dateRange` arrives as an array | both SPA routes | fix: resolves to the default and redirects; test |
| 12 | input | a tampered `compareRange` | both SPA routes | fix: dropped from the redirect, ignored when serving; test |
| 22 | security | a client reaches a hidden month on an SPA route, with or without `health=1` | both SPA routes | fix: redirect to the default; sweep test |

- [ ] **Step 1: Write the failing acceptance tests**

`lib/organic-social/locked-months-routes.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { findElements, redirectOf, runRoute } from '@/lib/test-utils/element-tree'

/** Outer acceptance test for locked months (spec section 9): the real route modules, an opted-in
 *  client, a fixed clock (20 Oct 2026, 10:00 New York). The section is stubbed with a named
 *  component, so its props are what the route passed. The async range control, the section and
 *  Commentary are tested on their own, since a returned tree does not render async children. */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { OrganicRangeControl } from '@/components/report-sections/organic-social/range-control'
import { auth } from '@/auth'

const OPTED = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'ga4'], hiddenReports: ['organic-overview'],
  dashSocialConfig: { brandId: 1, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' } },
}
const SEP = 'custom:2026-09-01,2026-09-30'
const AUG = 'custom:2026-08-01,2026-08-31'
const LIVE = 'custom:2026-10-01,2026-10-19'
const DERIVED: Record<string, string> = { [SEP]: AUG, [AUG]: 'custom:2026-07-01,2026-07-31', [LIVE]: 'custom:2026-09-01,2026-09-19' }
const ALLOWED: Record<string, string[]> = { CLIENT_VIEWER: [SEP, AUG], INTERNAL_ADMIN: [LIVE, SEP, AUG] }
const INPUTS: (string | string[] | undefined)[] = [undefined, 'last_30_days', 'last_month', SEP, AUG, LIVE, 'custom:2026-09-01,2026-09-15', 'custom:2026-07-01,2026-07-31', 'junk', ['a', 'b']]

type Route = (a: never) => Promise<unknown>
const spa = (Route: Route, q: Record<string, unknown>) =>
  Route({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: Promise.resolve(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined))) } as never)
const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com' } } as never)
const sectionOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicSocialReport)[0]?.props as { dateRange: string; compareRange: string | null } | undefined
const pickerOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicRangeControl)[0]?.props

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  getClientBySlug.mockResolvedValue(OPTED)
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

describe('SPA routes', () => {
  const ROUTES = [['portal', PortalSpa as Route, '/portal/c/reports'], ['dashboard', DashboardSpa as Route, '/dashboard/c/reports']] as const
  for (const [name, Route, base] of ROUTES) {
    test(`${name}: a client with no dateRange lands on September in place, with the month picker and a keyed Suspense`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social' }))
      if (!('element' in r)) throw new Error(`unexpected redirect ${r.redirect}`)
      expect(sectionOf(r.element)).toMatchObject({ dateRange: SEP, compareRange: AUG })
      expect(pickerOf(r.element)).toMatchObject({ requested: undefined, role: 'CLIENT_VIEWER' })
      const keys = findElements(r.element, (e) => typeof e.key === 'string' && e.key.startsWith('organic-social:')).map((e) => e.key)
      expect(keys.some((k) => k!.includes(`:${SEP}:${AUG}:`))).toBe(true)
    })
    test(`${name}: a client asking for the live month is redirected to September and logged once`, async () => {
      as('CLIENT_VIEWER')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: 'instagram', dateRange: LIVE, compareRange: 'previous_year', models: 'm' })))
        .toBe(`${base}?section=organic-social&subsection=instagram&models=m&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(warn).toHaveBeenCalledTimes(1)
    })
    test(`${name}: stale presets and repeated params redirect silently; the canonical month does not redirect`, async () => {
      as('CLIENT_VIEWER')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: 'last_30_days' }))).toBe(`${base}?section=organic-social&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: ['a', 'b'] }))).toBe(`${base}?section=organic-social&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: SEP }))).toBeNull()
      expect(warn).not.toHaveBeenCalled()
    })
    test(`${name}: a tampered compareRange is ignored on the canonical month (edge 12)`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', dateRange: SEP, compareRange: 'previous_year' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).toMatchObject({ dateRange: SEP, compareRange: AUG })
    })
    test(`${name}: the team may open the live month`, async () => {
      as('INTERNAL_ADMIN')
      const r = await runRoute(spa(Route, { section: 'organic-social', dateRange: LIVE }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).toMatchObject({ dateRange: LIVE, compareRange: 'custom:2026-09-01,2026-09-19' })
    })
    test(`${name}: another section for the same client is untouched`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'ga4', dateRange: 'last_30_days' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(pickerOf(r.element)).toBeUndefined()
    })
    test(`${name}: sweep, every input and both roles: at most one hop, and only an allowed month is served (edges 9, 22)`, async () => {
      for (const role of ['CLIENT_VIEWER', 'INTERNAL_ADMIN'] as const) {
        as(role)
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        for (const dateRange of INPUTS) for (const compareRange of [undefined, 'previous_year']) {
          const first = await runRoute(spa(Route, { section: 'organic-social', dateRange, compareRange }))
          let tree: unknown
          if ('redirect' in first) {
            const target = new URL(first.redirect, 'http://x')
            expect(target.searchParams.has('compareRange')).toBe(false)
            const second = await runRoute(spa(Route, Object.fromEntries(target.searchParams)))
            if (!('element' in second)) throw new Error(`second hop for ${role} ${JSON.stringify(dateRange)}`)
            tree = second.element
          } else tree = first.element
          const served = sectionOf(tree)!
          expect(ALLOWED[role]).toContain(served.dateRange)
          expect(served.compareRange).toBe(DERIVED[served.dateRange])
        }
      }
    })
  }
  test('dashboard: health mode serves the default month in place and never redirects (edge 7)', async () => {
    as('INTERNAL_ADMIN')
    const r = await runRoute(spa(DashboardSpa as Route, { section: 'organic-social', dateRange: 'last_30_days', health: '1' }))
    if (!('element' in r)) throw new Error('health mode redirected')
    const probe = findElements(r.element, (e) => typeof e.type === 'function' && (e.type as { name?: string }).name === 'HealthProbe')[0]
    expect((probe.props.element as ReactElement<Record<string, unknown>>).props).toMatchObject({ dateRange: SEP, compareRange: AUG })
  })
  test('dashboard: a client appending health=1 is still redirected away from the live month', async () => {
    as('CLIENT_VIEWER')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await redirectOf(spa(DashboardSpa as Route, { section: 'organic-social', dateRange: LIVE, health: '1' })))
      .toBe('/dashboard/c/reports?section=organic-social&health=1&dateRange=custom%3A2026-09-01%2C2026-09-30')
  })
  test('bare /reports keeps the existing first hop, carrying the param', async () => {
    as('CLIENT_VIEWER')
    getClientBySlug.mockResolvedValue({ ...OPTED, enabledReports: ['organic-social'] })
    expect(await redirectOf(spa(PortalSpa as Route, { dateRange: 'last_30_days' }))).toBe('/portal/c/reports?dateRange=last_30_days&section=organic-social')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/organic-social/locked-months-routes.test.tsx`
Expected: FAIL (the section gets the raw range, nothing redirects, no `OrganicRangeControl`); the bare `/reports` and other-section tests already pass.

- [ ] **Step 3: Implement the portal SPA (`app/portal/[clientSlug]/reports/page.tsx`)**

Imports, directly after `import type { DashChannel } from '@/lib/organic-social/metrics'`:

```tsx
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { lockedRangeFor, logHiddenMonthAttempt, requestClock } from '@/lib/organic-social/locked-range'
import { OrganicRangeControl } from '@/components/report-sections/organic-social/range-control'
```

Directly after the `organicEntry` statement (`const organicEntry = activeSection === 'organic-social' ? resolveOrganicSubsection(client, subsectionParam) : null`), insert:

```tsx
  // Locked months, opted-in clients only (spec docs/superpowers/specs/2026-09-21-locked-months-design.md,
  // 4.5). For everyone else `locked` is null and the served range is exactly the requested one.
  const locked = activeSection === 'organic-social' && hasReportingMonths(client)
    ? lockedRangeFor(client, session?.user?.role, dateRangeParam, requestClock())
    : null
  if (locked?.month && locked.outcome === 'replaced') {
    if (locked.hiddenMonthAttempt) logHiddenMonthAttempt(clientSlug, dateRangeParam, locked.month.dateRange)
    const sp = new URLSearchParams()
    if (section)         sp.set('section', section)
    if (subsectionParam) sp.set('subsection', subsectionParam)
    if (modelsParam)     sp.set('models', modelsParam)
    sp.set('dateRange', locked.month.dateRange)
    redirect(`/portal/${clientSlug}/reports?${sp.toString()}`)
  }
  const servedDateRange    = locked?.month?.dateRange ?? dateRange
  const servedCompareRange = locked?.month ? locked.month.compareRange : compareRange
```

Replace the Organic Social picker block

```tsx
        {activeSection === 'organic-social' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
```

with

```tsx
        {activeSection === 'organic-social' && (
          <Suspense fallback={null}>
            {locked
              ? <OrganicRangeControl client={client} requested={dateRangeParam} role={session?.user?.role ?? null} />
              : <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />}
          </Suspense>
        )}
```

In the section's `<Suspense key=...>` and the `getReportComponent(...)` inside it, replace `dateRange` with `servedDateRange` and `compareRange` with `servedCompareRange` (the key becomes ``...:${servedDateRange}:${servedCompareRange ?? ''}:${modelsParam ?? ''}``). No other line changes.

- [ ] **Step 4: Implement the dashboard SPA (`app/dashboard/[clientSlug]/reports/page.tsx`)**

The same three imports, directly after `import { HealthProbe } from '@/lib/health/probe'`.

Directly after the `period` statement (`const period = (... ? periodParam : 'monthly') as SummaryPeriod`), insert the resolve, with NO redirect:

```tsx
  // Locked months, opted-in clients only (spec 4.5). Resolved BEFORE the health branch, which serves
  // the month in place; the redirect comes after it, so the health sweep never meets a redirect.
  const locked = activeSection === 'organic-social' && hasReportingMonths(client)
    ? lockedRangeFor(client, session?.user?.role, dateRangeParam, requestClock())
    : null
  const servedDateRange    = locked?.month?.dateRange ?? dateRange
  const servedCompareRange = locked?.month ? locked.month.compareRange : compareRange
```

In the health branch's `getReportComponent(...)` call, pass `servedDateRange, servedCompareRange` in place of `dateRange, compareRange`.

Directly after the health branch's closing `}` and before `return (`, insert:

```tsx
  if (locked?.month && locked.outcome === 'replaced') {
    if (locked.hiddenMonthAttempt) logHiddenMonthAttempt(clientSlug, dateRangeParam, locked.month.dateRange)
    const sp = new URLSearchParams()
    if (section)         sp.set('section', section)
    if (subsectionParam) sp.set('subsection', subsectionParam)
    if (periodParam)     sp.set('period', periodParam)
    if (modelsParam)     sp.set('models', modelsParam)
    if (healthParam)     sp.set('health', healthParam)
    sp.set('dateRange', locked.month.dateRange)
    redirect(`/dashboard/${clientSlug}/reports?${sp.toString()}`)
  }
```

Replace the Organic Social picker block exactly as in Step 3 (same replacement text), and use `servedDateRange` / `servedCompareRange` in the Suspense key and the main `getReportComponent(...)` call.

- [ ] **Step 5: Run the acceptance test, the Task 0 snapshots, tsc, the RSC check**

Run: `npx vitest run lib/organic-social/locked-months-routes.test.tsx lib/organic-social/locked-months-parity.test.tsx --reporter=verbose && npx tsc --noEmit && npm run -s check:rsc`
Expected: PASS; the parity snapshot unchanged (no written, updated or obsolete snapshot); tsc exit 0; the RSC check passes.

- [ ] **Step 6: Commit** (body: the table above, re-derived with real `file:line`)

```bash
git add 'app/portal/[clientSlug]/reports/page.tsx' 'app/dashboard/[clientSlug]/reports/page.tsx' lib/organic-social/locked-months-routes.test.tsx
git commit -F- <<'EOF'
feat(organic-social): SPA routes serve the locked month

For opted-in clients the portal and dashboard SPA routes resolve the
month, redirect a non-canonical request to it (logging a client's
hidden-month attempt), and swap the picker. The dashboard resolves before
its health branch and redirects after it, so the health sweep never meets
a redirect. Every other client and section runs today's code; the
pre-change snapshots are unchanged.

## Edge cases
<the Task 5 table, each row with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Deep-link pages swap the picker

**Files:**
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` (new import lines after line 26, `import { PortalReportDateRange } from './report-date-range'`; the picker line 151)
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` (new import lines after line 23, `import { ReportDateRange } from './report-date-range'`; the picker line 109)
- Test: `lib/organic-social/locked-months-routes.test.tsx` (append)

**Interfaces:**
- Consumes: Task 1 `hasReportingMonths`; Task 3 `OrganicRangeControl`; the Task 5 test file's helpers.

**Edge cases:** 22 (deep links never redirect; the section enforces, proven in Task 4), 7 (the portal deep link is probed by the health sweep and the cache warmer, so it must never redirect).

- [ ] **Step 1: Append the failing tests**

Add to the imports of `lib/organic-social/locked-months-routes.test.tsx`:

```tsx
import PortalDeepLink from '@/app/portal/[clientSlug]/reports/[reportSlug]/page'
import DashboardDeepLink from '@/app/dashboard/[clientSlug]/reports/[reportSlug]/page'
```

Append:

```tsx
describe('deep links', () => {
  const deep = (Route: Route, q: Record<string, unknown>) =>
    Route({ params: Promise.resolve({ clientSlug: 'c', reportSlug: 'organic-social' }), searchParams: Promise.resolve(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined))) } as never)

  test('portal: the month picker with the session role; the raw range goes to the section, which enforces', async () => {
    as('CLIENT_VIEWER')
    const r = await runRoute(deep(PortalDeepLink as Route, { dateRange: LIVE }))
    if (!('element' in r)) throw new Error('deep link redirected')
    expect(pickerOf(r.element)).toMatchObject({ requested: LIVE, role: 'CLIENT_VIEWER' })
    expect(sectionOf(r.element)).toMatchObject({ dateRange: LIVE })
  })
  test('dashboard: the month picker reads its own session', async () => {
    as('INTERNAL_ADMIN')
    const r = await runRoute(deep(DashboardDeepLink as Route, {}))
    if (!('element' in r)) throw new Error('deep link redirected')
    const picker = pickerOf(r.element)
    expect(picker).toBeDefined()
    expect('role' in picker!).toBe(false)
  })
  test('sweep: neither deep link ever redirects, for any input, role or health=1 (edges 7, 22)', async () => {
    for (const role of ['CLIENT_VIEWER', 'INTERNAL_ADMIN'] as const) {
      as(role)
      for (const dateRange of INPUTS) for (const health of [undefined, '1']) {
        for (const Route of [PortalDeepLink, DashboardDeepLink] as Route[]) {
          const r = await runRoute(deep(Route, { dateRange, compareRange: 'previous_year', health }))
          expect('element' in r).toBe(true)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/organic-social/locked-months-routes.test.tsx`
Expected: the two picker tests FAIL (no `OrganicRangeControl`); the sweep passes already (deep links never redirect today).

- [ ] **Step 3: Implement**

Portal deep link. On their own lines directly after `import { PortalReportDateRange } from './report-date-range'`:

```tsx
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { OrganicRangeControl } from '@/components/report-sections/organic-social/range-control'
```

Replace the line `            <PortalReportDateRange value={dateRange} />` with:

```tsx
            {reportSlug === 'organic-social' && hasReportingMonths(client)
              ? <OrganicRangeControl client={client} requested={dateRangeParam} role={session?.user?.role ?? null} />
              : <PortalReportDateRange value={dateRange} />}
```

Dashboard deep link. The same two imports, on their own lines directly after `import { ReportDateRange } from './report-date-range'`. Replace the line `            <ReportDateRange value={dateRange} compareValue={compareRange} />` with:

```tsx
            {reportSlug === 'organic-social' && hasReportingMonths(client)
              ? <OrganicRangeControl client={client} requested={dateRangeParam} />
              : <ReportDateRange value={dateRange} compareValue={compareRange} />}
```

No other line in either file changes.

- [ ] **Step 4: Run tests, the snapshots, tsc, the RSC check, and the PR 255 merge trial**

Run: `npx vitest run lib/organic-social --reporter=verbose && npx tsc --noEmit && npm run -s check:rsc && git fetch -q origin && git merge-tree --write-tree HEAD origin/feat/organic-social-no-overview > /dev/null && echo CLEAN`
Expected: PASS; the parity snapshots unchanged; tsc exit 0; the RSC check passes; `CLEAN`.

- [ ] **Step 5: Commit** (body: this task's edge rows with real `file:line`)

```bash
git add 'app/portal/[clientSlug]/reports/[reportSlug]/page.tsx' 'app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx' lib/organic-social/locked-months-routes.test.tsx
git commit -m "feat(organic-social): deep links show the month picker for locked-months clients

Only the picker line and one import block change in each deep-link page
(kept off the lines PR 255 edits). The section enforces the month in
place, so the health sweep and the cache warmer never meet a redirect.

## Edge cases
<this task's rows, each with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Commentary follows the month

**Files:**
- Create: `lib/commentary/month.ts` + `month.test.ts`, `lib/commentary/initial-period.ts` + `initial-period.test.ts`, `components/report-sections/commentary/monthly.tsx`
- Modify: `components/report-sections/commentary/index.tsx`, `commentary-panel.tsx`, `commentary-editor.tsx`
- Modify: `components/report-sections/shared/shared-parts-header.tsx`, `components/report-sections/shared/parts/registry.tsx`, `components/report-sections/organic-social/index.tsx` (the outer header line only)
- Test: `components/report-sections/commentary/commentary-parity.test.tsx`, `commentary-panel.test.tsx`, `components/report-sections/shared/shared-parts-header.test.tsx` (append)

**Interfaces:**
- Consumes: Task 1 `firstOf`, `lastOf`, `monthTitle`, `shortDay`, `opensOn`, `parseReportingMonths`, `hasReportingMonths`, `viewerForRole`, `Clock`; Task 2 `lockedRangeFor`, `requestClock`.
- Produces: `monthOfEntry(e: Pick<CommentaryEntry, 'periodStart'>): string`, `eligibleEntries(entries: CommentaryEntry[], monthKey: string, clientCutoff: string | null): CommentaryEntry[]`, `pickMonthDefault(entries: CommentaryEntry[], monthKey: string): CommentaryEntry | null`, `clientOpensNote(entry: Pick<CommentaryEntry, 'periodEnd'>, cfgValue: unknown, clock: Clock): string | null`, `isOrganicSocialViewKey(viewKey: string): boolean`; `initialPeriod(entry?: Pick<CommentaryEntry, 'periodStart' | 'periodEnd'>, defaultPeriod?: { start: string; end: string }): { start: string; end: string }`; `monthlyCommentary(args): Promise<JSX.Element | null>`.

**Edge cases:**

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 21 | state | the panel keeps a manual pick across months | the panel element | fix: keyed by the month; test |
| 23 | security | a client gets Commentary for an unopened or live month (a cross-month entry, the history log, or a client-role viewer with an Avenue Z email) | the monthly path | fix: membership AND cutoff; non-editor capabilities and no history for a client role; tests |
| 29 | operator visibility | the team does not know an entry is withheld from clients | the monthly path | fix: the team-only note; tests |
| 30 | state | a non-editor's default picked after redaction | the monthly path | fix: pick first, then redact; test |

- [ ] **Step 1: Write the failing unit tests**

`lib/commentary/month.test.ts`:

```ts
import { expect, test } from 'vitest'
import { clientOpensNote, eligibleEntries, isOrganicSocialViewKey, monthOfEntry, pickMonthDefault } from './month'
import type { CommentaryEntry } from './types'

const E = (id: string, periodStart: string, periodEnd: string, updatedAt = '2026-10-05T10:00:00.000Z'): CommentaryEntry => ({
  id, viewKey: 'organic-social:instagram', bodyHtml: '', periodStart, periodEnd, status: 'approved', updatedBy: 'w@avenuez.com', updatedAt,
  approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null,
})
const CLOCK = { today: '2026-10-20', lastCompleteUtcDay: '2026-10-19', liveDayInProgress: false }

test('an entry belongs to the month of its periodStart', () => {
  expect(monthOfEntry(E('a', '2026-08-01', '2026-09-05'))).toBe('2026-08')
})
test('membership AND the client cutoff; the team has no cutoff', () => {
  const all = [E('sep', '2026-09-01', '2026-09-30'), E('cross', '2026-09-01', '2026-10-19'), E('aug', '2026-08-01', '2026-08-31')]
  expect(eligibleEntries(all, '2026-09', '2026-09-30').map((e) => e.id)).toEqual(['sep'])
  expect(eligibleEntries(all, '2026-09', null).map((e) => e.id)).toEqual(['sep', 'cross'])
  expect(eligibleEntries(all, '2026-07', null)).toEqual([])
})
test('a whole-month entry is preferred over a newer rolling-window one', () => {
  expect(pickMonthDefault([E('roll', '2026-09-10', '2026-10-09', '2026-10-09T00:00:00.000Z'), E('whole', '2026-09-01', '2026-09-30', '2026-10-01T00:00:00.000Z')], '2026-09')?.id).toBe('whole')
  expect(pickMonthDefault([E('roll', '2026-09-10', '2026-10-09')], '2026-09')?.id).toBe('roll')
  expect(pickMonthDefault([], '2026-09')).toBeNull()
})
test('the team note says when clients will see an entry the cutoff still withholds (spec 3.9 example)', () => {
  expect(clientOpensNote(E('a', '2026-08-01', '2026-09-05'), { firstMonth: '2026-08' }, { ...CLOCK, today: '2026-09-15' })).toBe('Clients see this from Oct 12')
  expect(clientOpensNote(E('cross', '2026-09-01', '2026-10-19'), { firstMonth: '2026-08' }, CLOCK)).toBe('Clients see this from Nov 12')
  expect(clientOpensNote(E('sep', '2026-09-01', '2026-09-30'), { firstMonth: '2026-08' }, CLOCK)).toBeNull()
  expect(clientOpensNote(E('x', '2026-09-01', '2026-10-19'), null, CLOCK)).toBeNull()
  expect(clientOpensNote(E('x', '2026-09-01', '2026-10-19'), { firstMonth: '2026-08', opensOnDay: 3 }, CLOCK)).toBeNull()
})
test('only Organic Social view keys follow the month', () => {
  expect(['organic-social', 'organic-social:tiktok', 'organic-social:instagram'].map(isOrganicSocialViewKey)).toEqual([true, true, true])
  expect(['peec-ai', 'meta-ads', 'organic-socialx', 'paid-search'].map(isOrganicSocialViewKey)).toEqual([false, false, false, false])
})
```

`lib/commentary/initial-period.test.ts`:

```ts
import { expect, test } from 'vitest'
import { initialPeriod } from './initial-period'

test('an edited entry keeps its period; a new entry starts from the month on screen; otherwise empty, as today', () => {
  const month = { start: '2026-09-01', end: '2026-09-30' }
  expect(initialPeriod({ periodStart: '2026-08-01', periodEnd: '2026-08-31' }, month)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  expect(initialPeriod(undefined, month)).toEqual(month)
  expect(initialPeriod(undefined, undefined)).toEqual({ start: '', end: '' })
  expect(initialPeriod({ periodStart: '2026-08-01', periodEnd: '2026-08-31' }, undefined)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
})
```

- [ ] **Step 2: Append the failing integration tests**

To `components/report-sections/commentary/commentary-parity.test.tsx` (extend the vitest import with `afterEach, describe`; add `import type { ReactElement } from 'react'`):

```tsx
describe('Commentary follows the month (locked-months clients)', () => {
  const OPTED = { id: 'client-1', slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T14:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  async function run(role: string, email: string, requestedRange?: string, client: unknown = OPTED) {
    getClientBySlug.mockResolvedValue(client)
    mockAuth.mockResolvedValue({ user: { email, role } })
    captured = null
    const el = await CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram', requestedRange } as never)
    if (el) render(el)
    return { props: captured as Record<string, unknown> | null, key: (el as ReactElement | null)?.key ?? null }
  }

  test('a client gets only the served month, approved, redacted, no history (edges 23, 30)', async () => {
    const { props, key } = await run('CLIENT_VIEWER', 'client@example.com')
    expect((props!.entries as CommentaryEntry[]).map((e) => [e.id, e.updatedBy, e.updatedAt])).toEqual([['sep', '', '']])
    expect([props!.initialId, props!.history, props!.capabilities, key]).toEqual(['sep', [], { canEdit: false, canApprove: false }, '2026-09'])
  })
  test('a client-role viewer with an Avenue Z email, even an approver, sees exactly what a client sees (edge 23)', async () => {
    const client = await run('CLIENT_VIEWER', 'client@example.com')
    expect(await run('CLIENT_VIEWER', 'writer@avenuez.com')).toEqual(client)
    expect(await run('CLIENT_VIEWER', 'approver@avenuez.com')).toEqual(client)
  })
  test('a client never gets the live month, even by asking for it', async () => {
    const { props } = await run('CLIENT_VIEWER', 'client@example.com', 'custom:2026-10-01,2026-10-19')
    expect((props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['sep'])
  })
  test('the team gets the month with drafts, a prefilled period, the empty text, and a panel keyed by the month (edge 21)', async () => {
    const { props, key } = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-09-01,2026-09-30')
    expect((props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['sep', 'sep-draft'])
    expect([props!.defaultPeriod, props!.emptyText, key]).toEqual([{ start: '2026-09-01', end: '2026-09-30' }, 'No commentary for September 2026 yet', '2026-09'])
    const aug = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-08-01,2026-08-31')
    expect([aug.key, (aug.props!.entries as CommentaryEntry[]).map((e) => e.id)]).toEqual(['2026-08', ['aug']])
  })
  test('an approver on the team keeps the full history log', async () => {
    const { props } = await run('INTERNAL_ADMIN', 'approver@avenuez.com', 'custom:2026-09-01,2026-09-30')
    expect((props!.history as unknown[]).length).toBeGreaterThan(0)
  })
  test('the team sees the live month empty, with Add, and the whole live month as the prefill', async () => {
    const { props } = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-10-01,2026-10-19')
    expect([props!.entries, props!.emptyText, props!.defaultPeriod]).toEqual([[], 'No commentary for October 2026 yet', { start: '2026-10-01', end: '2026-10-31' }])
  })
  test('no served month: nothing for a client, the empty panel for the team', async () => {
    const later = { ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } }
    getClientBySlug.mockResolvedValue(later)
    mockAuth.mockResolvedValue({ user: { email: 'client@example.com', role: 'CLIENT_VIEWER' } })
    expect(await CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).toBeNull()
    const team = await run('INTERNAL_ADMIN', 'writer@avenuez.com', undefined, later)
    expect([team.props!.entries, team.props!.emptyText]).toEqual([[], 'No reporting months yet'])
  })
  test('parity: requestedRange changes nothing for a client without the key; non-Organic Social views are untouched for an opted-in client', async () => {
    const base: Record<string, unknown> = {}
    const withRange: Record<string, unknown> = {}
    const optedOther: Record<string, unknown> = {}
    for (const viewKey of VIEW_KEYS) for (const email of EMAILS) for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
      const k = `${viewKey} ${email} ${role}`
      base[k] = await panelProps(NON_OPTED, viewKey, email, role)
      withRange[k] = await panelProps(NON_OPTED, viewKey, email, role, { requestedRange: 'custom:2026-10-01,2026-10-19' })
      if (!viewKey.startsWith('organic-social')) optedOther[k] = await panelProps({ ...NON_OPTED, dashSocialConfig: OPTED.dashSocialConfig }, viewKey, email, role)
    }
    expect(withRange).toEqual(base)
    for (const [k, v] of Object.entries(optedOther)) expect(v).toEqual(base[k])
  })
  test('the team is told when clients will see a withheld entry; a client gets neither the entry nor any note (edge 29, spec 3.9 example)', async () => {
    vi.setSystemTime(new Date('2026-09-15T14:00:00Z'))
    const cross = E('aug-cross', '2026-08-01', '2026-09-05', 'approved', '2026-09-06T10:00:00.000Z')
    ENTRIES.push(cross)
    try {
      const team = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-08-01,2026-08-31')
      expect(team.props!.entryNotes).toEqual({ 'aug-cross': 'Clients see this from Oct 12' })
      const client = await run('CLIENT_VIEWER', 'client@example.com', 'custom:2026-08-01,2026-08-31')
      expect((client.props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['aug'])
      expect(client.props!.entryNotes).toBeUndefined()
    } finally { ENTRIES.pop() }
  })
  test('a failing auth() still throws for an opted-in client, as today', async () => {
    getClientBySlug.mockResolvedValue(OPTED)
    mockAuth.mockRejectedValue(new Error('session down'))
    await expect(CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).rejects.toThrow('session down')
  })
})
```

To `components/report-sections/commentary/commentary-panel.test.tsx`, append:

```tsx
test('the new optional props: empty text, the team note, and the month as a new entry\'s period', () => {
  const empty = render(
    <CommentaryPanel clientSlug="acme" viewKey="organic-social:instagram" entries={[]} initialId={null}
      capabilities={{ canEdit: true, canApprove: false }} history={[]} emptyText="No commentary for September 2026 yet"
      defaultPeriod={{ start: '2026-09-01', end: '2026-09-30' }} />,
  )
  expect(empty.container.textContent).toContain('No commentary for September 2026 yet')
  fireEvent.click(empty.getByText('Add commentary'))
  expect([...empty.container.querySelectorAll('input[type="date"]')].map((i) => (i as HTMLInputElement).value)).toEqual(['2026-09-01', '2026-09-30'])
  empty.unmount()
  const noted = render(
    <CommentaryPanel clientSlug="acme" viewKey="peec-ai" entries={[ENTRY]} initialId={ENTRY.id}
      capabilities={{ canEdit: true, canApprove: false }} history={[]} entryNotes={{ [ENTRY.id]: 'Clients see this from Nov 12' }} />,
  )
  expect(noted.container.textContent).toContain('Clients see this from Nov 12')
})
```

To `components/report-sections/shared/shared-parts-header.test.tsx`, append:

```tsx
test('requestedRange reaches Commentary only when passed', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  const without = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c' })
  expect(findByName(without, 'CommentarySection')?.props).toEqual({ clientSlug: 'c', viewKey: 'organic-social' })
  const withRange = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c', requestedRange: 'custom:2026-09-01,2026-09-30' })
  expect(findByName(withRange, 'CommentarySection')?.props).toEqual({ clientSlug: 'c', viewKey: 'organic-social', requestedRange: 'custom:2026-09-01,2026-09-30' })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run lib/commentary components/report-sections/commentary components/report-sections/shared`
Expected: the new tests FAIL (missing modules and props); Task 0's snapshots and every earlier test PASS.

- [ ] **Step 4: Implement**

`lib/commentary/month.ts`:

```ts
// Commentary follows the month on screen for locked-months clients (locked months spec 3.9).
import { firstOf, lastOf, opensOn, parseReportingMonths, shortDay, type Clock } from '@/lib/organic-social/reporting-months'
import { pickDefaultEntry } from './select'
import type { CommentaryEntry } from './types'

export const isOrganicSocialViewKey = (viewKey: string) => viewKey === 'organic-social' || viewKey.startsWith('organic-social:')

/** The month an entry belongs to: the month containing its periodStart. */
export const monthOfEntry = (e: Pick<CommentaryEntry, 'periodStart'>) => e.periodStart.slice(0, 7)

/** The served month's entries; for a client, only those ending by the newest month they can see. */
export function eligibleEntries(entries: CommentaryEntry[], monthKey: string, clientCutoff: string | null): CommentaryEntry[] {
  return entries.filter((e) => monthOfEntry(e) === monthKey && (clientCutoff === null || e.periodEnd <= clientCutoff))
}

/** A whole-month entry wins; otherwise today's ordering. Call on UN-redacted entries. */
export function pickMonthDefault(entries: CommentaryEntry[], monthKey: string): CommentaryEntry | null {
  const whole = entries.filter((e) => e.periodStart === firstOf(monthKey) && e.periodEnd === lastOf(monthKey))
  return pickDefaultEntry(whole.length ? whole : entries)
}

/** Team-only note: when clients will see an entry the cutoff still withholds, or null. */
export function clientOpensNote(entry: Pick<CommentaryEntry, 'periodEnd'>, cfgValue: unknown, clock: Clock): string | null {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok || parsed.badKey) return null
  const open = opensOn(entry.periodEnd.slice(0, 7), parsed.cfg.opensOnDay, parsed.cfg.weekendRule)
  return clock.today < open ? `Clients see this from ${shortDay(open)}` : null
}
```

`lib/commentary/initial-period.ts`:

```ts
import type { CommentaryEntry } from './types'

/** The period the editor starts from: an edited entry's own, else the month on screen for a new
 *  entry on a locked-months view, else empty (today's behaviour). */
export function initialPeriod(entry?: Pick<CommentaryEntry, 'periodStart' | 'periodEnd'>, defaultPeriod?: { start: string; end: string }) {
  return { start: entry?.periodStart ?? defaultPeriod?.start ?? '', end: entry?.periodEnd ?? defaultPeriod?.end ?? '' }
}
```

`components/report-sections/commentary/monthly.tsx`:

```tsx
import { getCommentaryForView } from '@/lib/db/queries'
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { historyEntries, toClientSafeEntry, visibleEntries } from '@/lib/commentary/select'
import { clientOpensNote, eligibleEntries, pickMonthDefault } from '@/lib/commentary/month'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { firstOf, lastOf, monthTitle, viewerForRole } from '@/lib/organic-social/reporting-months'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'

type MonthlyClient = { id: string; slug: string; dashSocialConfig?: unknown }

/** Commentary for a locked-months client on an Organic Social view (spec 3.9, 4.7). A client-role
 *  viewer is a client whatever the email: approved entries of the served month only, ending by the
 *  newest month they can see, redacted, no history. Resolves the month with the same inputs and
 *  clock as the section, so both serve the same month. */
export async function monthlyCommentary({ client, role, email, viewKey, requestedRange }: {
  client: MonthlyClient; role: unknown; email: string | null; viewKey: CommentaryViewKey; requestedRange: string | undefined
}) {
  const viewer = viewerForRole(role)
  const capabilities = viewer === 'team'
    ? { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }
    : { canEdit: false, canApprove: false }
  const clock = requestClock()
  const locked = lockedRangeFor(client, role, requestedRange, clock)
  const month = locked?.month ?? null
  if (!month) {
    if (!capabilities.canEdit) return null
    return (
      <CommentaryPanel clientSlug={client.slug} viewKey={viewKey} entries={[]} initialId={null}
        capabilities={capabilities} history={[]} emptyText="No reporting months yet" />
    )
  }
  const all = await getCommentaryForView(client.id, viewKey)
  const visible = visibleEntries(all, capabilities)
  const cutoff = viewer === 'client' ? lastOf(locked!.months[0].key) : null
  const eligible = eligibleEntries(visible, month.key, cutoff)
  // Picked on the un-redacted entries: toClientSafeEntry blanks updatedAt (see select.ts).
  const initial = pickMonthDefault(eligible, month.key)
  if (!capabilities.canEdit && !initial) return null
  const entries = capabilities.canEdit ? eligible : eligible.map(toClientSafeEntry)
  const history = viewer === 'team' ? historyEntries(all, capabilities) : []
  const cfg = (client.dashSocialConfig as { reportingMonths?: unknown } | null | undefined)?.reportingMonths
  const entryNotes = viewer === 'team'
    ? Object.fromEntries(eligible.flatMap((e) => { const n = clientOpensNote(e, cfg, clock); return n ? [[e.id, n]] : [] }))
    : undefined
  return (
    <CommentaryPanel
      key={month.key}
      clientSlug={client.slug}
      viewKey={viewKey}
      entries={entries}
      initialId={initial?.id ?? null}
      capabilities={capabilities}
      history={history}
      defaultPeriod={{ start: firstOf(month.key), end: lastOf(month.key) }}
      emptyText={`No commentary for ${monthTitle(month.key)} yet`}
      entryNotes={entryNotes}
    />
  )
}
```

`components/report-sections/commentary/index.tsx`: add, directly after `import { CommentaryPanel } from './commentary-panel'`:

```tsx
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { isOrganicSocialViewKey } from '@/lib/commentary/month'
import { monthlyCommentary } from './monthly'
```

Change the signature and add the branch directly after `if (!client) return null` (the `Promise.all` line stays exactly as it is):

```tsx
export async function CommentarySection({ clientSlug, viewKey, requestedRange }: { clientSlug: string; viewKey: CommentaryViewKey; requestedRange?: string }) {
  const [session, client] = await Promise.all([auth(), getClientBySlug(clientSlug)])
  if (!client) return null
  // Locked months: Commentary follows the month on screen (spec 3.9). Everyone else runs the code below unchanged.
  if (hasReportingMonths(client) && isOrganicSocialViewKey(viewKey)) {
    return monthlyCommentary({ client, role: session?.user?.role, email: session?.user?.email ?? null, viewKey, requestedRange })
  }
```

`components/report-sections/commentary/commentary-editor.tsx`: add `import { initialPeriod } from '@/lib/commentary/initial-period'` after the `CommentaryViewKey` import; add `defaultPeriod` to the destructure and `defaultPeriod?: { start: string; end: string }` to the props type; replace the two `useState(entry?.period... ?? '')` lines with:

```tsx
  const start = initialPeriod(entry, defaultPeriod)
  const [periodStart, setPeriodStart] = useState(start.start)
  const [periodEnd, setPeriodEnd] = useState(start.end)
```

`components/report-sections/commentary/commentary-panel.tsx`: add to the destructure `defaultPeriod, emptyText, entryNotes,` and to the props type:

```tsx
  defaultPeriod?: { start: string; end: string }
  emptyText?: string
  entryNotes?: Record<string, string>
```

Pass `defaultPeriod={defaultPeriod}` to the `key="new"` `CommentaryEditor`. Change `<p className="text-sm text-text-muted">No commentary yet.</p>` to `<p className="text-sm text-text-muted">{emptyText ?? 'No commentary yet.'}</p>`. Directly after the `Reporting period:` span, add:

```tsx
                {entryNotes?.[selected.id] && (
                  <span className="rounded bg-white/10 px-2 py-0.5 font-semibold text-text-muted">{entryNotes[selected.id]}</span>
                )}
```

`components/report-sections/shared/parts/registry.tsx`: replace the `SharedCtx` type and the `render` line:

```tsx
/** Minimal context every shared part receives. `requestedRange` is set only by Organic Social. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey; requestedRange?: string }
```

```tsx
  render: (ctx) => ctx.requestedRange === undefined
    ? <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />
    : <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} requestedRange={ctx.requestedRange} />,
```

`components/report-sections/shared/shared-parts-header.tsx`: add `requestedRange` to the destructure and `requestedRange?: string` to its type; replace `const ctx: SharedCtx = { slug: clientSlug, viewKey }` with:

```tsx
  const ctx: SharedCtx = requestedRange === undefined ? { slug: clientSlug, viewKey } : { slug: clientSlug, viewKey, requestedRange }
```

`components/report-sections/organic-social/index.tsx` (outer `OrganicSocialReport`): change the header line to

```tsx
      <SharedPartsHeader viewKey={commentaryViewKey} configKey="organic-social" clientSlug={clientSlug} requestedRange={dateRange} />
```

- [ ] **Step 5: Run the whole suite, tsc, the RSC check**

Run: `npx vitest run && npx tsc --noEmit && npm run -s check:rsc`
Expected: all PASS, every Task 0 snapshot unchanged (no written, updated or obsolete snapshot); tsc exit 0; the RSC check passes.

- [ ] **Step 6: Commit** (body: the table above, re-derived with real `file:line`)

```bash
git add lib/commentary components/report-sections/commentary components/report-sections/shared components/report-sections/organic-social/index.tsx
git commit -F- <<'EOF'
feat(organic-social): Commentary follows the locked month

For a locked-months client on an Organic Social view, Commentary shows the
served month's entries. A client (any client role, whatever the email)
gets approved entries ending by the newest month they can see, redacted,
no history. The team gets drafts too, a whole-month default, a prefilled
period, and a note on entries clients cannot see yet. The panel is keyed
by the month. Every other client and view runs today's code; the
pre-change Commentary snapshots are unchanged.

## Edge cases
<the Task 7 table, each row with its real file:line>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Prove it, push it

**Files:** none new.

- [ ] **Step 1: Renaissance drift check, after**

Run: `REPO=$PWD bash ~/.claude/renaissance-baseline/check-drift.sh > /tmp/lm-drift-after.txt 2>&1; echo "exit $?"; tail -3 /tmp/lm-drift-after.txt`
Expected: `exit 0` and the same `RESULT: no drift ...` line as Task 0 Step 1.

- [ ] **Step 2: Snapshot integrity**

Run: `git diff --stat $(git log --format=%H -1 --grep='pre-change snapshots for locked months') HEAD -- '*.snap'`
Expected: empty output (no snapshot file changed after Task 0).

- [ ] **Step 3: Dash check and the green gate**

Run: `grep -rnP '[\x{2014}\x{2013}]' $(git diff --name-only origin/organic-social-october...HEAD) | grep -v '^docs/' ; git diff origin/organic-social-october...HEAD | grep -P '^\+.*[\x{2014}\x{2013}]'`
Expected: no output from the second command (no dash in any added line; existing lines are untouched).

- [ ] **Step 4: Fresh whole-branch review** by a reviewer with no shared context, given the spec, this plan and `git diff origin/organic-social-october...HEAD`, asked to attack: any client path to a hidden month or its Commentary; any change for a non-opted client; the health sweep and cache warmer; logging; conflicts with the open PRs. Fix every real finding test first, then rerun Steps 1 to 3.

- [ ] **Step 5: Zero-conflict proof across the October set**

Run `git merge-tree --write-tree` on all 21 pairs of the seven branches (`feat/os-locked-months` plus PRs 247, 250, 252, 253, 254, 255), expecting 21 clean; then merge all seven into a throwaway worktree off `origin/dev` in two opposite orders (identical trees) and run `npx vitest run`, `npx tsc --noEmit`, `npm run -s check:rsc` there. Remove the worktree after.

- [ ] **Step 6: Push and update PR 256's description from a file, then read it back**

```bash
git push origin feat/os-locked-months
gh pr edit 256 --repo Avenue-Z/avenue-z-reporting-v2 --body-file <file>
gh pr view 256 --repo Avenue-Z/avenue-z-reporting-v2 --json body --jq .body
```

The description (first person, no dashes, no client identifiers) lists every commit, the tests (quoting each test's own result line from the task reports), the drift proof, the snapshot integrity check, the zero-conflict proof, and the staging rollout step (spec 11.1 step 2), which needs my go.
