# Self-service "Add new report" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any internal Avenue Z staff member provision a new client's TripleWhale dashboard from `/tools/reporting` by entering a client name + TripleWhale shop ID — no code change or manual SQL.

**Architecture:** A dedicated `/tools/reporting` Server Component lists client dashboards from the DB and renders an "Add new report" card. The card opens a `createPortal` modal that calls a `createClientReport` server action: it validates the shop against TripleWhale, upserts the client row non-destructively, installs a TripleWhale-only starter dashboard, and redirects to it.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), TypeScript strict, Drizzle/Neon Postgres, TripleWhale SQL client, Tailwind v4.

## Global Constraints

- All TripleWhale/DB calls are **server-side only** (server action / RSC). Never from a client component.
- Dashboard configs must pass `parseDashboardConfig` before being written to the DB.
- After any DB write, call `revalidateTag('db', 'max')` (Next 16 requires the 2nd arg).
- Starter template is **TripleWhale-only** — every data block is `source: 'triplewhale'`.
- Block-kind values are `'kpi' | 'bar' | 'line' | 'table' | 'narrative' | 'header'` (no `'pills'`).
- `MetricFormat` values: `'currency' | 'percent' | 'count' | 'number' | 'multiple'`.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Tests are standalone tsx scripts run with `npx tsx <file>`.

---

### Task 1: `slugify` helper

**Files:**
- Create: `lib/dashboard/slugify.ts`
- Test: `lib/dashboard/slugify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slugify(name: string): string` — lowercases, trims, replaces runs of non-alphanumerics with a single `-`, strips leading/trailing `-`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/slugify.test.ts
// Run: npx tsx lib/dashboard/slugify.test.ts
import { strict as assert } from 'node:assert'
import { slugify } from './slugify'

assert.equal(slugify('Love Bug'), 'love-bug')
assert.equal(slugify('Begin Health'), 'begin-health')
assert.equal(slugify('  Elix  '), 'elix')
assert.equal(slugify('A&W Root Beer!'), 'a-w-root-beer')
assert.equal(slugify('Already-Slugged'), 'already-slugged')
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/slugify.test.ts`
Expected: FAIL — `Cannot find module './slugify'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/slugify.ts
/** Turn a display name into a URL-safe slug: "Love Bug" → "love-bug". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/slugify.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/slugify.ts lib/dashboard/slugify.test.ts
git commit -m "feat(dashboard): add slugify helper for client slugs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: TripleWhale starter template builder

**Files:**
- Create: `lib/dashboard/starter-template.ts`
- Test: `lib/dashboard/starter-template.test.ts`

**Interfaces:**
- Consumes: types from `@/lib/dashboard/types` (`DashboardConfig`, `PersistedBlock`, `MetricFormat`); `parseDashboardConfig` from `@/lib/dashboard/persistence` (test only).
- Produces: `buildStarterTemplate(): DashboardConfig` — a client-agnostic TripleWhale-only dashboard. The TW adapter resolves the shop ID per request from the client row, so no shop ID is embedded.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/starter-template.test.ts
// Run: npx tsx lib/dashboard/starter-template.test.ts
import { strict as assert } from 'node:assert'
import { buildStarterTemplate } from './starter-template'
import { parseDashboardConfig } from './persistence'

const cfg = buildStarterTemplate()

// Valid per the persistence parser (guards against drift).
const parsed = parseDashboardConfig(cfg)
assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)

// Every NON-static (header) block is a TripleWhale data block.
const dataBlocks = cfg.blocks.filter((b) => b.kind !== 'header')
assert.ok(dataBlocks.length >= 10, 'expect the full KPI + bar + table set')
for (const b of dataBlocks) {
  assert.equal(b.binding.source, 'triplewhale', `${b.name} must be triplewhale`)
}

// Headers use the static sentinel binding.
const headers = cfg.blocks.filter((b) => b.kind === 'header')
assert.equal(headers.length, 3)
for (const h of headers) {
  assert.equal(h.binding.source, 'supermetrics')
  if (h.binding.source === 'supermetrics') assert.equal(h.binding.dsId, '__static__')
}

// Bar + table carry a channel dimension.
const bar = cfg.blocks.find((b) => b.kind === 'bar')!
const table = cfg.blocks.find((b) => b.kind === 'table')!
assert.deepEqual((bar.binding as { dimensions?: string[] }).dimensions, ['channel'])
assert.deepEqual((table.binding as { dimensions?: string[] }).dimensions, ['channel'])

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/starter-template.test.ts`
Expected: FAIL — `Cannot find module './starter-template'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/starter-template.ts
import type { DashboardConfig, PersistedBlock } from './types'

// Static header sentinel binding (matches scripts/seed-kind-patches-dashboard.ts):
// header/narrative blocks carry a binding that must never reach a real resolver.
const STATIC = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } as const

/**
 * Client-agnostic TripleWhale-only starter dashboard. The TripleWhale adapter
 * resolves the shop ID per request from the client's `triplewhaleShopId`, so the
 * same template renders for every client. Metrics are the ones verified to return
 * real data in the TW audit (ad_spend, blended_roas, revenue, purchases, cpa,
 * conv_rate, sessions, clicks).
 */
export function buildStarterTemplate(): DashboardConfig {
  const blocks: PersistedBlock[] = [
    { id: 'st-h-overview', name: 'Paid Media Overview', kind: 'header', headerLevel: 1, format: 'number', range: null, layout: { x: 0, y: 0, w: 12, h: 1 }, binding: { ...STATIC } },

    { id: 'st-spend',    name: 'Total Ad Spend',   kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'ad_spend' } },
    { id: 'st-roas',     name: 'Blended ROAS',     kind: 'kpi', format: 'multiple', range: null, layout: { x: 3, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'blended_roas' } },
    { id: 'st-revenue',  name: 'Revenue',          kind: 'kpi', format: 'currency', range: null, layout: { x: 6, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'revenue' } },
    { id: 'st-purch',    name: 'Purchases',        kind: 'kpi', format: 'count',    range: null, layout: { x: 9, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'purchases' } },
    { id: 'st-cpa',      name: 'CPA',              kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'cpa' } },
    { id: 'st-convrate', name: 'Conversion Rate',  kind: 'kpi', format: 'percent',  range: null, layout: { x: 3, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'conv_rate' } },
    { id: 'st-sessions', name: 'Sessions',         kind: 'kpi', format: 'count',    range: null, layout: { x: 6, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'sessions' } },
    { id: 'st-clicks',   name: 'Clicks',           kind: 'kpi', format: 'count',    range: null, layout: { x: 9, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'clicks' } },

    { id: 'st-h-channel', name: 'Spend by Channel', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 5, w: 12, h: 1 }, binding: { ...STATIC } },
    { id: 'st-spend-by-channel', name: 'Spend by Channel', kind: 'bar', format: 'currency', range: null, layout: { x: 0, y: 6, w: 6, h: 4 }, binding: { source: 'triplewhale', metric: 'ad_spend', dimensions: ['channel'] } },

    { id: 'st-h-perf', name: 'Channel Performance', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 10, w: 12, h: 1 }, binding: { ...STATIC } },
    { id: 'st-channel-roas', name: 'Channel ROAS', kind: 'table', format: 'multiple', range: null, layout: { x: 0, y: 11, w: 6, h: 5 }, binding: { source: 'triplewhale', metric: 'blended_roas', dimensions: ['channel'] } },
  ]
  return { defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' }, blocks }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/starter-template.test.ts`
Expected: `ok`

If the parser rejects a TW binding shape, open `lib/dashboard/persistence.ts` `parseBinding` and match the exact `triplewhale` binding fields it expects (metric/filters/dimensions), then re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/starter-template.ts lib/dashboard/starter-template.test.ts
git commit -m "feat(dashboard): TripleWhale-only starter dashboard template

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `isInternalStaff` permission helper

**Files:**
- Modify: `lib/dashboard/permissions.ts`
- Test: `lib/dashboard/permissions.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces: `isInternalStaff(role: string): boolean` — true for `INTERNAL_ADMIN` / `INTERNAL_ANALYST`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/permissions.test.ts
// Run: npx tsx lib/dashboard/permissions.test.ts
import { strict as assert } from 'node:assert'
import { isInternalStaff } from './permissions'

assert.equal(isInternalStaff('INTERNAL_ADMIN'), true)
assert.equal(isInternalStaff('INTERNAL_ANALYST'), true)
assert.equal(isInternalStaff('CLIENT_ADMIN'), false)
assert.equal(isInternalStaff('CLIENT_VIEWER'), false)
assert.equal(isInternalStaff(''), false)
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/permissions.test.ts`
Expected: FAIL — `isInternalStaff is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/dashboard/permissions.ts` (the `INTERNAL_ROLES` set already exists near the top):

```ts
/** True for internal Avenue Z staff (INTERNAL_ADMIN / INTERNAL_ANALYST). */
export function isInternalStaff(role: string): boolean {
  return INTERNAL_ROLES.has(role)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/permissions.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/permissions.ts lib/dashboard/permissions.test.ts
git commit -m "feat(dashboard): export isInternalStaff role helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `getClientsWithDashboards` query

**Files:**
- Modify: `lib/db/queries.ts`

**Interfaces:**
- Consumes: `db`, `clients`, `cache`, `cached` (all already imported in the file).
- Produces: `getClientsWithDashboards(): Promise<{ slug: string; name: string; logoUrl: string | null }[]>` — clients with a non-null `dashboardConfig`, sorted by name. Does NOT exclude `HIDDEN_CLIENT_SLUGS` (kind-patches is intentionally surfaced via Tools → Reporting).

- [ ] **Step 1: Add the helper**

Append near `getAllClients` in `lib/db/queries.ts`:

```ts
/**
 * Clients that have a configurable dashboard, for the Tools → Reporting hub.
 * Unlike getVisibleClients this does NOT drop HIDDEN_CLIENT_SLUGS — dashboard-only
 * hosts (kind-patches) are exactly what Reporting surfaces. Persistently cached
 * (5-min TTL), db-tagged so a new report busts it via revalidateTag('db').
 */
const getClientsWithDashboardsImpl = async (): Promise<{ slug: string; name: string; logoUrl: string | null }[]> => {
  const rows = await db
    .select({ slug: clients.slug, name: clients.name, logoUrl: clients.logoUrl, dashboardConfig: clients.dashboardConfig })
    .from(clients)
  return rows
    .filter((r) => r.dashboardConfig != null)
    .map(({ slug, name, logoUrl }) => ({ slug, name, logoUrl }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const getClientsWithDashboards = cache(
  cached('db', 'getClientsWithDashboards', getClientsWithDashboardsImpl, { ttlSeconds: 300, tags: ['db'] }),
)
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat(db): getClientsWithDashboards for the reporting hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `createClientReport` server action

**Files:**
- Create: `app/actions/reports.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth`; `isInternalStaff` (Task 3); `isValidShop` from `@/lib/shopify/oauth`; `buildMetricSql` from `@/lib/triplewhale/queries`; `twSql` from `@/lib/triplewhale/client`; `parseDateRange` from `@/lib/ga4/client`; `slugify` (Task 1); `buildStarterTemplate` (Task 2); `getClientBySlug` from `@/lib/db/queries`; `parseDashboardConfig` from `@/lib/dashboard/persistence`; `db`, `clients`, `eq`.
- Produces: `createClientReport(input: { name: string; triplewhaleShopId: string }): Promise<CreateReportResult>` where
  ```ts
  type CreateReportResult =
    | { ok: true; url: string }
    | { ok: false; error: string }
    | { ok: false; code: 'exists'; url: string }
  ```

- [ ] **Step 1: Write the action**

```ts
// app/actions/reports.ts
'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { isValidShop } from '@/lib/shopify/oauth'
import { buildMetricSql } from '@/lib/triplewhale/queries'
import { twSql } from '@/lib/triplewhale/client'
import { parseDateRange } from '@/lib/ga4/client'
import { slugify } from '@/lib/dashboard/slugify'
import { buildStarterTemplate } from '@/lib/dashboard/starter-template'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'

export type CreateReportResult =
  | { ok: true; url: string }
  | { ok: false; error: string }
  | { ok: false; code: 'exists'; url: string }

function dashUrl(slug: string): string {
  return `/dashboard/${slug}/configurable-dashboard`
}

/**
 * Self-service provisioning: validate a TripleWhale shop, upsert the client row
 * (never clobbering an existing dashboard), install the TW starter template, and
 * return the new dashboard URL. Internal staff only.
 */
export async function createClientReport(input: {
  name: string
  triplewhaleShopId: string
}): Promise<CreateReportResult> {
  // 1. Auth — internal staff only.
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!isInternalStaff(session.user.role)) return { ok: false, error: 'forbidden' }

  // 2. Validate input.
  const name = input.name.trim()
  const shopId = input.triplewhaleShopId.trim().toLowerCase()
  if (!name) return { ok: false, error: 'Enter a client name.' }
  if (!isValidShop(shopId)) {
    return { ok: false, error: 'Shop ID must look like your-store.myshopify.com.' }
  }

  // 3. TripleWhale probe — confirm the shop is reachable under our TW account.
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  if (!apiKey) return { ok: false, error: 'TripleWhale is not configured on the server.' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    await twSql({ apiKey, shopId, query: buildMetricSql('ad_spend'), startDate, endDate })
  } catch {
    return { ok: false, error: 'No TripleWhale data for that shop ID. Check the shop and try again.' }
  }

  // 4. Resolve slug + 5. upsert guardrail.
  const slug = slugify(name)
  if (!slug) return { ok: false, error: 'Enter a client name with letters or numbers.' }

  const existing = await getClientBySlug(slug)
  if (existing?.dashboardConfig) {
    return { ok: false, code: 'exists', url: dashUrl(slug) }
  }

  // 6. Build + validate template, then write.
  const parsed = parseDashboardConfig(buildStarterTemplate())
  if (!parsed.ok) return { ok: false, error: `Template invalid: ${parsed.error}` }

  if (existing) {
    await db
      .update(clients)
      .set({ triplewhaleShopId: shopId, dashboardConfig: parsed.config, updatedAt: new Date() })
      .where(eq(clients.slug, slug))
  } else {
    await db.insert(clients).values({
      slug,
      name,
      triplewhaleShopId: shopId,
      dashboardConfig: parsed.config,
      enabledReports: [],
    })
  }

  revalidateTag('db', 'max')
  return { ok: true, url: dashUrl(slug) }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `db.insert(...).values({...})` complains about a required column, it is a NOT-NULL column without a schema default — add it with a sensible default (`hiddenReports: []`, `maxSeats: 5`). `enabledReports` is required and intentionally set to `[]` above.

- [ ] **Step 3: RSC boundary gate**

Run: `npm run check:rsc`
Expected: `RSC boundary check passed`.

- [ ] **Step 4: Commit**

```bash
git add app/actions/reports.ts
git commit -m "feat(dashboard): createClientReport server action (validate + upsert + provision)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Add-report modal + card components

**Files:**
- Create: `components/dashboard/add-report/add-report-dialog.tsx`
- Create: `components/dashboard/add-report/add-report-card.tsx`

**Interfaces:**
- Consumes: `createClientReport`, `CreateReportResult` (Task 5).
- Produces: `<AddReportCard />` (client) — a card that opens the dialog. `<AddReportDialog onClose />` (client) — the modal form.

- [ ] **Step 1: Write the dialog**

```tsx
// components/dashboard/add-report/add-report-dialog.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClientReport } from '@/app/actions/reports'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-sm font-bold text-white'

export function AddReportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [shopId, setShopId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existsUrl, setExistsUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setError(null)
    setExistsUrl(null)
    startTransition(async () => {
      const res = await createClientReport({ name, triplewhaleShopId: shopId })
      if (res.ok) { router.push(res.url); return }
      if ('code' in res && res.code === 'exists') { setExistsUrl(res.url); return }
      setError(res.error)
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 flex w-full max-w-md flex-col gap-5 rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Add new report</h2>
            <p className="mt-0.5 text-sm text-text-muted">Provision a TripleWhale dashboard for a client.</p>
          </div>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Client name</span>
          <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Love Bug" />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>TripleWhale shop ID</span>
          <input className={ctrl} value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="your-store.myshopify.com" />
          <span className="text-[11px] text-text-muted">The shop&apos;s *.myshopify.com domain.</span>
        </label>

        {error && <p className="text-xs text-[#FF6666]">{error}</p>}
        {existsUrl && (
          <p className="text-xs text-text-muted">
            This client already has a report.{' '}
            <Link href={existsUrl} className="font-bold text-brand-cyan underline">Open it instead</Link>.
          </p>
        )}

        <button
          className="self-end rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={submit}
          disabled={pending || !name.trim() || !shopId.trim()}
        >
          {pending ? 'Creating…' : 'Generate report'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Write the card**

```tsx
// components/dashboard/add-report/add-report-card.tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddReportDialog } from './add-report-dialog'

export function AddReportCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex min-h-[84px] items-center gap-4 rounded-lg border border-dashed border-white/[0.14] bg-transparent p-5 text-left transition-all hover:border-white/30 hover:bg-white/[0.02]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white">
          <Plus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Add new report</p>
          <p className="mt-0.5 text-xs text-text-muted">Provision a client dashboard</p>
        </div>
      </button>
      {open && <AddReportDialog onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 3: Type-check + RSC gate**

Run: `npx tsc --noEmit && npm run check:rsc`
Expected: no errors; RSC boundary check passed.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/add-report/
git commit -m "feat(dashboard): add-report modal + card components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Dynamic reporting hub page

**Files:**
- Create: `app/tools/reporting/page.tsx`

**Interfaces:**
- Consumes: `getClientsWithDashboards` (Task 4); `isInternalStaff` (Task 3); `auth`; `<AddReportCard />` (Task 6).
- Produces: the `/tools/reporting` route. A static `reporting` segment takes precedence over the sibling dynamic `app/tools/[teamSlug]/page.tsx`, so this overrides the generic team page for Reporting only.

- [ ] **Step 1: Write the page**

```tsx
// app/tools/reporting/page.tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { auth } from '@/auth'
import { getClientsWithDashboards } from '@/lib/db/queries'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { AddReportCard } from '@/components/dashboard/add-report/add-report-card'

const cardCls =
  'group relative flex min-h-[84px] items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]'

export default async function ReportingHubPage() {
  const [session, dashboards] = await Promise.all([auth(), getClientsWithDashboards()])
  const canAdd = isInternalStaff(session?.user?.role ?? '')

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reporting</h1>
        <p className="mt-1 text-sm text-text-muted">Client dashboards. {canAdd ? 'Add a new one any time.' : ''}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <Link key={d.slug} href={`/dashboard/${d.slug}/configurable-dashboard`} className={cardCls}>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-extrabold text-black"
              style={{ backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF, #39A0FF, #6034FF)' }}
            >
              {d.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{d.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">Configurable dashboard</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
        {canAdd && <AddReportCard />}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check + RSC gate**

Run: `npx tsc --noEmit && npm run check:rsc`
Expected: no errors; RSC boundary check passed.

- [ ] **Step 3: Verify routing precedence + render locally**

Start the dev server (`npm run dev -- -p 3010` if not already running) and load `http://localhost:3010/tools/reporting` while signed in as internal staff.
Expected: the static `reporting` page renders (a card for each client with a dashboard — including Kind Patches — plus the dashed "Add new report" card). Confirm it is THIS page, not the generic `[teamSlug]` page (no "Tools available to the Reporting team" subtitle).

- [ ] **Step 4: Commit**

```bash
git add app/tools/reporting/page.tsx
git commit -m "feat(tools): dynamic reporting hub listing client dashboards + add-report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end verification + cleanup

**Files:**
- Modify (optional): `lib/constants.ts` — the static Kind Patches tool entry under the `reporting` team's `tools` is now redundant (the hub lists it from the DB). Remove that single tool object so the team-list tool count isn't misleading. Leave the `reporting` team entry itself (the `/tools` card links to `/tools/reporting`).

- [ ] **Step 1: Remove the redundant static tool (optional cleanup)**

In `lib/constants.ts`, in the `reporting` team, set `tools: []` (keep the team). The `/tools` page shows "0 tools" text for it — if that reads poorly, also adjust the count copy on `app/tools/page.tsx` to omit the count for reporting, or leave as-is. Smallest change: `tools: []`.

- [ ] **Step 2: Full type-check + RSC gate + unit tests**

```bash
npx tsc --noEmit
npm run check:rsc
npx tsx lib/dashboard/slugify.test.ts
npx tsx lib/dashboard/starter-template.test.ts
npx tsx lib/dashboard/permissions.test.ts
```
Expected: tsc clean; RSC passed; each test prints `ok`.

- [ ] **Step 3: Manual smoke (live credentials)**

With the dev server running and signed in as internal staff, at `/tools/reporting`:
1. Click **Add new report** → enter `Lovebug` + Lovebug's `*.myshopify.com` shop ID → Generate. Expect redirect to `/dashboard/lovebug/configurable-dashboard` rendering real TripleWhale KPIs + spend-by-channel + channel ROAS.
2. Enter an obviously-bad shop ID (`nope.myshopify.com`) → expect the inline "No TripleWhale data…" error and no new client.
3. Add **Begin Health** with its shop ID → expect it fills the existing row (no duplicate) and provisions the dashboard.
4. Re-submit **Begin Health** → expect the "already has a report — Open it instead" link (no overwrite).
5. Reload `/tools/reporting` → the new dashboards appear as cards.

- [ ] **Step 4: Commit (if cleanup made)**

```bash
git add lib/constants.ts
git commit -m "chore(tools): drop redundant static Kind Patches reporting tool entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/self-service-add-report
```
Open a PR targeting `dev` summarizing the feature; note it requires no DB migration (uses existing columns) and that provisioning writes to the live DB the deploy reads.

---

## Notes for the implementer

- **No DB migration** — this uses existing `clients` columns (`triplewhaleShopId`, `dashboardConfig`, `enabledReports`). Nothing in `drizzle/`.
- **The shop ID is not embedded in the template** — the TW adapter reads `triplewhaleShopId` off the client row per request. That is why one template serves all clients.
- **The probe validates reachability, not non-zero data** — a valid shop with zero recent spend still passes (the call returns without throwing); only an unreachable/invalid shop throws and is rejected.
- **Provisioning writes to whatever DB the runtime points at.** On the deployed app that is the live DB. There is no separate dev DB wired for local runs unless `.env.local` points to one.
