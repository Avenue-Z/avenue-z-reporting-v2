# Meta Ads — Expandable Campaign → Ad Set → Ad Table

**Date:** 2026-06-24
**Status:** Approved (design)
**Area:** `components/report-sections/meta-ads`, `lib/meta`

## Problem

The Meta Ads section shows a flat ad-level table (`CreativeTable`). Stakeholders
want to browse the data hierarchically, the way Triple Whale presents it: top-level
**Campaign** rows that expand to reveal indented **Ad Set** rows, which in turn
expand to reveal indented **Ad** rows. The reference screenshots are an interaction
reference only — the column set stays as our existing Meta columns.

## Scope

In scope:
- Convert the flat ads table into a 3-level expandable tree: Campaign → Ad Set → Ad.
- Keep the existing Meta columns.
- Interactive column sorting that preserves the hierarchy.

Out of scope:
- Adopting Triple Whale columns (ROAS, CV, NCV, Purchases, CPA, etc.).
- Status toggles, budget editing, the edit pencil (Triple Whale write actions — we are read-only).
- Lazy/per-level loading (data volume is small; single query + client grouping).

## Columns

Leading **name** column + Spend, Impressions, Reach, Frequency, Link Clicks,
CTR, CPC, LPV, Cost / LPV, Engagements, Share of Spend, Status.

The leading column is labeled **"Campaign"** (matching the screenshots) and holds the
node's name at each level: campaign name on campaign rows, ad set name on ad-set rows
(indented), ad name on ad rows (indented further). This **replaces** the flat table's
two separate "Ad Name" + "Campaign" columns — they merge into this one hierarchical name
column. All metric columns are unchanged from the current table.

## Data Loading

**One query, group client-side.** The existing `getCreativeRows` query already pulls
ad-level rows including `adcampaign_name` and `ad_name` plus all metrics. Add
`adset_name` to that query. No additional network calls; expand/collapse is purely
client-side and instant. Appropriate for the small data volume (~3 campaigns).

## Data Model

```
AdRow        // = today's CreativeRow (ad-level)
AdSetNode    { name: string; metrics; ads: AdRow[] }
CampaignNode { name: string; metrics; adSets: AdSetNode[] }
```

`metrics` is the same numeric shape used by `CreativeRow` (spend, impressions, reach,
frequency, linkClicks, ctr, cpc, lpv, costPerLpv, engagements, shareOfSpend).

### `buildCreativeTree(rows: Record<string,string>[]): CampaignNode[]`

Pure function (lives in `lib/meta/creative.ts`, unit tested). Steps:

1. Transform raw rows into ad-level rows (reuse existing `transformCreative` logic,
   now also reading `adset_name`).
2. Group ads by campaign, then by ad set.
3. Aggregate metrics bottom-up.

### Aggregation rules

Parent (campaign, ad set) metrics are computed from their children — never from the
screenshots' numbers:

- **Summed:** spend, impressions, reach, linkClicks, lpv, engagements.
- **Derived (recomputed at each level from the sums):**
  - CTR = linkClicks / impressions × 100
  - CPC = cost / linkClicks
  - Frequency = impressions / reach
  - Cost / LPV = cost / lpv
- **Share of Spend:** share of the **grand-total** spend at every level. Campaign rows
  therefore sum to 100%; ad-set and ad rows sum to their fraction of the whole.
- **Status:** shown only on ad rows (true Meta ad status). Campaign and ad-set rows leave
  Status blank — an aggregated status would be misleading and we are read-only.

Note on Frequency/reach: reach is not truly additive across ad sets (a user reached in
two ad sets is double-counted when summed). We accept this approximation — it mirrors the
existing flat totals row, which already computes `impressions / summed reach`.

## Component

A **dedicated client component** rewrites `components/report-sections/meta-ads/creative-table.tsx`.
The generic `DataTable` is flat and shared by other sections, so it is left untouched;
the new component owns the tree rendering, expand/collapse, and sorting.

Responsibilities:
- Render header row (existing column styling), tree body, and grand-totals row at the bottom.
- **Expand/collapse state:** all collapsed by default (only campaign rows visible). Clicking a
  campaign reveals its ad-set rows indented one level; clicking an ad set reveals its ad rows
  indented a further level. Chevron affordance (▸ collapsed / ▾ expanded) + left padding per depth.
- **Interactive sorting:** clicking a column header sorts within each group independently —
  campaigns among themselves, ad sets within their parent campaign, ads within their parent ad set —
  preserving the hierarchy. Default sort: Spend desc. Reuse the existing `sortRows` helper logic
  where practical.
- Formatting reuses `usd`, `num`, `pct` from `lib/supermetrics/format`, matching the current table.

Styling matches the existing `DataTable`: rounded border, `bg-bg-surface`, uppercase
muted header, row hover, totals row with top border.

## Testing

Extend `lib/meta/creative.test.ts` (lightweight `node:assert` style):
- `buildCreativeTree` produces correct nesting (campaign → ad set → ad counts).
- Parent metrics: summed fields sum correctly; derived fields (CTR, CPC, Frequency, Cost/LPV)
  are recomputed, not summed.
- Share of Spend: campaign-level shares sum to 100; an ad's share equals its spend / grand total.
- Existing flat assertions (`transformCreative`, `creativeTotals`) keep passing.

Manual verification: load `/dashboard/renaissance/reports/meta-ads`, confirm campaigns expand to
ad sets and ad sets to ads with correct indentation and aggregated numbers.

## Files Touched

- `lib/meta/types.ts` — add `AdSetNode`, `CampaignNode` (and `adSet` field on the ad row if needed).
- `lib/meta/creative.ts` — add `adset_name` to query; add `buildCreativeTree`; keep `transformCreative`/`creativeTotals`.
- `lib/meta/creative.test.ts` — add tree tests.
- `components/report-sections/meta-ads/creative-table.tsx` — rewrite as expandable tree client component.
- `components/report-sections/meta-ads/index.tsx` — pass the tree (or raw rows) into the new component.
</content>
