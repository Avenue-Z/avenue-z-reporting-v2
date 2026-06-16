# Wire Peec URL-level citations + per-path-per-bot agent analytics

**Date:** 2026-06-12
**Status:** Approved (design)
**Branch:** feat/aeo-overview-enhancements

## Goal

Replace demo-only `null` fields in the AEO report sections with real data from
two Peec customer-API endpoints we already have access to but do not yet call:

- `POST /reports/urls` — URL-level citation data
- `GET /agent-analytics/visits` (grouped by `bot_id` + `request_path`) — per-path-per-bot crawl visits

Both were previously believed to be unavailable. They are not: verified live
against the two real client projects (`or_043…` Avenue Z, `or_60d…` Renaissance)
via `scripts/probe-peec-urls-agents.ts`.

## Verified API shapes (source of truth — docs were wrong)

### `POST /reports/urls`
Request body: `{ project_id, start_date, end_date, limit (≤10000), offset, dimensions?, filters?, order_by? }`

Row shape:
```
{
  url: string,
  classification: string,        // LISTICLE | HOMEPAGE | HOW_TO_GUIDE | ...
  title: string | null,
  channel_title: string | null,
  usage_count: number,
  citation_count: number,
  citation_avg: number,
  retrievals: number,
  retrieval_count: number,
  citation_rate: number,
  mentioned_brands: { id: string }[]   // brand ids (kw_…), NOT a count
}
```
- `dimensions: ['model_channel_id']` adds `model_channel: { id }` (e.g. `openai-0`, `perplexity-0`).
- `dimensions: ['tag_id']` adds `tag`.
- **No `domain` field** — derive from `url`. **No position field** — `citation_avg`/`citation_rate` are citation density per retrieval, not SERP position.

### `GET /agent-analytics/visits`
Query: `project_id, start_date, end_date, group_by[] (bot_id|response_status|request_host|request_path), bot_ids[], time_bucket (hour|day|week|month), limit, offset`

With `group_by=bot_id&group_by=request_path&time_bucket=day`, row shape:
```
{ bot_id: string, time_bucket: string, request_path: string, visits: number }
```

### `GET /agent-analytics/bots`
Returns `{ data: [{ id, provider, type }] }`. `id` maps to log/visit `bot_id`.
Real `type` taxonomy: `training` (20), `search` (10), `userQuery` (12), `other` (6).

## Design

### 1. `getUrlCitations(clientSlug?)` — new, in `lib/peec/client.ts`
- Paginate `POST /reports/urls` over the report period (mirror `fetchAllYtdRows`).
- Second pass with `dimensions: ['model_channel_id']` to collect per-engine citing list per URL.
- Resolve "your brand id(s)" by matching `peecYourBrand` against brand names from the
  existing `/reports/brands` call so consumers can distinguish owned vs competitor citations.
- New `normalizeUrl(raw)` helper: lowercase host, strip protocol, strip leading `www.`,
  strip trailing slash, drop query/hash. This is the join key to content-calendar and SF rows.

Return type:
```ts
export type UrlCitation = {
  url: string
  urlNormalized: string
  domain: string
  classification: string
  title: string | null
  citationCount: number
  citationRate: number
  engines: string[]            // normalized model_channel ids that cited this URL
  mentionedBrandIds: string[]
  mentionsYourBrand: boolean
}
```

### 2. Extend `getAgentAnalytics(clientSlug)` — `lib/peec/agent-analytics.ts`
- Add one `GET /agent-analytics/visits` call grouped by `bot_id` + `request_path`, `time_bucket=day`.
- Read `provider` and `type` from the already-fetched `/bots` catalog (currently only used for
  display names).
- Add to the returned `AgentAnalyticsData`:
```ts
byPath: Record<string /* normalized path */, {
  totalVisits: number
  byType: { training: number; search: number; userQuery: number; other: number }
  bots: { botId: string; provider: string; type: string; visits: number; lastSeen: string }[]
}>
```
- `lastSeen` per (path, bot) = max `time_bucket` with visits > 0 (day granularity).
- Existing logs-based aggregates (topPaths, per-bot totals, robotsTxtHits, errors) stay untouched.

### Bot-type → table-column mapping (approved)
- `aiTrainingVisits` = `training`
- `aiIndexingVisits` = `search` + `userQuery`
- `other` excluded from these two columns.

### 3. UI wiring — replace `demoMode ? demo[…] : null` branches
- `technical-audit-tables.tsx` PageOverlapTable (~410-417):
  - `aiCitations` ← `getUrlCitations` joined by normalized URL
  - `aiIndexingVisits` / `aiTrainingVisits` ← `byPath[path].byType`
  - `humanFromAI`, `changeSinceLastCrawl` → remain `null` (out of scope; not Peec)
- `technical-audit-tables.tsx` BotActivityTable (~599-606):
  - `platform` ← `bots[].provider`, `botType` ← `bots[].type`, `lastSeen` ← max time_bucket
- `content-impact.tsx` citation fields ← `getUrlCitations` (owned vs competitor via `mentionsYourBrand` / `mentionedBrandIds`). Per-field, only what the URLs endpoint actually provides:
  - §B `aiCitations` ← `citationCount` (join by normalized URL) — wired
  - §F `aiEnginesCiting` ← `engines`; `promptCluster`/`topic` ← `tag`/`topic_id` dimension — wired
  - §H brand-absent editorial / repeated competitor pages ← rows where `mentionsYourBrand === false` but competitor brand ids present — wired

### Out of scope (stay null/`—` — no source in these two endpoints)
- `humanFromAI`, content-impact `aiReferredSessions` → GA4 (AI-referred sessions per page)
- `changeSinceLastCrawl` → Screaming Frog page-level diff
- §F `averagePosition` → `/reports/urls` has **no position field**; only obtainable per-source
  from `GET /chats/{id}/content` (`citationPosition`), which is a separate, heavier integration. Stays null.

### Demo mode
Unchanged. Demo users still see samples; real configured clients now get real data with demo off.

## Testing
Pure-function unit tests (no network):
- `normalizeUrl` — protocol/www/trailing-slash/query normalization and join correctness.
- Brand-id resolution — `peecYourBrand` name → brand id → `mentionsYourBrand`.
- Bot-type bucketing — 4 types → 2 columns mapping, `lastSeen` = max time_bucket.

Live verification: `scripts/probe-peec-urls-agents.ts` (read-only) remains as the documented
shape reference.

## Risks / notes
- `/reports/urls` returns no `domain`/position; any consumer needing those derives domain from
  `url` and must not expect position from this endpoint.
- Join reliability depends on URL normalization matching across Peec, content-calendar, and SF.
  Tests cover the normalizer; mismatches degrade to no-match (field stays null), never error.
- `time_bucket=day` gives day-granularity `lastSeen`, which is sufficient for display.
