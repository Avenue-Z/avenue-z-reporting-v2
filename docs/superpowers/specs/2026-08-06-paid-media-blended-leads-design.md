# Paid Media — Blended Leads/CPL (lead-bearing channels) + null-safe Cost per Lead — Design

**Status:** design for approval
**Branch:** `feat/paid-media-blended-leads` (off `dev`, stacks on merged PR #188)
**Author:** Paul (with Claude)
**Date:** 2026-08-06

## 1. Motivation

PR #188 shipped the Paid Media **Overview** with blended **Spend** and **Clicks**,
and deliberately **dropped** blended **Leads** and **Cost per Lead** (spec §2
"RESOLVED 1", recorded as a Dianna/team decision 2026-08-04) because Meta has no
lead data and the team chose to drop anything Meta-lead-influenced.

Two facts have since changed that calculus:

1. **LinkedIn lead tracking is valid, not broken.** Investigation (live Supermetrics
   pull, Renaissance LinkedIn account `503368877`, trailing 12 months) confirmed
   `oneClickLeads = 0` is *correct*: the account runs landing-page traffic, not
   native Lead Gen Forms (4,599 landing-page clicks, 101 form opens, 0 completions).
   The LinkedIn **paid media buyer confirmed** they do not currently target leads
   but **will transition to native Lead Gen Forms**, at which point `oneClickLeads`
   populates. The field, query, and transform are all correct.
2. **Only Meta is a genuine data gap.** Paid Search and LinkedIn both expose a real
   `leads` KPI today; Meta lead conversions are genuinely untracked.

So a blend across the **two lead-bearing channels (Paid Search + LinkedIn)** is
honest and useful; only Meta must be excluded. This **reverses RESOLVED 1** — see §6.

A second, related defect surfaced in the same investigation: a Cost-per-lead with a
**0-lead denominator renders `$0.00`** (implying "leads are free") instead of `—`
(undefined). This affects LinkedIn today (`oneClickLeadsCost` returns `null` →
`Number(null || 0) = 0`) and every other Paid Media CPL site (`leads ? cost/leads : 0`).

## 2. Scope

**In scope (one feature branch, one PR):**
- **A.** Blended **Leads** and **Cost per Lead** on the Overview top line, scoped to
  the lead-bearing channels (Paid Search + LinkedIn), Meta excluded, clearly captioned.
- **B.** Null-safe cost-per-lead: render `—` (not `$0.00`) wherever a cost-per-lead
  has a 0-lead denominator, across **all** Paid Media surfaces.
- **C.** Reconcile the governance/decision docs; note the `seed.ts` drift.

**Out of scope (explicit non-goals):**
- Sourcing LinkedIn (or any) leads from GA4 / HubSpot. Investigation showed GA4 can't
  attribute *paid* LinkedIn (ads aren't UTM-tagged) and LinkedIn drove ~0 form-fill
  leads regardless; HubSpot isn't connected for Renaissance and is AVZ-hardwired.
  Revisit only if the LinkedIn ads get UTM-tagged / native Lead Gen Forms go live.
- Meta **Cost / LPV** (`costPerLpv`) 0-denominator handling. It is cost-per-*LPV*, a
  different metric from cost-per-*lead*. Left as-is here; can be a trivial follow-up
  using the same convention if desired.

## 3. Design detail

### A. Blended Leads + Cost per Lead — `lib/paid-media/overview.ts`

"Lead-bearing channel" is already encoded: entries in `CHANNELS` with a `leadsKey`
(Paid Search `leads`, LinkedIn `leads`). Meta has no `leadsKey`, so it is excluded
by construction — no special-casing.

Extend `PaidMediaOverview`:

```ts
export interface PaidMediaOverview {
  channels: ChannelMetrics[]
  blendedSpend: number | null        // Paid Search + LinkedIn only (see amendment)
  blendedClicks: number | null       // Paid Search + LinkedIn only (see amendment)
  blendedLeads: number | null        // NEW — lead-bearing channels only
  blendedCostPerLead: number | null  // NEW — null => render '—'
}
```

Compute with a **gate independent of** the Spend/Clicks gate:

```ts
const LEAD_BEARING: ChannelKey[] = CHANNELS.filter(c => c.leadsKey).map(c => c.key)
// = ['paid-search', 'linkedin']

const leadRuns = channels.filter(c => c.configured && LEAD_BEARING.includes(c.key))
const leadsOk  = leadRuns.length > 0 && leadRuns.every(c => c.ok)

const blendedLeads = leadsOk ? leadRuns.reduce((s, c) => s + (c.leads ?? 0), 0) : null
const leadSpend    = leadsOk ? leadRuns.reduce((s, c) => s + (c.spend ?? 0), 0) : null
const blendedCostPerLead =
  leadsOk && blendedLeads != null && blendedLeads > 0
    ? (leadSpend as number) / blendedLeads
    : null
```

**Properties (the important invariants):**
- Meta being unconfigured, failing, or lead-less **never** blanks `blendedLeads`/
  `blendedCostPerLead` — Meta isn't in `leadRuns`.
- A *configured* lead-bearing channel that **fails** (`ok:false`) blanks both
  (mirrors #188's missing-channel principle, scoped to lead-bearing).
- `blendedCostPerLead` numerator is the **lead-bearing channels' spend only**
  (`leadSpend`), per decision: `(PS spend + LI spend) ÷ (PS leads + LI leads)`.
  Meta spend is **not** in the numerator.
- `blendedLeads === 0` (both channels ran, produced 0 leads) → `blendedCostPerLead`
  is `null` → renders `—` (the §B rule at the blended level).
- `blendedSpend`/`blendedClicks` — see the amendment below. (This bullet originally
  read "gate and values are **untouched**"; superseded during implementation.)

> **Amended 2026-08-06 (implemented in PR #204, commit `539f69b`):** Meta is excluded
> from **all four** blended figures — Spend and Clicks as well as Leads/CPL — not just
> Leads/CPL as this section originally scoped. The blend base is uniformly the
> lead-bearing channels (Paid Search + LinkedIn) so the four tiles reconcile
> (`Cost per Lead = blendedSpend ÷ blendedLeads`); Meta appears only in the
> per-channel breakdown and the trend chart, captioned accordingly. This reverses the
> "blendedSpend/blendedClicks untouched" invariant above and means **"Blended Spend"
> no longer equals total paid spend** for a client running Meta. **Requires Dianna/team
> sign-off** (they owned the original all-channel blend decision) — tracked in
> `docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md`.

### B. Overview UI — `components/report-sections/paid-media/overview/index.tsx`

Restore the original item-11a metric order on the top line:
**Spend · Clicks · Leads · Cost per Lead** (a 4-tile row). `null → '—'` via the
existing `asMoney`/`asNum` helpers (add `asMoney` handling for `blendedCostPerLead`).

Add a caption bound to the Leads/CPL pair (satisfies "point out it's for those two
channels specifically"):

> Leads and Cost per Lead are blended across **Paid Search and LinkedIn only** —
> Meta lead conversions aren't tracked, so Meta is excluded from these two figures.

The existing blended Spend/Clicks caption ("shown only when every channel this
client runs reports") stays as-is. The per-channel By-Channel breakdown is unchanged
(it already shows per-channel Leads: Paid Search real, LinkedIn `0`, Meta `—`).

### C. Null-safe cost-per-lead (all Paid Media) — the "$0.00 → —" fix

**One rule:** a cost-per-lead with `leads <= 0` (or an absent source value) renders
`—`, never `$0.00`.

**New helper — `lib/paid-media/format.ts`:**
```ts
export const DASH = '—'
/** Cost per lead, or '—' when there are no leads (undefined ratio, not $0). */
export function costPerLead(cost: number, leads: number): string {
  return leads > 0 ? money(cost / leads) : DASH
}
```

**Money-KPI null convention (for KPI cards):** allow a money `Kpi.value` to be `null`
and have `KpiGrid` render `—` for it. In `components/report-sections/paid-search/kpi-grid.tsx`:
```ts
const isMoney = k.format === 'money'
// ...
value={isMoney ? (k.value == null ? DASH : money(k.value as number)) : k.value}
```
(`Kpi.value` type widens to `number | string | null`; `lib/paid-search/types.ts`.)

**Apply at every cost-per-lead site:**
| Surface | File | Change |
|---|---|---|
| Paid Search KPI | `lib/paid-search/kpis.ts` | `cpl = leads ? cost/leads : null`; card carries `null` when no leads |
| Paid Search campaign table | `components/report-sections/paid-search/campaign-table.tsx` (+ `lib/paid-search/campaigns.ts` total) | row + total CPL via `costPerLead(cost, leads)` |
| Paid Search keyword table | `lib/paid-search/keywords.ts` (`summarize` total) + `components/.../keywords-table-client.tsx` (rows) | CPL via `costPerLead(...)` |
| LinkedIn KPI | `lib/linkedin/kpis.ts` | `costPerLead` card value `null` when `oneClickLeads === 0` (don't trust the native `oneClickLeadsCost` when leads = 0) |
| LinkedIn creative table | `lib/linkedin/creative.ts` + `components/report-sections/linkedin-ads/creative-table-client.tsx` | `costPerLead` cell → `—` when `leads === 0` |
| Blended (Overview) | §A/§B | `blendedCostPerLead == null → '—'` |

Note the LinkedIn KPI keys the dash off the **leads count** (`oneClickLeads`), not the
native `oneClickLeadsCost` value, so it's robust whether Supermetrics returns `null`
or `0`.

## 4. Testing

- `lib/paid-media/overview.test.ts` — new cases:
  - PS + LI configured & report → `blendedLeads = PS + LI`; `blendedCostPerLead =
    (PS spend + LI spend) / (PS leads + LI leads)`.
  - Meta configured but lead-less / failed → does **not** blank `blendedLeads`/CPL.
  - A configured lead-bearing channel (e.g. LinkedIn) failing → both `null`.
  - `blendedLeads === 0` → `blendedCostPerLead === null`.
  - Non-configured LinkedIn → blend is Paid Search alone; still not blanked by Meta.
- `lib/paid-media/format.test.ts` — `costPerLead(100, 4) === money(25)`;
  `costPerLead(100, 0) === '—'`; `costPerLead(0, 0) === '—'`.
- `components/report-sections/paid-search/kpi-grid.test.tsx` — a money KPI with
  `value: null` renders `—` (not `$0.00`, not `$NaN`).
- `components/report-sections/paid-media/overview/index.test.tsx` — top line shows
  Leads + Cost per Lead tiles; the "Paid Search and LinkedIn only" caption renders;
  a 0-blended-leads fixture shows `—` for CPL.

All under the existing `vitest.config.ts` include paths (`lib/paid-media/**`,
`components/report-sections/**`). `check:rsc` + `tsc` must stay green.

## 5. Seed / config reconciliation

`scripts/seed.ts` for Renaissance has **no `linkedinConfig`** and `enabledReports`
omits `paid-media`/`linkedin` — but the **live DB** evidently has both (live LinkedIn
spend + the dashboard shows LinkedIn under Paid Media). The feature reads live
per-client config, so behavior is correct regardless; add a task to **reconcile
`seed.ts`** with the live Renaissance config (add `linkedinConfig` + `paid-media`) so
the seed stops lying and #188's "no LinkedIn config" test example is corrected.

## 6. Governance — reverses RESOLVED 1

Re-adding blended Leads/CPL reverses the #188 spec's **RESOLVED 1** (recorded as a
Dianna/team decision, 2026-08-04, that blended Leads/CPL were dropped *permanently*
and the fields removed). This is directed by Paul, 2026-08-06. Required doc updates:
- `docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md` — record the
  new decision: blend **re-added, scoped to Paid Search + LinkedIn**, Meta excluded;
  rationale (LinkedIn tracking valid, will populate on native Lead Gen Form adoption —
  buyer-confirmed; Meta genuinely untracked).
- `docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md` — annotate
  RESOLVED 1 as superseded by this spec.
- **Loop in Dianna/team** for awareness, since the original drop was attributed to
  them. (This lands via the normal flow; Dianna QAs on staging.)

## 7. Branch flow

`feat/paid-media-blended-leads` → its own PR → Stage-1 code review (Paul + Thomas) →
`dev`. Stacks on merged #188. Then rides the next `dev → staging` promotion. Standalone
review-record doc at `docs/qa/paid-media-blended-leads-code-review.md` per CLAUDE.md.
