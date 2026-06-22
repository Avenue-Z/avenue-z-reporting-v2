# Renaissance LinkedIn Advertising (Module 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Renaissance LinkedIn Advertising report — KPI Scorecards, Creative Performance, Geographic — as a real, config-driven, data-backed module mirroring the Meta module.

**Architecture:** Direct port of `lib/meta/` + `components/report-sections/meta-ads/`. Route → RSC orchestrator (`safe()` per-section isolation) → `lib/linkedin/` (pure tested transforms + thin `smQuery` fetchers) → presentational components. Each of the three sections is a single Supermetrics query against `DS_IDS.LINKEDIN` (`'LIA'`), account `503368877`; report type auto-resolves (no `report_type` passed — `LIA` has `has_report_type_selection: false`, and report type `1` covers every field used).

**Tech Stack:** TypeScript (strict), Next.js RSC, Drizzle/Neon, the shared `smQuery` client, `tsx` + `node:assert` tests.

**Spec:** `docs/superpowers/specs/2026-06-22-renaissance-linkedin-ads-design.md`

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- **Surgical:** mirror the Meta module's structure and style exactly; do not refactor adjacent code. Stage **only each task's listed files** when committing; never stage unrelated working-tree edits.
- **Tests are pure** (no live API/DB calls) but the import chain (`./base` → `@/lib/db/queries` → `@/lib/db/client`) requires env to load, so run with: `npx tsx --env-file=.env.local lib/linkedin/<file>.test.ts`. Each test ends with `console.log('ok')`.
- Field ids are exact (case-sensitive) Supermetrics LinkedIn ids: `spend, impressions, approximateUniqueImpressions, clicks, ctr, cpc, cpm, landingPageClicks, oneClickLeads, oneClickLeadsCost, oneClickLeadFormOpens, leadFormCompletionRate` (metrics); `creativeDscName, campaignName, campaignGroupName, creativeStatus, memberRegion` (dimensions). List dimensions before metrics in `fields`.
- Account `503368877`, shared key via `client.smApiKeyEnvVar` → `SUPERMETRICS_API_KEY`.
- **Derived metrics** (no native LinkedIn field): `Frequency = impressions / reach`, `Cost per Visit = spend / landingPageClicks`. Compute in the transform with divide-by-zero guards; carry the documenting code comment.
- Commit per task with the message shown.

---

## Inter-Component Dependency Map

```
  T1 schema+migration        T6 constants rename
  clients.linkedinConfig     REPORT_NAMES['linkedin-ads']
  (+ 0009 migration)         = 'LinkedIn Advertising'
        │                        (independent)
        ▼
  T2 base + types  ── linkedinQuery, resolveCompareIso,
        │             LinkedInCreativeRow, LinkedInGeoRow
        │  (base.ts reads client.linkedinConfig → needs T1's type)
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
  T3 kpis        T4 creative     T5 geo
  transform+     transform+      transform+
  fetcher+test   fetcher+test+   fetcher+test+
                 creative-table  geo-section
        └──────────────┴──────────────┘
                       ▼
        T7 index.tsx orchestrator + 3 route dispatch edits
           (needs getLinkedInKpis, getCreativeRows, getLinkedInGeoRows,
            LinkedInCreativeTable, LinkedInGeoSection)
```

**Edges = imports/consumes.** All tasks touch **disjoint files** — safe for a parallel agent fleet within a wave (no merge conflicts).

### Parallelization waves

| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1 schema+migration**, **T6 constants rename** | nothing — 2 disjoint, independent |
| 1 | **T2 base + types** | T1 (consumes `Client.linkedinConfig` type) |
| 2 | **T3 kpis**, **T4 creative+table**, **T5 geo+section** | T2 (all consume `linkedinQuery`/row types); independent of each other → **3-way fan-out** |
| 3 | **T7 orchestrator + dispatch wiring** | T3 + T4 + T5 |

Controller commits sequentially per task and reviews each (same model as the TripleWhale plan).

---

## File Structure

```
lib/linkedin/
  base.ts            # NEW: linkedinQuery(), resolveCompareIso()           (T2)
  types.ts           # NEW: LinkedInCreativeRow, LinkedInGeoRow            (T2)
  kpis.ts            # NEW: transformLinkedInKpis(), getLinkedInKpis()     (T3)
  kpis.test.ts       # NEW                                                 (T3)
  creative.ts        # NEW: transformCreative(), getCreativeRows()         (T4)
  creative.test.ts   # NEW                                                 (T4)
  geo.ts             # NEW: transformLinkedInGeo(), getLinkedInGeoRows()   (T5)
  geo.test.ts        # NEW                                                 (T5)
components/report-sections/linkedin-ads/
  creative-table.tsx # NEW: LinkedInCreativeTable                          (T4)
  geo-section.tsx    # NEW: LinkedInGeoSection                             (T5)
  index.tsx          # REWRITE: LinkedInAdsReport orchestrator             (T7)
lib/db/schema.ts     # MODIFY: + LinkedInConfig + linkedinConfig column    (T1)
drizzle/0009_*.sql   # generated (committed; applied to dev branch by controller) (T1)
lib/constants.ts     # MODIFY: REPORT_NAMES['linkedin-ads']               (T6)
app/portal/[clientSlug]/reports/page.tsx                  # MODIFY dispatch (T7)
app/portal/[clientSlug]/reports/[reportSlug]/page.tsx     # MODIFY dispatch (T7)
app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx  # MODIFY dispatch (T7)
```

---

## Task 1: Schema column + migration (`lib/db/schema.ts`)

**Files:** Modify `lib/db/schema.ts`; create (generated) `drizzle/0009_*.sql` + meta snapshot.

**Interfaces:** Produces `LinkedInConfig { linkedinAdAccountId: string }` and `clients.linkedinConfig` → `Client.linkedinConfig: LinkedInConfig | null`, consumed by Task 2.

- [ ] **Step 1: Add the interface** — in `lib/db/schema.ts`, immediately after the `MetaConfig` interface (ends at the line with `}` after `metaAdAccountId`):

```ts
export interface LinkedInConfig {
  /** LinkedIn ad account id, digits only, e.g. '503368877'. */
  linkedinAdAccountId: string
}
```

- [ ] **Step 2: Add the column** — in the `clients` pgTable, immediately after the `metaConfig: jsonb('meta_config').$type<MetaConfig>(),` line:

```ts
  linkedinConfig: jsonb('linkedin_config').$type<LinkedInConfig>(),
```

- [ ] **Step 3: Generate the migration (offline)**

Run: `npm run db:generate`
Expected: new `drizzle/0009_*.sql` containing `ALTER TABLE "clients" ADD COLUMN "linkedin_config" jsonb;` + meta snapshot update.

- [ ] **Step 4: Verify**

Run:
```bash
grep -r "linkedin_config" drizzle/*.sql && echo "migration present"
npx tsc --noEmit 2>&1 | grep "lib/db/schema" || echo "schema ok"
```
Expected: the `ADD COLUMN` line, `migration present`, `schema ok`. **Do NOT run `db:migrate`** (controller applies it to the dev branch).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add nullable linkedin_config column to clients"
```

---

## Task 6: Report display name (`lib/constants.ts`)

(Wave 0; numbered 6 to keep T2–T5 in build order.)

**Files:** Modify `lib/constants.ts`.

**Interfaces:** none consumed; cosmetic rename of `REPORT_NAMES['linkedin-ads']`.

- [ ] **Step 1: Rename** — in `lib/constants.ts`, change the line:

```ts
  'linkedin-ads': 'LinkedIn Ads',
```
to:
```ts
  'linkedin-ads': 'LinkedIn Advertising',
```

- [ ] **Step 2: Verify**

Run: `grep -n "LinkedIn Advertising" lib/constants.ts && echo "renamed"`
Expected: the line + `renamed`.

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "feat(linkedin): rename report to 'LinkedIn Advertising'"
```

---

## Task 2: Data-layer base + types (`lib/linkedin/base.ts`, `lib/linkedin/types.ts`)

**Files:** Create `lib/linkedin/base.ts`, `lib/linkedin/types.ts`.

**Interfaces:**
- Consumes: `Client.linkedinConfig` (Task 1); `smQuery`, `parseSmRows`, `DS_IDS` (`@/lib/supermetrics/client`); `parseDateRange`, `deriveCompareRange` (`@/lib/ga4/client`); `getClientBySlug` (`@/lib/db/queries`).
- Produces: `linkedinQuery(slug, fields, dateRange, opts?): Promise<Record<string,string>[]>`; `resolveCompareIso(dateRange, compareRange): string | null`; types `LinkedInCreativeRow`, `LinkedInGeoRow` (consumed by Tasks 4, 5).

- [ ] **Step 1: Create `lib/linkedin/types.ts`**

```ts
export interface LinkedInCreativeRow {
  ad: string
  audience: string
  campaign: string
  status: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  costPerLead: number
  leadFormOpens: number
  leadFormCompletionRate: number
  landingPageClicks: number
  shareOfSpend: number
}

export interface LinkedInGeoRow {
  region: string
  spend: number
  impressions: number
  clicks: number
  leads: number
}
```

- [ ] **Step 2: Create `lib/linkedin/base.ts`** (port of `lib/meta/base.ts`)

```ts
import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'

export async function linkedinQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.linkedinConfig?.linkedinAdAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`linkedin_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.LINKEDIN,
    dsAccounts: accountId,
    fields,
    dateRange: `${startDate},${endDate}`,
    filters: opts.filters,
    settings: opts.settings,
    maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "lib/linkedin" || echo "linkedin base ok"`
Expected: `linkedin base ok` (confirms `DS_IDS.LINKEDIN` and `client.linkedinConfig` resolve).

- [ ] **Step 4: Commit**

```bash
git add lib/linkedin/base.ts lib/linkedin/types.ts
git commit -m "feat(linkedin): data-layer base (linkedinQuery) + row types"
```

---

## Task 3: KPI scorecards (`lib/linkedin/kpis.ts`)

**Files:** Create `lib/linkedin/kpis.ts`, `lib/linkedin/kpis.test.ts`.

**Interfaces:**
- Consumes: `linkedinQuery`, `resolveCompareIso` (Task 2); `Kpi` (`@/lib/paid-search/types`).
- Produces: `transformLinkedInKpis(totals, compare): Kpi[]`; `getLinkedInKpis(slug, dateRange, compareRange): Promise<Kpi[]>` (consumed by Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// lib/linkedin/kpis.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/kpis.test.ts
import { strict as assert } from 'node:assert'
import { transformLinkedInKpis } from './kpis'

const totals = {
  spend: '12000',
  impressions: '480000',
  approximateUniqueImpressions: '300000',
  clicks: '6000',
  ctr: '1.25',
  cpm: '25',
  cpc: '2',
  landingPageClicks: '4000',
  oneClickLeads: '150',
  oneClickLeadsCost: '80',
  oneClickLeadFormOpens: '500',
  leadFormCompletionRate: '30',
}

const k = transformLinkedInKpis(totals, null)
assert.equal(k.length, 14)
assert.equal(k.find((c) => c.key === 'spend')!.value, 12000)
assert.equal(k.find((c) => c.key === 'reach')!.value, 300000)
// derived Frequency = 480000 / 300000 = 1.6
assert.equal(k.find((c) => c.key === 'frequency')!.value, 1.6)
// derived Cost per Visit = 12000 / 4000 = 3.00
assert.equal(k.find((c) => c.key === 'costPerVisit')!.value, 3)
assert.equal(k.find((c) => c.key === 'leads')!.value, 150)

// delta vs a prior period (spend 10000 → +20%)
const k2 = transformLinkedInKpis(totals, { ...totals, spend: '10000' })
assert.equal(k2.find((c) => c.key === 'spend')!.delta, 20)
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --env-file=.env.local lib/linkedin/kpis.test.ts`
Expected: FAIL with `Cannot find module './kpis'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/linkedin/kpis.ts
import { linkedinQuery, resolveCompareIso } from './base'
import type { Kpi } from '@/lib/paid-search/types'

function n(row: Record<string, string>, id: string): number {
  return Number(row[id] || 0)
}

function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

// Frequency and Cost per Visit have NO native LinkedIn field — derived here.
const frequency = (t: Record<string, string>) =>
  n(t, 'approximateUniqueImpressions') ? n(t, 'impressions') / n(t, 'approximateUniqueImpressions') : 0
const costPerVisit = (t: Record<string, string>) =>
  n(t, 'landingPageClicks') ? n(t, 'spend') / n(t, 'landingPageClicks') : 0

export function transformLinkedInKpis(
  totals: Record<string, string>,
  compare: Record<string, string> | null,
): Kpi[] {
  const d = (id: string) => delta(n(totals, id), compare ? n(compare, id) : undefined)

  return [
    { key: 'spend', label: 'Spend', value: Math.round(n(totals, 'spend')), prefix: '$', delta: d('spend') },
    { key: 'impressions', label: 'Impressions', value: n(totals, 'impressions'), delta: d('impressions') },
    { key: 'reach', label: 'Reach', value: n(totals, 'approximateUniqueImpressions'), delta: d('approximateUniqueImpressions') },
    { key: 'clicks', label: 'Clicks', value: n(totals, 'clicks'), delta: d('clicks') },
    { key: 'ctr', label: 'CTR', value: +n(totals, 'ctr').toFixed(2), suffix: '%', delta: d('ctr') },
    { key: 'cpm', label: 'CPM', value: +n(totals, 'cpm').toFixed(2), prefix: '$', delta: d('cpm') },
    { key: 'cpc', label: 'CPC', value: +n(totals, 'cpc').toFixed(2), prefix: '$', delta: d('cpc') },
    {
      key: 'frequency',
      label: 'Frequency',
      value: +frequency(totals).toFixed(1),
      suffix: 'x',
      delta: delta(frequency(totals), compare ? frequency(compare) : undefined),
    },
    { key: 'landingPageClicks', label: 'Landing Page Clicks', value: n(totals, 'landingPageClicks'), delta: d('landingPageClicks') },
    {
      key: 'costPerVisit',
      label: 'Cost / Visit',
      value: +costPerVisit(totals).toFixed(2),
      prefix: '$',
      delta: delta(costPerVisit(totals), compare ? costPerVisit(compare) : undefined),
    },
    { key: 'leads', label: 'Leads', value: n(totals, 'oneClickLeads'), delta: d('oneClickLeads') },
    { key: 'costPerLead', label: 'Cost / Lead', value: +n(totals, 'oneClickLeadsCost').toFixed(2), prefix: '$', delta: d('oneClickLeadsCost') },
    { key: 'leadFormOpens', label: 'Lead Form Opens', value: n(totals, 'oneClickLeadFormOpens'), delta: d('oneClickLeadFormOpens') },
    { key: 'leadFormCompletionRate', label: 'Lead Form Completion Rate', value: +n(totals, 'leadFormCompletionRate').toFixed(1), suffix: '%', delta: d('leadFormCompletionRate') },
  ]
}

export async function getLinkedInKpis(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<Kpi[]> {
  const fields = [
    'spend',
    'impressions',
    'approximateUniqueImpressions',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'landingPageClicks',
    'oneClickLeads',
    'oneClickLeadsCost',
    'oneClickLeadFormOpens',
    'leadFormCompletionRate',
  ]

  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [main, cmp] = await Promise.all([
    linkedinQuery(slug, fields, dateRange).then((r) => r[0] ?? {}),
    compareIso ? linkedinQuery(slug, fields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
  ])

  return transformLinkedInKpis(main, cmp)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --env-file=.env.local lib/linkedin/kpis.test.ts`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/linkedin/kpis.ts lib/linkedin/kpis.test.ts
git commit -m "feat(linkedin): KPI scorecards (14, incl. derived Frequency + Cost/Visit)"
```

---

## Task 4: Creative Performance table (`lib/linkedin/creative.ts` + component)

**Files:** Create `lib/linkedin/creative.ts`, `lib/linkedin/creative.test.ts`, `components/report-sections/linkedin-ads/creative-table.tsx`.

**Interfaces:**
- Consumes: `linkedinQuery` (Task 2); `LinkedInCreativeRow` (Task 2); `DataTable` (`@/components/charts/data-table`); `usd`, `num`, `pct` (`@/lib/supermetrics/format`).
- Produces: `transformCreative(rows): LinkedInCreativeRow[]`; `getCreativeRows(slug, dateRange): Promise<LinkedInCreativeRow[]>`; `LinkedInCreativeTable` (consumed by Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// lib/linkedin/creative.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/creative.test.ts
import { strict as assert } from 'node:assert'
import { transformCreative } from './creative'

const rows = [
  { creativeDscName: 'Ad A', campaignName: 'Brokers', campaignGroupName: 'AVZ | Traffic | Prospecting', creativeStatus: 'ACTIVE', spend: '300', impressions: '10000', clicks: '120', ctr: '1.2', cpc: '2.5', oneClickLeads: '5', oneClickLeadsCost: '60', oneClickLeadFormOpens: '20', leadFormCompletionRate: '25', landingPageClicks: '80' },
  { creativeDscName: 'Ad B', campaignName: 'HR', campaignGroupName: 'AVZ | Lead Gen', creativeStatus: 'PAUSED', spend: '100', impressions: '4000', clicks: '40', ctr: '1.0', cpc: '2.5', oneClickLeads: '2', oneClickLeadsCost: '50', oneClickLeadFormOpens: '8', leadFormCompletionRate: '25', landingPageClicks: '30' },
]

const out = transformCreative(rows)
// sorted by spend desc
assert.equal(out[0].ad, 'Ad A')
assert.equal(out[0].audience, 'Brokers')          // Audience = campaignName
assert.equal(out[0].campaign, 'AVZ | Traffic | Prospecting') // Campaign = campaignGroupName
assert.equal(out[0].status, 'ACTIVE')
assert.equal(out[0].shareOfSpend, 75)              // 300 / 400 * 100
assert.equal(out[1].shareOfSpend, 25)
// blank ad name falls back
const fb = transformCreative([{ campaignName: 'X', campaignGroupName: 'Y', creativeStatus: 'ACTIVE', spend: '10', creativeId: '999' }])
assert.equal(fb[0].ad, '999')
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --env-file=.env.local lib/linkedin/creative.test.ts`
Expected: FAIL with `Cannot find module './creative'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/linkedin/creative.ts
import { linkedinQuery } from './base'
import type { LinkedInCreativeRow } from './types'

export function transformCreative(rows: Record<string, string>[]): LinkedInCreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'spend'), 0)
  return rows
    .map((r): LinkedInCreativeRow => {
      const spend = num(r, 'spend')
      return {
        ad: r.creativeDscName || r.creativeId || '—',
        audience: r.campaignName ?? '',       // audience segment (Brokers / HR / Broad B2B)
        campaign: r.campaignGroupName ?? '',  // funnel/objective grouping
        status: r.creativeStatus ?? '',
        spend,
        impressions: num(r, 'impressions'),
        clicks: num(r, 'clicks'),
        ctr: +num(r, 'ctr').toFixed(2),
        cpc: +num(r, 'cpc').toFixed(2),
        leads: num(r, 'oneClickLeads'),
        costPerLead: +num(r, 'oneClickLeadsCost').toFixed(2),
        leadFormOpens: num(r, 'oneClickLeadFormOpens'),
        leadFormCompletionRate: +num(r, 'leadFormCompletionRate').toFixed(1),
        landingPageClicks: num(r, 'landingPageClicks'),
        shareOfSpend: total ? +((spend / total) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

export async function getCreativeRows(
  slug: string,
  dateRange: string,
): Promise<LinkedInCreativeRow[]> {
  const rows = await linkedinQuery(slug, [
    'creativeDscName',
    'campaignName',
    'campaignGroupName',
    'creativeStatus',
    'spend',
    'impressions',
    'clicks',
    'ctr',
    'cpc',
    'oneClickLeads',
    'oneClickLeadsCost',
    'oneClickLeadFormOpens',
    'leadFormCompletionRate',
    'landingPageClicks',
  ], dateRange, { maxRows: 200 })
  return transformCreative(rows)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --env-file=.env.local lib/linkedin/creative.test.ts`
Expected: `ok`.

- [ ] **Step 5: Write the component** (mirror `meta-ads/creative-table.tsx`)

```tsx
// components/report-sections/linkedin-ads/creative-table.tsx
import { DataTable } from '@/components/charts/data-table'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { LinkedInCreativeRow } from '@/lib/linkedin/types'

const columns = [
  { key: 'ad', label: 'Ad Name', align: 'left' as const, sortable: true },
  { key: 'audience', label: 'Audience', align: 'left' as const, sortable: true },
  { key: 'campaign', label: 'Campaign', align: 'left' as const, sortable: true },
  { key: 'spend', label: 'Spend', align: 'right' as const, sortable: true, sortKey: '_spend' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cpc', label: 'CPC', align: 'right' as const, sortable: true, sortKey: '_cpc' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'costPerLead', label: 'Cost / Lead', align: 'right' as const, sortable: true, sortKey: '_costPerLead' },
  { key: 'leadFormOpens', label: 'LF Opens', align: 'right' as const, sortable: true, sortKey: '_leadFormOpens' },
  { key: 'leadFormCompletionRate', label: 'LF Compl. Rate', align: 'right' as const, sortable: true, sortKey: '_leadFormCompletionRate' },
  { key: 'landingPageClicks', label: 'LP Clicks', align: 'right' as const, sortable: true, sortKey: '_landingPageClicks' },
  { key: 'shareOfSpend', label: 'Share of Spend', align: 'right' as const, sortable: true, sortKey: '_shareOfSpend' },
  { key: 'status', label: 'Status', align: 'left' as const, sortable: true },
]

export function LinkedInCreativeTable({ rows }: { rows: LinkedInCreativeRow[] }) {
  const tableRows = rows.map((r) => ({
    ad: r.ad, audience: r.audience, campaign: r.campaign, status: r.status,
    spend: usd(r.spend), impressions: num(r.impressions), clicks: num(r.clicks),
    ctr: pct(r.ctr), cpc: '$' + r.cpc.toFixed(2),
    leads: num(r.leads), costPerLead: '$' + r.costPerLead.toFixed(2),
    leadFormOpens: num(r.leadFormOpens), leadFormCompletionRate: pct(r.leadFormCompletionRate),
    landingPageClicks: num(r.landingPageClicks), shareOfSpend: pct(r.shareOfSpend),
    _spend: r.spend, _impressions: r.impressions, _clicks: r.clicks, _ctr: r.ctr, _cpc: r.cpc,
    _leads: r.leads, _costPerLead: r.costPerLead, _leadFormOpens: r.leadFormOpens,
    _leadFormCompletionRate: r.leadFormCompletionRate, _landingPageClicks: r.landingPageClicks,
    _shareOfSpend: r.shareOfSpend,
  }))
  return <DataTable columns={columns} rows={tableRows} defaultSort={{ key: 'spend', dir: 'desc' }} />
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/linkedin/creative\|linkedin-ads/creative-table" || echo "creative ok"` → `creative ok`

```bash
git add lib/linkedin/creative.ts lib/linkedin/creative.test.ts components/report-sections/linkedin-ads/creative-table.tsx
git commit -m "feat(linkedin): creative performance table (Ad/Audience/Campaign + Share of Spend)"
```

---

## Task 5: Geographic section (`lib/linkedin/geo.ts` + component)

**Files:** Create `lib/linkedin/geo.ts`, `lib/linkedin/geo.test.ts`, `components/report-sections/linkedin-ads/geo-section.tsx`.

**Interfaces:**
- Consumes: `linkedinQuery` (Task 2); `LinkedInGeoRow` (Task 2); `BarChart` (`@/components/charts/bar-chart`), `KpiCard` (`@/components/charts/kpi-card`), `CHART_COLORS` (`@/lib/constants`), `usd` (`@/lib/supermetrics/format`).
- Produces: `transformLinkedInGeo(rows): LinkedInGeoRow[]`; `getLinkedInGeoRows(slug, dateRange): Promise<LinkedInGeoRow[]>`; `LinkedInGeoSection` (consumed by Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// lib/linkedin/geo.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/geo.test.ts
import { strict as assert } from 'node:assert'
import { transformLinkedInGeo } from './geo'

const rows = [
  { memberRegion: 'California', spend: '500', impressions: '20000', clicks: '250', oneClickLeads: '10' },
  { memberRegion: 'Texas', spend: '800', impressions: '30000', clicks: '300', oneClickLeads: '12' },
]

const out = transformLinkedInGeo(rows)
assert.equal(out[0].region, 'Texas')   // sorted by spend desc
assert.equal(out[0].spend, 800)
assert.equal(out[0].leads, 12)
assert.equal(out[1].region, 'California')
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --env-file=.env.local lib/linkedin/geo.test.ts`
Expected: FAIL with `Cannot find module './geo'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/linkedin/geo.ts
import { linkedinQuery } from './base'
import type { LinkedInGeoRow } from './types'

export function transformLinkedInGeo(rows: Record<string, string>[]): LinkedInGeoRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  return rows
    .map((r): LinkedInGeoRow => ({
      region: r.memberRegion,
      spend: num(r, 'spend'),
      impressions: num(r, 'impressions'),
      clicks: num(r, 'clicks'),
      leads: num(r, 'oneClickLeads'),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15)
}

export async function getLinkedInGeoRows(slug: string, dateRange: string): Promise<LinkedInGeoRow[]> {
  const rows = await linkedinQuery(slug, ['memberRegion', 'spend', 'impressions', 'clicks', 'oneClickLeads'], dateRange, { maxRows: 500 })
  return transformLinkedInGeo(rows)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --env-file=.env.local lib/linkedin/geo.test.ts`
Expected: `ok`.

- [ ] **Step 5: Write the component** (mirror `meta-ads/geo-section.tsx`)

```tsx
// components/report-sections/linkedin-ads/geo-section.tsx
import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import type { LinkedInGeoRow } from '@/lib/linkedin/types'
import { usd } from '@/lib/supermetrics/format'

export function LinkedInGeoSection({ rows }: { rows: LinkedInGeoRow[] }) {
  const top10 = rows.slice(0, 10)
  const chartData = top10.map((r) => ({ region: r.region, spend: r.spend }))
  const yKeys = [{ key: 'spend', label: 'Spend', color: CHART_COLORS.linkedin }]
  const topRegion = top10[0] ?? null
  const totalGeos = rows.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard title="Top Region" value={topRegion?.region ?? '—'} />
        <KpiCard title="Spend (Top Region)" value={topRegion ? usd(topRegion.spend) : '—'} />
        <KpiCard title="Total Regions" value={totalGeos} />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Spend
        </p>
        {top10.length > 0 ? (
          <BarChart data={chartData} xKey="region" yKeys={yKeys} height={320} />
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
            No geo data available for this period.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/linkedin/geo\|linkedin-ads/geo-section" || echo "geo ok"` → `geo ok`

```bash
git add lib/linkedin/geo.ts lib/linkedin/geo.test.ts components/report-sections/linkedin-ads/geo-section.tsx
git commit -m "feat(linkedin): geographic section (memberRegion, state-level)"
```

---

## Task 7: Orchestrator + route wiring (`components/report-sections/linkedin-ads/index.tsx` + 3 routes)

**Files:** Rewrite `components/report-sections/linkedin-ads/index.tsx`; modify `app/portal/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`.

**Interfaces:**
- Consumes: `getLinkedInKpis` (Task 3), `getCreativeRows` (Task 4), `getLinkedInGeoRows` (Task 5), `LinkedInCreativeTable` (Task 4), `LinkedInGeoSection` (Task 5), `KpiGrid` (`@/components/report-sections/paid-search/kpi-grid`), `SmTimeoutError` (`@/lib/supermetrics/client`).
- Produces: `LinkedInAdsReport({ clientSlug, dateRange?, compareRange? })` — signature now matches `MetaAdsReport`.

- [ ] **Step 1: Replace `components/report-sections/linkedin-ads/index.tsx`** (mirror `meta-ads/index.tsx`; deletes the demo stub)

```tsx
import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import { getCreativeRows } from '@/lib/linkedin/creative'
import { getLinkedInGeoRows } from '@/lib/linkedin/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { LinkedInCreativeTable } from './creative-table'
import { LinkedInGeoSection } from './geo-section'
import { SmTimeoutError } from '@/lib/supermetrics/client'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try {
    return { data: await p }
  } catch (e) {
    return { error: e instanceof SmTimeoutError ? 'timeout' : 'error' }
  }
}

function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout'
        ? 'Taking longer than usual — try a shorter date range.'
        : "Couldn't load this section."}
    </div>
  )
}

export async function LinkedInAdsReport({
  clientSlug,
  dateRange = 'last_30_days',
  compareRange = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}) {
  const compare = compareRange ?? 'previous_period'
  const [kpis, creative, geo] = await Promise.all([
    safe(getLinkedInKpis(clientSlug, dateRange, compare)),
    safe(getCreativeRows(clientSlug, dateRange)),
    safe(getLinkedInGeoRows(clientSlug, dateRange)),
  ])

  return (
    <div className="space-y-8">
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {creative.data ? <LinkedInCreativeTable rows={creative.data} /> : <Fallback kind={creative.error!} />}
      {geo.data ? <LinkedInGeoSection rows={geo.data} /> : <Fallback kind={geo.error!} />}
    </div>
  )
}
```

- [ ] **Step 2: Wire the three dispatch sites** — in each of the three route files, the `linkedin-ads` case currently reads:

```tsx
    case 'linkedin-ads':
      return <LinkedInAdsReport clientSlug={clientSlug} />
```
Replace with:
```tsx
    case 'linkedin-ads':
      return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
```

Apply in all three:
- `app/portal/[clientSlug]/reports/page.tsx` (line ~69)
- `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` (line ~66)
- `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` (line ~54)

(`dateRange` and `compareRange` are already in scope at each dispatch — confirm by the adjacent `meta-ads` case, which already passes them.)

- [ ] **Step 3: Type-check + build**

Run:
```bash
npx tsc --noEmit 2>&1 | grep "linkedin" || echo "no linkedin type errors"
npm run build
```
Expected: `no linkedin type errors`; build clean.

- [ ] **Step 4: Run the full LinkedIn suite**

Run:
```bash
for f in lib/linkedin/*.test.ts; do echo "== $f"; npx tsx --env-file=.env.local "$f"; done
```
Expected: each prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/linkedin-ads/index.tsx app/portal/[clientSlug]/reports/page.tsx "app/portal/[clientSlug]/reports/[reportSlug]/page.tsx" "app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx"
git commit -m "feat(linkedin): real report orchestrator + route wiring (stub removed)"
```

---

## Post-implementation (controller / human — not tasks)

1. **Apply migration `0009`** to the dev Neon branch: `npm run db:migrate` (`.env.local`). Backward-compatible additive column.
2. **Seed the Renaissance row:** set `linkedinConfig = { "linkedinAdAccountId": "503368877" }` and add `'linkedin-ads'` to `enabledReports` (Drizzle Studio / Neon SQL editor). Dev DB only.
3. **Live smoke test** against `503368877` (render all three sections in a local preview). Confirm:
   - `creativeDscName` is populated for ads (else switch the Ad label to `creativeTitle` — see open items).
   - `ctr` and `leadFormCompletionRate` arrive as **percent (0–100)**, not fraction (0–1). If fractional, multiply by 100 in `transformLinkedInKpis` / `transformCreative` and update the tests.
   - Auto report-type resolution returns data for each section (no empty/`invalid-metric`).
4. **Update the status doc** (`docs/superpowers/renaissance-dashboard-status.md`): mark Module 3 built; correct the report-type assumption (LIA is `has_report_type_selection: false`, report type `1` covers all fields — no join needed); note the two derived KPIs.

---

## Self-Review

**Spec coverage:** §3 architecture → T2 base; §4 KPIs (14, 2 derived) → T3; §5 creative table (Ad/Audience/Campaign/Status, Share of Spend, sort) → T4; §6 geo (memberRegion, state-only) → T5; §7 config/schema → T1, display name → T6, component swap + dispatch → T7, enable report → Post-implementation; §8 testing → T3/T4/T5 tests + T7 full suite + smoke; §10 acceptance → covered across T1–T7 + Post-implementation; §11 open items (ad-label fallback in T4 `r.creativeDscName || r.creativeId`, migration number `0009` verified in T1, ctr/completion-rate scale in Post-implementation smoke). ✅

**Placeholder scan:** none — every step has concrete code/commands. `0009_*.sql` = generated migration filename, not a placeholder. ✅

**Type consistency:** `linkedinQuery`/`resolveCompareIso` (T2) consumed identically in T3/T4/T5; `LinkedInCreativeRow` (T2) produced by `transformCreative`/`getCreativeRows` (T4) and consumed by `LinkedInCreativeTable` (T4) + `LinkedInGeoRow` (T2) by T5; `getLinkedInKpis`/`getCreativeRows`/`getLinkedInGeoRows` + `LinkedInCreativeTable`/`LinkedInGeoSection` consumed in T7; `Client.linkedinConfig` (T1) read in T2; `LinkedInAdsReport` signature matches the updated dispatch call sites. ✅

**Out-of-band:** stage only each task's files; do not commit unrelated working-tree edits.
