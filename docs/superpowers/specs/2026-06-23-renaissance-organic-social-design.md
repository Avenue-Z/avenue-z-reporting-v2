# Renaissance Organic Social + Influencer — Design Spec

**Date:** 2026-06-23
**Module:** Organic Social + Influencer (Module 4 of the Renaissance Dashboard Additions PRD — Phase 2)
**Source PRD:** `renaissance_dashboard_additions_prd.md` (§4)
**Status doc:** `docs/superpowers/renaissance-dashboard-status.md` (Module 4)
**Branch:** `feat/renaissance-organic-social` (off `feat/renaissance-dashboard`)
**Status:** Approved design — ready for implementation plan.

---

## 1. Context

Fourth and final module of the Renaissance Dashboard Additions PRD. It reports
**organic social performance** for Renaissance across Instagram, Facebook,
LinkedIn, and X. Unlike Modules 1–3 (paid; Supermetrics-sourced), this module's
data source is **Dash Social**, which is **not a Supermetrics connector** — it
requires a **net-new API client** (gate B3), built like `lib/ga4` / `lib/hubspot`.

The PRD ultimately wants a *merged* Organic Social **+ Influencer** view. This
spec scopes **v1 to the organic side**, structured so influencer data rolls into
the same view later without restructuring (see §3, §8).

### Data source — validated against a working reference

Dash Social has a public developer API (`developer.dashsocial.com`) **and** a
proven internal reference implementation: the **`dash-social-connection`** Python
project (a Glean indexer) already wraps this exact API. Its
`src/dashsocial/client.py` and `docs/dash-api-map.md` (live-probed field shapes)
are the authoritative reference for the TypeScript connector.

Confirmed facts from that reference:

- **Auth:** `Authorization: Bearer <token>`; env var `DASH_API_TOKEN`. The token
  is **multi-brand** (one key; `brand_id` selects the brand). Same token works
  across all Dash hosts.
- **Hosts / endpoints used here:**
  - `dashboard.dashsocial.com` — `GET /reports/data` (analytics: KPI totals +
    daily time series).
  - `library-backend.dashsocial.com` — `PUT /brands/{brand_id}/media/v2` (per-post
    content for top-content).
  - `auth.dashsocial.com` — `GET /api/self` (brand discovery; not needed at
    runtime once `brand_id` is configured).
- **`/reports/data`** required params: `channels`, `brand_ids`, `metrics`,
  `report_type`, `start_date`, `end_date`. `report_type=GRAPH` + `time_scale=DAILY`
  returns per-channel per-metric daily series; `report_type=TOTAL_METRIC` with
  `context_start_date`/`context_end_date` returns the aggregate **and a Dash-computed
  prior-period delta**.
  - Confirmed-working metrics (Instagram): `TOTAL_FOLLOWERS`, `NET_NEW_FOLLOWERS`,
    `FOLLOWER_GROWTH_RATE`, `PROFILE_VIEWS`, `IMPRESSIONS`, `TOTAL_ENGAGEMENTS`.
    `REACH` is **not** valid for IG/TikTok (use `ACCOUNTS_REACHED`).
  - **Channel enum excludes LinkedIn** (FACEBOOK, INSTAGRAM, TWITTER, TIKTOK,
    YOUTUBE, PINTEREST). See §6 LinkedIn decision.
- **`/media/v2`** returns per-post records with per-platform sub-objects
  (`data.instagram`, `data.facebook`, `data.linkedin`, `data.twitter`, …). Each
  carries engagement/impressions/reach and a Dash proprietary `effectiveness`
  score (0–1). LinkedIn posts **do** come through here.

---

## 2. Goals / Non-Goals

### Goals
- Single scrolling Organic Social report for Renaissance, reusing the existing
  dashboard design system and global date-range + prior-period model.
- Blended KPI scorecards, per-channel contribution, multi-series follower-growth
  and engagement trends, and a cross-channel top-content table.
- A net-new `lib/dash-social/` connector modeled on the proven Python client.
- Data layer shaped so **influencer rolls into the same view later** (a
  `sourceType` field; a "Source Type" column already present).

### Non-Goals (v1)
- **Influencer** KPIs/content (deferred to Phase 2b — source not yet confirmed).
- LinkedIn **audience/follower KPIs and trends** (Dash reports surface excludes
  LinkedIn; LinkedIn is top-content-only in v1).
- Community/inbox/sentiment surfaces (`community.dashsocial.com`).
- Multi-subpage or tabbed experience — one scrolling page.
- Top formats/themes breakdown (PRD nice-to-have; deferred).

---

## 3. Scope decisions (approved 2026-06-23, Paul)

1. **Organic-first, influencer-ready.** Build the full organic side now. The
   data layer carries `sourceType: 'organic' | 'influencer'` and the top-content
   table renders a "Source Type" column, so influencer integrates later with no
   restructuring.
2. **`organic-social` is a top-level Reports nav entry** (not grouped under Paid
   Media).
3. **LinkedIn is top-content-only in v1.** LinkedIn appears in the top-content
   table (via `/media/v2`) but not in KPI scorecards / channel contribution /
   trends, because Dash's `/reports/data` channel set excludes LinkedIn. The
   spike will confirm; if LinkedIn audience metrics turn out to be reachable,
   it gets promoted into the KPI/trend surfaces.
4. **Trends are multi-series** — one follower-growth chart and one engagement
   chart, a color-coded line per channel.

---

## 4. Architecture

Follows the established Renaissance module pattern exactly:

```
route → async RSC orchestrator (safe() per-section isolation)
      → lib/organic-social/ data layer (pure tested transforms + thin fetchers)
      → lib/dash-social/ connector (HTTP client; the only new infra)
      → presentational components (reuse KpiCard/KpiGrid, line chart, DataTable)
```

### 4.1 Connector — `lib/dash-social/`

| File | Responsibility |
|---|---|
| `client.ts` | `dashFetch`-style client. Bearer auth via `DASH_API_TOKEN`; per-host base URLs; `next: { revalidate: 3600 }` cache; timeout; retry w/ exponential backoff; 429 honors `Retry-After`. Methods: `getReportsData(...)`, `getMedia(...)`. |
| `types.ts` | Typed `/reports/data` (GRAPH + TOTAL_METRIC) and `/media/v2` responses. No `any`. |

Error types: `DashApiError`, `DashAuthError` (401/403), `DashRateLimitError`
(429 after retries), `DashTimeoutError` (the orchestrator keys section-timeout
fallback off this). Mirrors `dash-social-connection/src/dashsocial/client.py`.

### 4.2 Data layer — `lib/organic-social/`

| File | Responsibility |
|---|---|
| `base.ts` | Channel name ↔ Dash enum mapping; formatters (`num`/`pct`); `resolveCompareIso`; shared row/series types incl. `sourceType`. |
| `kpis.ts` | Blended KPI scorecards. `report_type=TOTAL_METRIC` + context dates → value + prior-period delta per metric. |
| `channels.ts` | Per-channel contribution rows (followers, net-new, engagements, eng-rate per platform). |
| `trends.ts` | `report_type=GRAPH`, `time_scale=DAILY` → multi-series follower-growth + engagement (one series per channel). |
| `top-content.ts` | `/media/v2` → ranked posts; normalizes each platform sub-object into one row shape; tags `sourceType='organic'`. |

Each pure transform is unit-tested (`tsx` scripts, repo convention) against
fixtures captured during the spike.

### 4.3 KPI → Dash metric mapping

| PRD KPI | Dash metric | Status |
|---|---|---|
| Total Followers | `TOTAL_FOLLOWERS` | ✓ confirmed |
| Net New Followers | `NET_NEW_FOLLOWERS` | ✓ confirmed |
| Views / Impressions | `IMPRESSIONS` (+ per-platform views) | ✓ confirmed |
| Total Engagements | `TOTAL_ENGAGEMENTS` | ✓ confirmed |
| Profile / Page Views | `PROFILE_VIEWS` | ✓ confirmed |
| Engagement Rate | derived (engagements ÷ impressions or reach) | ⚠ pin denominator in spike |
| Avg. Effectiveness | post-level `effectiveness` (proprietary 0–1) | ✓ confirmed (post-level) |
| Comments / Shares / Saves / Likes/Reactions | per-platform metrics | ⚠ exact `/reports/data` metric names pinned in spike |

### 4.4 Page — `components/report-sections/organic-social/`

`index.tsx` orchestrator (`safe()` + `Promise.all`) renders, top-to-bottom:

1. **KPI Scorecards** — blended totals, prior-period deltas (`KpiCard`/`KpiGrid`).
2. **Channel Contribution** — per-platform mini-table.
3. **Follower Growth** — line per channel.
4. **Engagement** — line per channel.
5. **Top Content** — `DataTable`: Post (thumbnail + caption) · Platform · Source
   Type · Publish Date · Views/Impressions · Engagements; sortable, default
   Engagements desc.
6. *(deferred)* Top Formats/Themes.

Unconnected channel / empty result → empty state, never an error.

---

## 5. Config, nav, migration

- `DashSocialConfig { brandId: number; channels?: string[] }` → jsonb column
  `dash_social_config` (typed in `lib/db/schema.ts`, alongside `meta_config` etc.).
- Auth key is the shared, brand-agnostic `DASH_API_TOKEN` env var (no per-client
  env-var-name indirection needed, unlike Supermetrics `sm_api_key_env_var`).
- Migration **`0010`** adds `dash_social_config`; set Renaissance's row and add
  `organic-social` to `enabledReports`.
- `REPORT_NAMES['organic-social'] = 'Organic Social'`; add `organic-social` to the
  **Reports** `NAV_GROUP` slugs; add a chart color to `CHART_COLORS`.
- Render `organic-social` in both dashboard and portal report routes.

---

## 6. Key decisions

- **LinkedIn top-content-only (v1).** Dash `/reports/data` excludes LinkedIn;
  promoting LinkedIn into KPIs/trends is gated on the spike disproving this.
- **Prior-period deltas come from Dash**, via `TOTAL_METRIC` + context dates —
  no manual two-range reconciliation.
- **`effectiveness` is post-level**; "Avg. Effectiveness" KPI = average across
  the period's posts (confirm whether `/reports/data` also exposes an aggregate).
- **Single shared Dash token** (`DASH_API_TOKEN`), brand selected by config
  `brandId`.

---

## 7. Error handling & testing

- Every section independently `safe()`-wrapped; one failed Dash query never
  crashes the page. Timeout → friendly "shorter range" copy; other errors →
  "Couldn't load this section."
- Pure transforms unit-tested with spike-captured fixtures (`npx tsx`,
  matching the repo's per-file test convention).
- Connector retry/backoff/429 behavior mirrored from the reference client.

---

## 8. Influencer readiness (Phase 2b, deferred)

The merged view is the PRD end-state. v1 makes it cheap to add later:
- `sourceType: 'organic' | 'influencer'` already threads through the data layer.
- Top-content table already renders "Source Type."
- Influencer KPIs (Reach, Views/Impressions, Engagements, Follows) slot into the
  scorecard grid; influencer posts append to top-content.
- **Open:** confirm the influencer source system (Dash Social vs. secondary) and
  its field mapping before building 2b.

---

## 9. Open items / gates (resolve in plan or spike)

- **B3 — live access:** obtain `DASH_API_TOKEN` (available via
  `dash-social-connection/.env`) + Renaissance `brand_id` (via `GET /api/self`).
- **Spike confirmations:**
  - LinkedIn audience coverage in `/reports/data` (decision §6 assumes no).
  - Exact metric names for Comments / Shares / Saves / Likes-Reactions.
  - Engagement-Rate denominator (impressions vs. reach; per Dash's
    `engagement_rate_*` variants).
  - Whether `/reports/data` exposes an aggregate `effectiveness`, or it must be
    averaged from `/media/v2`.
  - Which channels are actually connected for the Renaissance brand.
- **Influencer source** (§8) — deferred.

---

## 10. Acceptance criteria (v1)

- One scrolling Organic Social page, sections in §4.4 order, on the global date
  range with prior-period deltas.
- KPI scorecards blended across connected channels (IG/FB/X; LinkedIn excluded
  per §6).
- Follower-growth and engagement trends render a line per connected channel.
- Top-content table spans all channels **including LinkedIn**, sortable, with a
  "Source Type" column (all `organic` in v1).
- Config-driven via `dash_social_config.brandId`; unconnected channels degrade to
  empty states, not errors.
- Live smoke test against the Renaissance brand.
