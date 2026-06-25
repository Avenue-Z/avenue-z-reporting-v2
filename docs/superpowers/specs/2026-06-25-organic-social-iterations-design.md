# Organic Social — Iterations Design

**Date:** 2026-06-25
**Branch:** `feat/organic-social-iterations`
**Status:** Approved

## Summary

Four user-requested improvements to the Organic Social report section:

1. Add a date-range picker (and show the resolved start/end window) so the
   section is no longer locked to `last_30_days`.
2. Add an AI Executive Synopsis at the top, mirroring the AEO section exactly.
3. Add a follower-growth line graph with the same interactive per-channel
   toggle as the existing engagement graph.
4. Make top-performing posts link out to the live post, with URLs pulled from
   Dash Social.

## Context (current state)

- The section component is `components/report-sections/organic-social/`
  (`index.tsx`, `platform-headlines.tsx`, `trends.tsx`, `top-content.tsx`).
- Data lives in `lib/organic-social/` (`base.ts`, `metrics.ts`, `trends.ts`,
  `top-content.ts`, `headlines.ts`, `types.ts`) over the Dash Social client
  (`lib/dash-social/`).
- `OrganicSocialReport` already accepts `dateRange` and `compareRange` props
  and fetches headlines, engagement trend, and top content in parallel via a
  `safe()` wrapper with per-block fallbacks.
- In BOTH combined reports pages
  (`app/dashboard/[clientSlug]/reports/page.tsx` and
  `app/portal/[clientSlug]/reports/page.tsx`) the `GA4DatePicker` is rendered
  only for `ga4`, `inbound-funnel`, `peec-ai`, and `paid-media` — NOT
  `organic-social`. That omission is why the section is stuck on the default
  `last_30_days`.
- `GA4DatePicker` (`components/report-sections/ga4/date-picker.tsx`) already
  displays the resolved window (e.g. "Jun 1 – Jun 30, 2026") via
  `formatResolvedRange`.
- The AEO Executive Synopsis is `lib/peec/synopsis.ts` (Glean-backed, cached
  1h, returns `{ synopsis, actions }`) rendered by
  `components/report-sections/peec-ai/overview-synopsis.tsx`.
- Dash `media/v2` posts DO carry per-platform permalinks (verified against the
  `lib/organic-social/__fixtures__/media-v2.json` fixture):
  `instagram.url`, `facebook.url`, `twitter.permalink_url`,
  `linkedin.linkedin_link`. Some can be null.

## Decisions

- **Follower graph:** plot cumulative `TOTAL_FOLLOWERS` per day per channel
  (the rising audience-size curve), not net-new.
- **Post links:** pull from Dash only. Clickable when a URL exists; plain text
  when null. No manual-input UI, no new storage.
- **Synopsis:** top of the section, mirror AEO exactly (2–3 paragraph synopsis
  + "Recommended actions" list), Glean-backed, cached 1h.

## Detailed Design

### 1. Date range picker + visible window

Add `organic-social` to the `GA4DatePicker` render condition in the header of
BOTH combined reports pages. No new component; the picker already surfaces the
resolved start/end dates the user needs to reconcile against Dash. Default
stays `last_30_days`. `OrganicSocialReport` already consumes the props, so the
only change is the header gate.

### 2. Executive Synopsis (mirror AEO)

- New `lib/organic-social/synopsis.ts`, modeled on `lib/peec/synopsis.ts`:
  - `buildContext(...)` summarizes the data already fetched by the section —
    platform headlines (followers, net-new, exposure, engagements, engagement
    rate, and deltas where present), the engagement/follower trend shape, and
    the top content — into a plain-text block.
  - Calls `gleanChat(prompt, { saveChat: false })`, parses with the same
    robust JSON extractor pattern, returns `{ synopsis, actions }`.
  - Wrapped in `cached('glean', 'getOrganicSocialSynopsis', impl, { version,
    ttlSeconds: 3600, extractTags: ([clientSlug, dateRange]) => ({ client,
    dateRange }) })`.
- New `components/report-sections/organic-social/synopsis.tsx`, an RSC reusing
  the AEO visual verbatim (Sparkles header, paragraphs, "Recommended actions"
  list). Own try/catch; on failure renders the same "temporarily unavailable"
  note so the rest of the section is unaffected.
- Rendered FIRST in `index.tsx`, above platform headlines.

### 3. Follower-growth line graph

- New `getFollowerTrend(slug, dateRange)` in `lib/organic-social/trends.ts`,
  structurally identical to `getEngagementTrend` but using each channel's
  `TOTAL_FOLLOWERS` metric (GRAPH / DAILY, one request per channel). Returns
  the same `TrendSeries` shape.
- Refactor `EngagementTrend` (`trends.tsx`) into a shared internal chart
  component that owns the per-channel toggle legend and takes a `title` and a
  `TrendSeries`. Render two instances: "Engagement Over Time" and "Follower
  Growth". Both get identical interactive toggles.
- `index.tsx` fetches the follower trend in parallel via the existing `safe()`
  wrapper, with its own fallback block.

### 4. Clickable top-post links

- Add `url: string | null` to `TopContentRow` in `types.ts`.
- In `transformTopContent` (`top-content.ts`), extract the per-platform
  permalink inside (or alongside) `metricsFor`:
  `instagram.url` / `facebook.url` / `twitter.permalink_url` /
  `linkedin.linkedin_link`, coalescing to `null`.
- In `top-content.tsx`, render the (truncated) caption as an external anchor
  (`target="_blank"`, `rel="noopener noreferrer"`) when `url` is non-null;
  otherwise render the existing plain text.

## Testing

- Extend `lib/organic-social/top-content.test.ts` to assert URL extraction per
  platform from the existing `media-v2.json` fixture, including a null case.
- Add a follower-trend test mirroring existing engagement-trend test patterns
  (transform shape, channel ordering, missing-channel handling).
- Synopsis: a light test that `buildContext` includes key headline numbers.
  The Glean call itself is not unit-tested (consistent with AEO).

## Out of Scope

- Manual URL entry / persistence for posts with no Dash URL.
- Net-new-followers view (cumulative only).
- Any change to report sections other than Organic Social.
- Changes to the per-`reportSlug` standalone page
  (`reports/[reportSlug]/page.tsx`), which already renders a date picker via
  `ReportDateRange`; this work targets the combined `/reports` pages where the
  gap exists.
