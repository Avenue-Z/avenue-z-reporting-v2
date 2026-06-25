# Organic Social — Independent Suspense Streaming — Design

**Date:** 2026-06-25
**Branch:** `feat/organic-social-suspense-split`

## Problem

`OrganicSocialReport` ([components/report-sections/organic-social/index.tsx](../../../components/report-sections/organic-social/index.tsx))
is a single async server component that `Promise.all`s three data fetches
(platform headlines, engagement trend, top content) and then renders. The
`OrganicSocialSynopsis` is rendered **without** a Suspense boundary, so its slow
Glean-backed call is awaited during the parent's render and blocks the entire
section. Result: nothing paints until all three Dash Social fetches **and** the
Glean synopsis resolve — the slowest path gates everything.

## Goal

Each section streams in independently behind its own Suspense boundary and
layout-matching skeleton. The slow executive synopsis no longer blocks the three
display sections; a slow/failed section no longer blocks its siblings.

## Approach

Turn `OrganicSocialReport` into a non-awaiting **layout** that renders four
independent `<Suspense>` boundaries. Each boundary wraps an async server
component that fetches its own data and renders the corresponding display
component (or an error fallback).

### 1. Section wrappers (async server components)

One wrapper per section. Each fetches its own data, handles timeout/error, and
renders the display component:

- `HeadlinesSection(clientSlug, dateRange, compareRange)` → `getPlatformHeadlines` → `<PlatformHeadlines>`
- `TrendSection(clientSlug, dateRange)` → `getEngagementTrend` → `<EngagementTrend>`
- `TopContentSection(clientSlug, dateRange)` → `getTopContent` → `<TopContent>`
- `OrganicSocialSynopsis(clientSlug, dateRange, compareRange)` → fetches all three (cached) + Glean

`EngagementTrend` and `TopContent` are client components (`'use client'`) that
receive already-fetched data as props; the async server wrapper is what fetches
and passes that data in. `PlatformHeadlines` is a server component but is still
wrapped for symmetry and per-section error isolation.

### 2. Deduplicate shared fetches with `React.cache()`

The synopsis needs all three datasets as inputs, and the three display sections
each need one. The three fetchers (`getPlatformHeadlines`, `getEngagementTrend`,
`getTopContent`) are **not** currently wrapped in `React.cache()`, so four
independent boundaries would issue duplicate requests.

Wrap each of the three fetcher exports in `React.cache()`. `cache()` is scoped to
a single render/request, so all boundaries in the same request share one
in-flight promise per fetcher — **3 fetches total**, regardless of how many
boundaries consume them. The synopsis and the `HeadlinesSection` must call
`getPlatformHeadlines(clientSlug, dateRange, effectiveCompare)` with identical
arguments (`effectiveCompare = compareRange ?? 'previous_period'`) for the cache
to hit.

### 3. `OrganicSocialReport` becomes a streaming layout

```tsx
export function OrganicSocialReport({ clientSlug, dateRange = 'last_30_days', compareRange = null }) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<SynopsisSkeleton/>}>
        <OrganicSocialSynopsis clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>
      <Suspense fallback={<HeadlinesSkeleton/>}>
        <HeadlinesSection clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>
      <Suspense fallback={<TrendSkeleton/>}>
        <TrendSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
      <Suspense fallback={<TopContentSkeleton/>}>
        <TopContentSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
    </div>
  )
}
```

The component no longer `await`s at the top level, so it returns immediately and
its children stream as their data resolves. Note: it is no longer `async`.

## New skeleton components (layout-matching, no layout shift)

Created in a single `components/report-sections/organic-social/skeletons.tsx`:

- `SynopsisSkeleton` — mirrors the synopsis card shell (green `#60FF80` Sparkles
  header + pulsing text lines), matching `synopsis.tsx`. Same shape as the
  peec-ai `SynopsisSkeleton` precedent.
- `HeadlinesSkeleton` — a platform label bar + a 5-up KpiCard grid
  (`grid-cols-2 md:grid-cols-5`) of pulsing card placeholders.
- `TrendSkeleton` — title bar + a row of pill placeholders + a chart-area block.
- `TopContentSkeleton` — view-toggle placeholders + ~5 pulsing table rows.

## Error handling

The existing `safe()` wrapper and `Fallback` component move into the section
wrappers, so each section renders its own timeout/error card
("Taking longer than usual…" / "Couldn't load this section.") without affecting
siblings.

The synopsis preserves today's behavior: it renders **nothing** (`null`) if any
of its three input fetches fails — mirroring the current
`headlines.data && engagement.data && top.data` guard. Its existing internal
try/catch around the Glean call (which shows "Synopsis is temporarily
unavailable…") is retained for the case where inputs succeed but Glean fails.

## Files

- **Modify** `components/report-sections/organic-social/index.tsx` — replace the
  `Promise.all`-then-render body with the Suspense layout; add the three async
  section wrappers (`HeadlinesSection`, `TrendSection`, `TopContentSection`) and
  the shared `safe()`/`Fallback` helpers.
- **Modify** `components/report-sections/organic-social/synopsis.tsx` — change
  `OrganicSocialSynopsis` props from receiving `headlines`/`trend`/`top` data to
  receiving `clientSlug`/`dateRange`/`compareRange`; fetch the three cached
  datasets internally; render `null` on input-fetch failure.
- **Modify** `lib/organic-social/headlines.ts`, `lib/organic-social/trends.ts`,
  `lib/organic-social/top-content.ts` — wrap the `getPlatformHeadlines`,
  `getEngagementTrend`, `getTopContent` exports in `React.cache()`.
- **Create** `components/report-sections/organic-social/skeletons.tsx` — the four
  skeleton components.

No router changes: the two report routers already render `<OrganicSocialReport>`
unchanged; the Suspense boundaries live inside it.

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` succeeds.
- Behavior: the three display sections paint as soon as their (cached) Dash
  Social data resolves, each showing its skeleton until then; the synopsis
  streams in behind its own skeleton without blocking the others. A single slow
  or failed section shows its skeleton/fallback while siblings render normally.
- Network: confirm exactly one request per fetcher per render (no duplication
  from the synopsis + display sections sharing inputs).
