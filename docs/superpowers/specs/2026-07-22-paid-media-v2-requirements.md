# Paid Media v2: Initial Requirements

**Date:** 2026-07-22
**Branch:** `ave-z-reporting-paid-media-v2`
**PR:** #164 (base `dev`)
**Status:** Requirements captured. No design decisions made, no code changed.

This document records the initial requirements as given, plus what was verified
in the codebase against each one. It deliberately does **not** propose
solutions. Open questions are listed as open rather than assumed away. A design
doc follows separately once those are answered.

Nav location: sidebar → Reports → **Paid Media**, which today expands to
Paid Search, Meta Advertising, LinkedIn Advertising
(`PAID_MEDIA_SUBSECTIONS`, `lib/constants.ts:174`).

---

## The requirements, as given

1. Add an Overview subpage for Paid Media that shows a rollup of performance
   across Paid Search, Meta & LinkedIn subpages.
2. On Paid Search subpage, add "Total Leads" to the top of the "Leads by Action"
   table and at the bottom of the "Region → DMA Breakdown" table. These values
   should be a sum of the subtotals in the tables.
3. On Paid Search subpage, add a default filter view to the keyword table at the
   bottom for the column "Clicks" and filter to 10 clicks or more.
4. On Meta Advertising subpage, investigate the calculation of "Cost / LPV" and
   verify it's correctly displaying.
5. On Meta Advertising subpage, the "Top Regions by Spend" chart's "Spend" value
   formatting should be $X,XXX.XX.
6. Take a look at LinkedIn subpage - if there are any API issues.

---

## What was verified, per requirement

### 1. Paid Media Overview subpage

**Where:** `lib/constants.ts:174` (`PAID_MEDIA_SUBSECTIONS`).

**Verified:** there is no Overview today. The three entries are Paid Search
(`id: null`), Meta (`id: 'meta'`), LinkedIn (`id: 'linkedin'`). By contrast
`AEO_SUBSECTIONS` and `GA4_SUBSECTIONS` both use `id: null` for Overview, so
Paid Media is the outlier. Adding an Overview at `id: null` moves Paid Search
to its own id and changes which subsection Paid Media lands on by default.

**Open:** which metrics the rollup shows, and whether Paid Search or the new
Overview becomes the default landing subsection.

### 2. Total Leads rows

**Where:** `components/report-sections/paid-search/leads-section.tsx:32`
and `components/report-sections/paid-search/geo-section.tsx:49`.

**Verified, Leads by Action:** unambiguous. `transformLeads`
(`lib/paid-search/leads.ts:17-19`) derives `categoryTotals` and `totalLeads`
from the same `byAction` array, so `totalLeads` already equals the sum of the
three category subtotals exactly.

**Verified, Region → DMA:** ambiguous. The table renders `rows.slice(0, 10)`
(`geo-section.tsx:14`), but `rows` holds every region, and the KPI card directly
above it displays the true `Total Regions` count (`geo-section.tsx:33`). A total
summing only the 10 visible rows would sit under a card advertising more regions
exist.

**Open:** whether the geo total sums the 10 displayed regions or all regions.

### 3. Default Clicks filter on the keyword table

**Where:** `components/report-sections/paid-search/keywords.tsx`,
`components/charts/data-table.tsx`.

**Verified:** `DataTable` supports sorting only. It has no filtering of any
kind. `keywords.tsx` is a Server Component and already passes declarative
`sortKey` values rather than `sortValue` functions, because functions cannot
cross the RSC boundary.

**Open:** whether "default filter view" means a user-adjustable control that
defaults to 10, or a fixed cutoff the viewer cannot change. Also whether
filtering belongs on the shared `DataTable` (used across the app) or local to
this one table.

### 4. Cost / LPV: confirmed incorrect

**Where:** `lib/meta/kpis.ts:53`.

**Verified by execution**, not by reading. The KPI applies `Math.round()` to
`cost_per_landing_page_view`, which is a small dollar figure, so rounding
destroys it:

| API value | Cost / LPV displays | CPC, same input |
|---|---|---|
| `1.92` | `$2` | `$1.92` |
| `0.42` | `$0` | `$0.42` |
| `3.50` | `$4` | `$3.50` |
| `0.08` | `$0` | `$0.08` |
| `12.75` | `$13` | `$12.75` |

CPM (`kpis.ts:42`) and CPC (`kpis.ts:43`) both use `+n(...).toFixed(2)`.
Cost / LPV is the only per-unit cost KPI using `Math.round`. It is also the only
one the test file never asserts on: `lib/meta/kpis.test.ts` covers spend, reach,
engagement rate and CTR, and its fixture carries
`cost_per_landing_page_view: '1.92'` without checking the output.

**Open:** whether to keep reading Meta's `cost_per_landing_page_view` field or
derive the value as `cost / landing_page_views`. Both inputs are already
fetched (`kpis.ts:79-91`).

### 5. Top Regions by Spend formatting

**Where:** `components/report-sections/meta-ads/geo-section.tsx`.

**Verified:** the chart never passes a format, so Spend renders unformatted.
`BarChart` accepts `valueFormat?: 'currency'`, a string descriptor written
specifically so it survives the RSC boundary
(`components/charts/bar-chart.tsx:15-24`). However `usd()`
(`lib/supermetrics/format.ts`) is `'$' + Math.round(n).toLocaleString('en-US')`,
which yields whole dollars. No two-decimal currency formatter exists today, so
the requested `$X,XXX.XX` cannot be produced by wiring up the existing option
alone.

Constraint: `meta-ads/geo-section.tsx` is a Server Component (no `'use client'`),
unlike the Paid Search geo section. Passing a formatter **function** would trip
the `check:rsc` CI gate, which exists to catch exactly that crash.

**Open:** whether two-decimal currency applies only to this chart or becomes a
shared formatter used elsewhere.

### 6. LinkedIn API issues

**Where:** `lib/linkedin/`, `components/report-sections/linkedin-ads/`.

**Verified:** cannot be confirmed from local. `SUPERMETRICS_API_KEY` is one of
the 29 of 31 Vercel env vars stored as type `sensitive` (write-only), so it
pulls back empty and no live LinkedIn call can be made locally. Static review of
`lib/linkedin/base.ts` against `lib/meta/base.ts` is possible; reproducing an
actual API failure is not.

**Open:** the observed symptom. What was seen, on which client and date range,
determines whether this is auth, a field-name mismatch, an empty-result path, or
a timeout.

---

## Environment note

Local dev is pointed at the **dev** Neon project, matching the `ENGINEERS.md`
rule that Preview maps to the dev database and Production maps to prod. The
supplied credential is the `neondb_owner` role and carries full write access.
It could not be constrained to read-only from the client side: Neon's HTTP
driver ignores `options=-c default_transaction_read_only=on`, verified by
checking `current_setting('transaction_read_only')`, which stays `off`.

What that means in practice:

- Schema changes are structurally blocked. `drizzle.config.ts:11` reads
  `DATABASE_URL_UNPOOLED`, which is intentionally left empty, so `db:migrate`
  and `db:studio` cannot run.
- Row writes are **not** structurally blocked. The `db:seed*` and
  `db:enable-commentary-*` scripts read `DATABASE_URL`. They are not to be run
  during this work.
- A hard guarantee would require a dedicated read-only role created in Neon.

---

## Explicitly not decided

No approach, architecture, or implementation has been chosen for any of the six
items. Requirement 4 has a confirmed root cause but no agreed fix. Requirements
1, 2, 3 and 5 each carry an open question above that must be answered before a
design doc is written.
