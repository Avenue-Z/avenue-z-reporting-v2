# Paid Media Blended Leads/CPL + Null-safe Cost-per-Lead — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blended Leads + Cost-per-lead to the Paid Media Overview scoped to the two lead-bearing channels (Paid Search + LinkedIn, Meta excluded and captioned), and render `—` instead of `$0.00` wherever a cost-per-lead has a 0-lead denominator.

**Architecture:** One shared rule — an undefined cost-per-lead ratio is `null` in the data and `—` at render. A `costPerLead(cost, leads)` string helper covers table cells; a money-KPI `null → —` convention in `KpiGrid` covers KPI cards. The rollup (`lib/paid-media/overview.ts`) gains `blendedLeads`/`blendedCostPerLead` on a **lead-bearing-only** gate independent of the existing Spend/Clicks gate.

**Tech Stack:** Next.js 16 (RSC), TypeScript strict, Tremor + Recharts, vitest + @testing-library/react, Supermetrics Data API (server-side).

**Companion spec:** `docs/superpowers/specs/2026-08-06-paid-media-blended-leads-design.md`.

## Global Constraints

- **Cents scope = Paid Media only.** Reuse `money()` from `lib/paid-media/format.ts`; never touch shared `usd()` in `lib/supermetrics/format.ts`.
- **A legitimate zero stays `$0.00`.** Only an **undefined ratio** (`leads <= 0`, or an absent source value) becomes `null`/`—`. Spend of `$0.00` must still render `$0.00`.
- **Blended Spend/Clicks are untouched** — same gate (all configured channels incl. Meta), same values as PR #188.
- **Meta is excluded from Leads/CPL by construction** (no `leadsKey`); it must never blank or feed the blended Leads/CPL.
- **RSC boundary.** `npm run check:rsc` stays green — no function props cross a Server→Client boundary.
- **CI gate:** `npx vitest run`, `npx tsx scripts/check-rsc-props.ts`, `npx tsc --noEmit` all green before the PR merges to `dev`.
- **Branch:** `feat/paid-media-blended-leads` (off `dev`, stacks on merged #188). Commit per task.
- The em dash sentinel is the character `—` (U+2014).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/paid-media/format.ts` | add `DASH` + `costPerLead(cost, leads)` | 1 |
| `lib/paid-search/types.ts` | widen `Kpi.value` to allow `null` | 2 |
| `components/report-sections/paid-search/kpi-grid.tsx` | money KPI `null → —` | 2 |
| `lib/paid-search/kpis.ts` | Paid Search `cpl` → `null` when no leads | 3 |
| `components/report-sections/paid-search/campaign-table.tsx` | campaign row + total CPL via helper | 4 |
| `lib/paid-search/keywords.ts` | keyword total already carries `cost`/`leads` (no change needed beyond confirm) | 5 |
| `components/report-sections/paid-search/keywords-table-client.tsx` | keyword row + total CPL via helper | 5 |
| `lib/linkedin/kpis.ts` | LinkedIn `costPerLead` → `null` when `oneClickLeads == 0` | 6 |
| `lib/linkedin/kpis.dash.test.ts` (new) + `vitest.config.ts` | pin LinkedIn KPI test | 6 |
| `lib/linkedin/creative.ts`, `components/report-sections/linkedin-ads/creative-table-client.tsx` | creative CPL cell → `—` when `leads == 0` | 7 |
| `lib/paid-media/overview.ts` | `blendedLeads` + `blendedCostPerLead` | 8 |
| `components/report-sections/paid-media/overview/index.tsx` | Leads/CPL tiles + "two channels only" caption | 9 |
| `docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md`, `docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md` | governance reconciliation | 10 |
| `scripts/seed.ts` | reconcile Renaissance LinkedIn config (verify-live) | 11 |

---

## Task 1: `costPerLead` helper + `DASH` sentinel

**Files:**
- Modify: `lib/paid-media/format.ts`
- Test: `lib/paid-media/format.test.ts` (exists, in vitest include)

**Interfaces:**
- Produces: `export const DASH = '—'`; `export function costPerLead(cost: number, leads: number): string`

- [ ] **Step 1: Add failing tests** to `lib/paid-media/format.test.ts`:

```ts
import { money, costPerLead, DASH } from './format'

describe('costPerLead (undefined ratio → dash)', () => {
  test('computes cents when leads > 0', () => {
    expect(costPerLead(100, 4)).toBe(money(25))
    expect(costPerLead(8824.99, 5)).toBe(money(8824.99 / 5))
  })
  test('returns the dash when there are no leads (undefined ratio, not $0)', () => {
    expect(costPerLead(100, 0)).toBe(DASH)
    expect(costPerLead(0, 0)).toBe(DASH)
    expect(costPerLead(50, -1)).toBe(DASH)
  })
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run lib/paid-media/format.test.ts` → FAIL (`costPerLead` not exported).

- [ ] **Step 3: Implement** in `lib/paid-media/format.ts` (append after `money`):

```ts
/** Sentinel for an undefined value (em dash, U+2014). */
export const DASH = '—'

/**
 * Cost per lead in Paid Media cents, or DASH when there are no leads. A 0-lead
 * denominator makes the ratio undefined; rendering it as $0.00 wrongly implies
 * leads were free, so we show '—' instead.
 */
export function costPerLead(cost: number, leads: number): string {
  return leads > 0 ? money(cost / leads) : DASH
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run lib/paid-media/format.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/paid-media/format.ts lib/paid-media/format.test.ts
git commit -m "feat(paid-media): costPerLead helper — dash for a 0-lead denominator"
```

---

## Task 2: money-KPI `null → —` convention in `KpiGrid`

**Files:**
- Modify: `lib/paid-search/types.ts` (widen `Kpi.value`)
- Modify: `components/report-sections/paid-search/kpi-grid.tsx`
- Test: `components/report-sections/paid-search/kpi-grid.test.tsx` (exists, covered by `components/report-sections/**`)

**Interfaces:**
- Consumes: `DASH`, `money` from `lib/paid-media/format.ts`
- Produces: a money `Kpi` (`format: 'money'`) with `value: null` renders `—`.

- [ ] **Step 1: Add a failing test** to `components/report-sections/paid-search/kpi-grid.test.tsx`:

```ts
test('a money KPI with a null value renders the dash, not $0.00 or $NaN', () => {
  const kpis: Kpi[] = [
    { key: 'cpl', label: 'Cost / Lead', value: null, format: 'money', invertDelta: true },
    { key: 'cost', label: 'Cost', value: 0, format: 'money' }, // a real zero stays $0.00
  ]
  render(<KpiGrid kpis={kpis} />)
  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.getByText('$0.00')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-search/kpi-grid.test.tsx` → FAIL (currently `money(null as number)` → `$NaN`, and `Kpi.value` rejects `null` in tsc).

- [ ] **Step 3: Widen the type** in `lib/paid-search/types.ts` — change the `Kpi.value` field:

```ts
export interface Kpi { key: string; label: string; value: number | string | null; prefix?: string; suffix?: string; delta?: number; invertDelta?: boolean; tooltip?: string; /** 'money' → render the numeric value as Paid Media cents ($1,234.50); null → '—'. */ format?: 'money' }
```

- [ ] **Step 4: Update `KpiGrid`** — replace the `isMoney`/`value` lines in `components/report-sections/paid-search/kpi-grid.tsx`. Add the import and change the mapping body:

```tsx
import { money, DASH } from '@/lib/paid-media/format'
// ...
{kpis.map((k) => {
  // Money KPIs render cents; a null money value is an undefined ratio → dash.
  const isMoney = k.format === 'money'
  const display = isMoney ? (k.value == null ? DASH : money(k.value as number)) : (k.value as string | number)
  return (
    <KpiCard
      key={k.key}
      title={k.label}
      value={display}
      prefix={isMoney ? undefined : k.prefix}
      suffix={k.suffix}
      delta={k.delta}
      invertDelta={k.invertDelta}
      tooltip={k.tooltip}
    />
  )
})}
```

(The `as string | number` cast on the non-money branch is safe: only money CPL KPIs ever carry `null`.)

- [ ] **Step 5: Run tests + typecheck.** `npx vitest run components/report-sections/paid-search/kpi-grid.test.tsx` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit.**
```bash
git add lib/paid-search/types.ts components/report-sections/paid-search/kpi-grid.tsx components/report-sections/paid-search/kpi-grid.test.tsx
git commit -m "feat(paid-media): money KPI renders '—' for a null (undefined-ratio) value"
```

---

## Task 3: Paid Search KPI — CPL `null` when no leads

**Files:**
- Modify: `lib/paid-search/kpis.ts`
- Test: `lib/paid-search/kpis.test.ts` (exists, in vitest include)

**Interfaces:**
- Consumes: the Task 2 convention (a `null` money KPI → `—`).

- [ ] **Step 1: Add a failing test** to `lib/paid-search/kpis.test.ts` inside `describe('transformKpis', …)`:

```ts
test('CPL is null (renders —) when there are no leads', () => {
  const noLeadTotals = { Cost: '500', Clicks: '100', Impressions: '2000' }
  const k = transformKpis(noLeadTotals, [], null, null, cfg)
  const cpl = k.find((c) => c.key === 'cpl')!
  expect(cpl.value).toBeNull()
  expect(cpl.delta).toBeUndefined()
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run lib/paid-search/kpis.test.ts` → FAIL (currently `cpl` value is `0`).

- [ ] **Step 3: Implement** in `lib/paid-search/kpis.ts`. Change the `cpl` computation and its KPI entry:

```ts
const cpl = leads ? cost / leads : null
```
and the card (guard the delta so `delta(cur: number, …)` never receives null):
```ts
{ key: 'cpl', label: 'Cost / Lead', value: cpl, format: 'money', delta: cpl != null ? delta(cpl, cCpl) : undefined, invertDelta: true },
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run lib/paid-search/kpis.test.ts` → PASS (the existing "CPL is exact cents" test with leads > 0 still passes).

- [ ] **Step 5: Commit.**
```bash
git add lib/paid-search/kpis.ts lib/paid-search/kpis.test.ts
git commit -m "feat(paid-search): KPI Cost/Lead is null (renders —) when no leads"
```

---

## Task 4: Paid Search campaign table — CPL dash (row + total)

**Files:**
- Modify: `components/report-sections/paid-search/campaign-table.tsx`
- Test: `components/report-sections/paid-search/campaign-table.test.tsx` (new; covered by `components/report-sections/**`)

**Interfaces:**
- Consumes: `costPerLead` from `lib/paid-media/format.ts`; `CampaignRow` (`{ campaign, cost, clicks, impressions, ctr, cpc, leads, cpl, convRate }`), `campaignTotals(rows) → { cost, clicks, impressions, leads }`.

- [ ] **Step 1: Write the failing test** `components/report-sections/paid-search/campaign-table.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignTable } from './campaign-table'
import type { CampaignRow } from '@/lib/paid-search/types'

function row(campaign: string, cost: number, leads: number): CampaignRow {
  return { campaign, cost, clicks: 100, impressions: 1000, ctr: 10, cpc: cost / 100, leads, cpl: leads ? cost / leads : 0, convRate: 0 }
}

describe('CampaignTable Cost/Lead dash', () => {
  test('a campaign with 0 leads shows — for CPL, one with leads shows cents', () => {
    render(<CampaignTable rows={[row('Has Leads', 1000, 4), row('No Leads', 500, 0)]} />)
    expect(screen.getByText('$250.00')).toBeInTheDocument() // 1000 / 4
    // 'No Leads' row + a 0-lead scenario must not print $0.00 for CPL.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-search/campaign-table.test.tsx` → FAIL (currently prints `$0.00`).

- [ ] **Step 3: Implement** in `components/report-sections/paid-search/campaign-table.tsx`. Add the import and swap the two CPL formats:

```ts
import { money, costPerLead } from '@/lib/paid-media/format'
```
In `toTableRow`: `cpl: costPerLead(r.cost, r.leads),`
In `totalsRow`: `cpl: costPerLead(totals.cost, totals.leads),`
(Leave `cost`, `cpc`, etc. on `money` as-is.)

- [ ] **Step 4: Run, verify pass.** `npx vitest run components/report-sections/paid-search/campaign-table.test.tsx` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-search/campaign-table.tsx components/report-sections/paid-search/campaign-table.test.tsx
git commit -m "feat(paid-search): campaign Cost/Lead shows — when no leads"
```

---

## Task 5: Paid Search keyword table — CPL dash (row + total)

**Files:**
- Modify: `components/report-sections/paid-search/keywords-table-client.tsx`
- Test: `components/report-sections/paid-search/keywords-table-client.test.tsx` (exists, covered)

**Interfaces:**
- Consumes: `costPerLead`; `KeywordRow` (`{ …, cost, leads, cpl }`), `KeywordTotal` (`{ clicks, impressions, cost, leads, ctr, cpl }`).

- [ ] **Step 1: Add a failing test** to `components/report-sections/paid-search/keywords-table-client.test.tsx`. Extend the existing `kw` fixture helper is already present; add:

```tsx
test('Cost/Lead shows — for a 0-lead total instead of $0.00', () => {
  const top = [kw('k0', 15, 1000, 500, 0)] // 0 leads
  render(<KeywordsTableClient data={data(view(top, 1, 500))} />)
  expect(screen.getByText(/Total \(1 keyword\)/)).toBeInTheDocument()
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
})
```
(Note: the `view()` helper builds `total` with `cost: totalCost, leads: 0`; confirm its `leads` is 0 for this case — adjust the helper call if it hardcodes leads.)

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-search/keywords-table-client.test.tsx` → FAIL (`money(0)` → `$0.00`).

- [ ] **Step 3: Implement** in `components/report-sections/paid-search/keywords-table-client.tsx`. Import the helper and swap the two CPL formats:

```ts
import { money, costPerLead } from '@/lib/paid-media/format'
```
In `toTableRow`: `cpl: costPerLead(r.cost, r.leads),`
In `totalsRow`: `cpl: costPerLead(total.cost, total.leads),`

- [ ] **Step 4: Run, verify pass.** `npx vitest run components/report-sections/paid-search/keywords-table-client.test.tsx` → PASS (the existing cents test with leads > 0 still passes).

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-search/keywords-table-client.tsx components/report-sections/paid-search/keywords-table-client.test.tsx
git commit -m "feat(paid-search): keyword Cost/Lead shows — when no leads"
```

---

## Task 6: LinkedIn KPI — CPL `null` when `oneClickLeads == 0`

**Files:**
- Modify: `lib/linkedin/kpis.ts`
- Create: `lib/linkedin/kpis.dash.test.ts`
- Modify: `vitest.config.ts` (pin the new test)

**Interfaces:**
- Consumes: Task 2 convention. `transformLinkedInKpis(totals, compare)` is pure but `kpis.ts` imports `./base` (→ `lib/db` → next-auth), so the test **must** `vi.mock('@/lib/linkedin/base', …)`.

- [ ] **Step 1: Create the failing test** `lib/linkedin/kpis.dash.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
// kpis.ts imports ./base (→ lib/db → next-auth); mock it so jsdom can load the module.
vi.mock('@/lib/linkedin/base', () => ({ linkedinQuery: vi.fn(), resolveCompareIso: vi.fn() }))
import { transformLinkedInKpis } from './kpis'

describe('LinkedIn Cost / Lead dash', () => {
  test('costPerLead is null (renders —) when there are 0 leads', () => {
    // oneClickLeadsCost can come back null → previously Number(null||0)=0 → "$0.00".
    const k = transformLinkedInKpis({ spend: '5000', clicks: '100', oneClickLeads: '0' }, null)
    const cpl = k.find((c) => c.key === 'costPerLead')!
    expect(cpl.value).toBeNull()
  })
  test('costPerLead keeps its value when leads > 0', () => {
    const k = transformLinkedInKpis({ spend: '5000', oneClickLeads: '10', oneClickLeadsCost: '80' }, null)
    expect(k.find((c) => c.key === 'costPerLead')!.value).toBe(80)
  })
})
```

- [ ] **Step 2: Pin the test** in `vitest.config.ts` — add to the `include` array (next to the other `lib/meta/*` pins):

```ts
'lib/linkedin/kpis.dash.test.ts',
```

- [ ] **Step 3: Run, verify it fails.** `npx vitest run lib/linkedin/kpis.dash.test.ts` → FAIL (`costPerLead` value is `0`).

- [ ] **Step 4: Implement** in `lib/linkedin/kpis.ts`. Compute the LinkedIn lead count once and gate the CPL card off it:

```ts
const liLeads = n(totals, 'oneClickLeads')
```
and change the `costPerLead` entry:
```ts
{ key: 'costPerLead', label: 'Cost / Lead', value: liLeads > 0 ? n(totals, 'oneClickLeadsCost') : null, format: 'money', delta: liLeads > 0 ? d('oneClickLeadsCost') : undefined, invertDelta: true },
```
(Place `const liLeads = …` above the `return [` so it's in scope.)

- [ ] **Step 5: Run, verify pass.** `npx vitest run lib/linkedin/kpis.dash.test.ts` → PASS.

- [ ] **Step 6: Commit.**
```bash
git add lib/linkedin/kpis.ts lib/linkedin/kpis.dash.test.ts vitest.config.ts
git commit -m "feat(linkedin): KPI Cost/Lead is null (renders —) when no leads"
```

---

## Task 7: LinkedIn creative table — CPL cell dash when `leads == 0`

**Files:**
- Modify: `components/report-sections/linkedin-ads/creative-table-client.tsx`
- Test: `components/report-sections/linkedin-ads/creative-table.test.tsx` (new; covered by `components/report-sections/**`)

**Interfaces:**
- Consumes: `DASH`, `money`. `LinkedInCreativeMetrics` includes `.leads` and `.costPerLead`. Cell render is `{c.fmt(m[c.key])}` at `creative-table-client.tsx:79-80`, where `m: LinkedInCreativeMetrics`.

- [ ] **Step 1: Write the failing test** `components/report-sections/linkedin-ads/creative-table.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreativeTableClient } from './creative-table-client'
import type { LinkedInCampaignGroupNode, LinkedInCreativeMetrics } from '@/lib/linkedin/types'

const zero: LinkedInCreativeMetrics = {
  spend: 500, impressions: 4000, clicks: 40, ctr: 1, cpc: 12.5,
  leads: 0, costPerLead: 0, leadFormOpens: 0, leadFormCompletionRate: 0,
  landingPageClicks: 30, shareOfSpend: 100,
}
const groups: LinkedInCampaignGroupNode[] = [{
  name: 'Prospecting', ...zero,
  campaigns: [{ name: 'Brokers', ...zero, ads: [{ ...zero, ad: 'Ad A', campaign: 'Brokers', campaignGroup: 'Prospecting', status: 'ACTIVE' }] }],
}]

test('a 0-lead ad shows — for Cost / Lead, never $0.00', () => {
  render(<CreativeTableClient groups={groups} totals={zero} />)
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
})
```
(Adjust the node/ad shape if `LinkedInCreativeMetrics`/node types differ — read `lib/linkedin/types.ts` for exact field names before finalizing the fixture.)

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/linkedin-ads/creative-table.test.tsx` → FAIL (prints `$0.00` for Cost / Lead).

- [ ] **Step 3: Implement** in `components/report-sections/linkedin-ads/creative-table-client.tsx`:
  1. Import the dash: `import { money, DASH } from '@/lib/paid-media/format'` (extend the existing money import).
  2. Widen `Col.fmt` to receive the row: `fmt: (n: number, row?: LinkedInCreativeMetrics) => string`.
  3. Change the `costPerLead` column entry to dash on 0 leads:
     ```ts
     { key: 'costPerLead', label: 'Cost / Lead', fmt: (n, row) => (row && row.leads > 0 ? money(n) : DASH) },
     ```
  4. Pass the row at the cell render (line ~80): `{c.fmt(m[c.key], m)}`.

- [ ] **Step 4: Run tests + typecheck.** `npx vitest run components/report-sections/linkedin-ads/creative-table.test.tsx` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/linkedin-ads/creative-table-client.tsx components/report-sections/linkedin-ads/creative-table.test.tsx
git commit -m "feat(linkedin): creative Cost/Lead cell shows — when no leads"
```

---

## Task 8: Blended Leads + Cost-per-lead in the rollup

**Files:**
- Modify: `lib/paid-media/overview.ts`
- Test: `lib/paid-media/overview.test.ts` (exists, in vitest include)

**Interfaces:**
- Consumes: existing `CHANNELS` (each `{ key, label, spendKey, clicksKey, leadsKey? }`), `ChannelMetrics` (`{ key, label, configured, spend, clicks, leads, ok }`).
- Produces: `PaidMediaOverview` gains `blendedLeads: number | null` and `blendedCostPerLead: number | null`.

- [ ] **Step 1: Add failing tests** to `lib/paid-media/overview.test.ts` inside `describe('getPaidMediaOverview', …)`:

```ts
test('blended Leads = Paid Search + LinkedIn; CPL = their spend / their leads; Meta excluded', async () => {
  clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
  psMock.mockResolvedValue(ps(1000, 200, 12))   // 12 leads
  metaMock.mockResolvedValue(meta(500, 80))     // no leads key
  liMock.mockResolvedValue(li(300, 40, 8))      // 8 leads

  const o = await getPaidMediaOverview('acme', 'last_30_days')
  expect(o.blendedLeads).toBe(20)               // 12 + 8, Meta excluded
  expect(o.blendedCostPerLead).toBeCloseTo((1000 + 300) / 20, 6) // (PS+LI spend) / (PS+LI leads)
})

test('a failed Meta does NOT blank blended Leads/CPL (Meta is not lead-bearing)', async () => {
  clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
  psMock.mockResolvedValue(ps(1000, 200, 12))
  metaMock.mockRejectedValue(new Error('meta failed'))
  liMock.mockResolvedValue(li(300, 40, 8))

  const o = await getPaidMediaOverview('acme', 'last_30_days')
  expect(o.blendedLeads).toBe(20)
  expect(o.blendedSpend).toBeNull()             // Spend/Clicks gate still blanks on Meta failure
})

test('a failed lead-bearing channel (LinkedIn) blanks blended Leads/CPL', async () => {
  clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
  psMock.mockResolvedValue(ps(1000, 200, 12))
  metaMock.mockResolvedValue(meta(500, 80))
  liMock.mockRejectedValue(new Error('li failed'))

  const o = await getPaidMediaOverview('acme', 'last_30_days')
  expect(o.blendedLeads).toBeNull()
  expect(o.blendedCostPerLead).toBeNull()
})

test('0 blended leads → CPL is null (renders —)', async () => {
  clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
  psMock.mockResolvedValue(ps(1000, 200, 0))
  metaMock.mockResolvedValue(meta(500, 80))
  liMock.mockResolvedValue(li(300, 40, 0))

  const o = await getPaidMediaOverview('acme', 'last_30_days')
  expect(o.blendedLeads).toBe(0)
  expect(o.blendedCostPerLead).toBeNull()
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run lib/paid-media/overview.test.ts` → FAIL (`blendedLeads`/`blendedCostPerLead` undefined).

- [ ] **Step 3: Implement** in `lib/paid-media/overview.ts`:
  1. Extend the interface:
     ```ts
     export interface PaidMediaOverview {
       channels: ChannelMetrics[]
       blendedSpend: number | null
       blendedClicks: number | null
       blendedLeads: number | null
       blendedCostPerLead: number | null
     }
     ```
  2. After the existing `runs`/`allOk`/`blendedSpend`/`blendedClicks` block, add the lead-bearing gate and return the new fields:
     ```ts
     // Lead-bearing channels are those with a leadsKey (Paid Search, LinkedIn).
     // Meta has none → excluded from Leads/CPL entirely (never blanks them).
     const leadKeys = new Set(CHANNELS.filter((c) => c.leadsKey).map((c) => c.key))
     const leadRuns = channels.filter((c) => c.configured && leadKeys.has(c.key))
     const leadsOk = leadRuns.length > 0 && leadRuns.every((c) => c.ok)
     const blendedLeads = leadsOk ? leadRuns.reduce((s, c) => s + (c.leads ?? 0), 0) : null
     const leadSpend = leadsOk ? leadRuns.reduce((s, c) => s + (c.spend ?? 0), 0) : null
     const blendedCostPerLead =
       leadsOk && blendedLeads != null && blendedLeads > 0 ? (leadSpend as number) / blendedLeads : null

     return { channels, blendedSpend, blendedClicks, blendedLeads, blendedCostPerLead }
     ```
     (Replace the existing `return { channels, blendedSpend, blendedClicks }`.)

- [ ] **Step 4: Run, verify pass.** `npx vitest run lib/paid-media/overview.test.ts` → PASS (existing Spend/Clicks tests unaffected).

- [ ] **Step 5: Commit.**
```bash
git add lib/paid-media/overview.ts lib/paid-media/overview.test.ts
git commit -m "feat(paid-media): blended Leads + Cost/Lead over lead-bearing channels (Meta excluded)"
```

---

## Task 9: Overview UI — Leads/CPL tiles + "two channels only" caption

**Files:**
- Modify: `components/report-sections/paid-media/overview/index.tsx`
- Test: `components/report-sections/paid-media/overview/index.test.tsx` (exists, covered)

**Interfaces:**
- Consumes: `getPaidMediaOverview` now returns `blendedLeads`, `blendedCostPerLead`; `asMoney`/`asNum` helpers already map `null → '—'`.

- [ ] **Step 1: Update the mocked shape + add assertions** in `components/report-sections/paid-media/overview/index.test.tsx`. In the existing test's `mock.mockResolvedValue({...})` add `blendedLeads: 20, blendedCostPerLead: 65` (and a second assertion block). Then add:

```ts
// Top line now shows a Cost per Lead tile (unique text — the By-Channel table
// has a "Leads" column header but no "Cost per Lead" one, so this is unambiguous).
expect(screen.getByText('Cost per Lead')).toBeInTheDocument()
// "Leads" appears as both a tile title and the breakdown column header → use getAllByText.
expect(screen.getAllByText('Leads').length).toBeGreaterThanOrEqual(2)
// The scoping caption is explicit about which channels are blended.
expect(screen.getByText(/Paid Search and LinkedIn only/i)).toBeInTheDocument()
```
Add a focused test for the dash:
```ts
test('blended Cost per Lead renders — when blendedCostPerLead is null', async () => {
  mock.mockResolvedValue({
    channels: [
      { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 0, ok: true },
      { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true },
      { key: 'linkedin', label: 'LinkedIn Advertising', configured: true, spend: 300, clicks: 40, leads: 0, ok: true },
    ],
    blendedSpend: 1800, blendedClicks: 320, blendedLeads: 0, blendedCostPerLead: null,
  })
  render(await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' }))
  expect(screen.getByText('Cost per Lead')).toBeInTheDocument()
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → FAIL (no Leads/CPL tiles, no caption).

- [ ] **Step 3: Implement** in `components/report-sections/paid-media/overview/index.tsx`. Change the top-line grid from 2 tiles to 4 and add the caption. Replace the combined top-line block:

```tsx
{/* Combined top line — Spend, Clicks, Leads, Cost per Lead (item 11a order). */}
<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
  <KpiCard title="Spend" value={asMoney(o.blendedSpend)} />
  <KpiCard
    title="Clicks"
    value={asNum(o.blendedClicks)}
    tooltip="Blended across the channels this client runs. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
  />
  <KpiCard title="Leads" value={asNum(o.blendedLeads)} />
  <KpiCard title="Cost per Lead" value={asMoney(o.blendedCostPerLead)} />
</div>

<p className="text-xs text-text-muted">
  Blended Spend and Clicks are shown only when every channel this client runs reports.
  Leads and Cost per Lead are blended across Paid Search and LinkedIn only — Meta lead
  conversions aren&rsquo;t tracked, so Meta is excluded from those two figures.
</p>
```
(`asNum`/`asMoney` already return `'—'` for `null`; no other change needed.)

- [ ] **Step 4: Run tests + RSC + typecheck.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → PASS; `npx tsx scripts/check-rsc-props.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-media/overview/index.tsx components/report-sections/paid-media/overview/index.test.tsx
git commit -m "feat(paid-media): Overview shows blended Leads + Cost/Lead (PS + LinkedIn), captioned"
```

---

## Task 10: Governance / decision-doc reconciliation

**Files:**
- Modify: `docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md`
- Modify: `docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`

No code, no test.

- [ ] **Step 1: Update the definition-question doc.** Change its Status block to record the reversal, e.g. replace the "dropped entirely" resolution with:

```markdown
**Status:** ✅ UPDATED (2026-08-06, Paul). Blended Leads / Cost per Lead are **re-added on the Overview, scoped to Paid Search + LinkedIn only** (the two lead-bearing channels). Meta is excluded — Meta lead conversions are genuinely untracked. Rationale: LinkedIn lead tracking is valid (native `oneClickLeads`); it currently reads 0 because Renaissance runs landing-page traffic, and the LinkedIn buyer confirmed a planned move to native Lead Gen Forms, at which point it populates. Supersedes the 2026-08-04 "drop entirely" decision (RESOLVED 1).
```

- [ ] **Step 2: Annotate RESOLVED 1** in `docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md` — add a one-line note under the RESOLVED 1 header:

```markdown
> **SUPERSEDED (2026-08-06):** blended Leads/CPL re-added scoped to Paid Search + LinkedIn (Meta excluded). See `docs/superpowers/specs/2026-08-06-paid-media-blended-leads-design.md`.
```

- [ ] **Step 3: Commit.**
```bash
git add docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md
git commit -m "docs(paid-media): reconcile RESOLVED 1 — blended Leads/CPL re-added (PS + LinkedIn)"
```

---

## Task 11: Reconcile `seed.ts` with Renaissance's live LinkedIn config (verify-live)

**Files:**
- Modify: `scripts/seed.ts`

No automated test (seed is data). **Do NOT run the seed against any live DB as part of this task** — it's a source-of-truth reconciliation only.

- [ ] **Step 1: Confirm the live config first.** In Drizzle Studio / the Neon SQL editor, read Renaissance's row: confirm `linkedin_config.linkedinAdAccountId` and that `enabled_reports` includes `paid-media`. The LinkedIn account id is **`503368877`** ("Renaissance Life and Health Ads Account", confirmed via Supermetrics accounts_discovery). If the live values differ, use the live values.

- [ ] **Step 2: Add `linkedinConfig` to the Renaissance seed block** (next to `metaConfig`):
```ts
linkedinConfig: { linkedinAdAccountId: '503368877' },
```

- [ ] **Step 3: Align `enabledReports`** with the live row (only if Step 1 confirms it) — e.g. ensure `'paid-media'` is present so the seed matches production. Leave unchanged if the live row still uses the legacy `google-ads`/`meta-ads` entries.

- [ ] **Step 4: Typecheck.** `npx tsc --noEmit` → clean (the `linkedinConfig` shape must match `lib/db/schema.ts` `LinkedinConfig`).

- [ ] **Step 5: Commit.**
```bash
git add scripts/seed.ts
git commit -m "chore(seed): add Renaissance linkedinConfig (reconcile seed with live DB)"
```

---

## Final verification (before opening the PR)

- [ ] `npx vitest run` → all green.
- [ ] `npx tsx scripts/check-rsc-props.ts` → passes.
- [ ] `npx tsc --noEmit` → clean.
- [ ] Manual: a Paid Media client's Overview shows Spend · Clicks · Leads · Cost per Lead with the "Paid Search and LinkedIn only" caption; LinkedIn section's Cost/Lead shows `—` (not `$0.00`) for the current 0-lead window; Paid Search campaign/keyword totals show `—` for a 0-lead slice.
- [ ] Write the review-record doc `docs/qa/paid-media-blended-leads-code-review.md`, open the PR off `dev`, Stage-1 review (Paul + Thomas).

## Self-review (spec coverage)

- Spec §A (blended Leads/CPL, lead-bearing gate, formula) → Task 8. §B (Overview tiles + caption) → Task 9. §C (dash rule: helper + KPI convention + all CPL sites) → Tasks 1,2,3,4,5,6,7. §5 (seed) → Task 11. §6 (governance) → Task 10. Non-goals (Meta `costPerLpv`, GA4/HubSpot) → not implemented, by design.
- Type consistency: `Kpi.value: number | string | null` (Task 2) is consumed by Tasks 3 & 6 (`value: null`); `costPerLead(cost, leads)` (Task 1) is consumed by Tasks 4 & 5; `blendedLeads`/`blendedCostPerLead` (Task 8) consumed by Task 9. Names match across tasks.
