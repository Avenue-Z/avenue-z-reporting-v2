# PR Influence Matchback Citation Dates (FB-068): Design

**Status:** design, pending Thomas review.
**Branch:** `feature/pr-influence-citation-date` (off `dev`).
**Origin:** Thomas asked to surface, per matched PR placement, WHEN it is being cited by AI within the selected timeframe.

---

## 1. Goal

The PR Influence matchback card ("Which secured PR placements are showing up in
AI citations?") currently shows, for each all-time placement cited in the
selected window, the outlet, headline, link, publication date, and the AI
engines citing it. This feature adds two columns:

- **First cited:** the earliest day in the selected window that the placement's
  domain was cited by AI.
- **Most recent:** the latest day in the selected window it was cited.

Both dates are bounded by the selected timeframe (consistent with the card
already being "placements cited within the selected timeframe", FB-067). Under
an active model filter, the dates reflect only the selected engine(s).

## 2. Why this is not trivial (the truncation problem)

Peec `/reports/urls` and `/reports/domains` dimensioned by `date` return one row
per (domain|url) per day (per model when model-dimensioned). Over a 30-day
window that is tens of thousands of rows. The API caps rows at a `limit` and
orders them by date, so a single limited fetch only returns the first few days
of the window. A naive fetch would compute a "most recent" date that never sees
recent days. Verified live on 2026-07-09: `dimensions:['date']` with `limit`
3000 returned only 2 distinct days of a 30-day window.

## 3. Locked data path (verified by read-only probes, 2026-07-09)

All confirmed against the live Avenue Z Peec project (`or_043ae735-...`) with the
prod token. Read-only, no writes.

- **Endpoint:** `POST /reports/domains`. Domain-level, matching the matchback's
  domain-level matching, and far fewer rows than `/reports/urls`.
- **Dimensions:** `['model_id','date']`, per-engine and per-day rows. `model.id`
  values are the scraper ids (`chatgpt-scraper`, `perplexity-scraper`,
  `gemini-scraper`, `google-ai-overview-scraper`), which map to our engine labels
  through the existing `normalizeEngine()` in `lib/peec/url-citations.ts`.
- **Sort:** `order_by: [{ field: 'date', order: 'asc' }]` for the first-cited
  pass; `order: 'desc'` for the most-recent pass. Confirmed: `order:'desc'`
  returned the window's END dates first. Valid `order_by[].field` values:
  `citation_rate | retrieval_count | citation_count | date | week | month`.
- **Pagination:** `offset` + `limit`. The response envelope has only a `data`
  key (no total/next), so end-of-data is detected by a short page
  (`rows.length < limit`). Bounded walk (see 4).
- **Model filter:** done client-side by aggregating per-engine dates, the same
  pattern the card and the rest of the AEO section already use. `filters:
  [{ field:'model_id', operator:'in', values:[...] }]` is available server-side
  as a fallback but is not required.
- **Auth/env:** identical to today. `X-API-Key = PEEC_AI_CUSTOMER_TOKEN` (holds
  the working `skp-` value in prod and local `.env.local`), project id resolved
  from the client row (`peecCustomerProjectId`) exactly like `getUrlCitations`.
  No new secret, no env change, no DB migration. The current Vercel key picks
  this up in prod with zero changes.

## 4. Bounded pagination (correctness + latency)

Because rows are date-ordered, the FIRST time a domain appears in the ascending
pass is its earliest cited day (its min date); the first appearance in the
descending pass is its latest cited day (its max date). We only need dates for
the MATCHED placement domains (a small set, typically under ~20).

The walk therefore stops as soon as every matched placement domain (per engine,
for the model-filter case) has been seen, OR a page cap is reached, OR a short
page signals end-of-data. A rarely-cited placement that would require deep
paging past the cap yields no date and renders "N/A" (honest, never fabricated).
The two passes (asc, desc) run in parallel. Page cap and limit are constants in
the fetch module, tuned so the common case is 1 to 3 pages per direction and the
whole fetch stays well under the 15s Peec request guard.

## 5. Components and data flow

```
pr-influence.tsx (RSC)
  ├─ getUrlCitations(...)                     [unchanged, feeds existing matchback matching]
  ├─ getPlacementCitationDates(slug, range)   [NEW cached fetch: the bounded asc/desc walk]
  │     └─ buildCitationDateIndex(rows)        [NEW pure: rows -> per-host per-engine {first,last}]
  └─ computePlacementMatchback(placements, urlCitations, models, citationDateIndex)  [EXTENDED]
        └─ each MatchbackRow gains firstCitedDate, lastCitedDate

pr-influence-tables.tsx
  └─ matchback table gains "First cited" and "Most recent" columns
```

### 5.1 New: `lib/peec/citation-dates.ts`

- `type CitationDateIndex = Record<string /*host*/, Record<string /*engine*/, { first: string; last: string }>>`
  (dates are `YYYY-MM-DD`; a host also carries an `'*'` engine key = any-engine
  min/max, precomputed for the no-filter case).
- `buildCitationDateIndex(rows: ApiDomainDateRow[]): CitationDateIndex`. PURE.
  Folds per-(host, engine, day) rows into per-host per-engine min/max, plus the
  `'*'` any-engine roll-up. Host normalized via the shared `normHost`.
- `getPlacementCitationDates(clientSlug?, { startDate?, endDate? })`: cached
  wrapper doing the bounded asc/desc paginated walk, returning a
  `CitationDateIndex`. Its own `cached()` entry (isolated from `getUrlCitations`;
  does not change that function's shape or cache key).

### 5.2 Extended: `lib/pr-proof/matchback.ts`

- `MatchbackRow` gains `firstCitedDate: string` and `lastCitedDate: string`
  (empty string = unknown).
- `computePlacementMatchback` gains a `citationDates: CitationDateIndex`
  parameter. For each matched row, derive:
  - no model filter → the host's `'*'` `{first,last}`.
  - model filter → across the selected engines present for that host: `first` =
    min of their firsts, `last` = max of their lasts. If the host has no date
    entry for any selected engine, both are `''`.
- `citedByAI` and row inclusion are UNCHANGED (still driven by `urlCitations`,
  FB-067). Dates are additive metadata only.

### 5.3 Render: `components/report-sections/peec-ai/pr-influence-tables.tsx`

- Two new columns, "First cited" and "Most recent", formatted the same way as
  the existing publication-date column on that card. Empty date renders "N/A".

## 6. Testing

### Pure unit tests (no API): the bulk of coverage

`lib/peec/citation-dates.test.ts` for `buildCitationDateIndex`:
- multi-day span → correct min/max per host.
- multiple engines per host → correct per-engine and `'*'` roll-up.
- gap days (host cited day 1 and day 10, not between) → first=day1, last=day10.
- single-day host → first == last.
- host normalization (`www.`, case, trailing) folds to one entry.
- empty rows → empty index.

`lib/pr-proof/matchback.test.ts` (extend the existing 20 cases):
- no filter → row shows the `'*'` first/last.
- model filter to one engine → dates reflect only that engine.
- model filter to two engines → first=min, last=max across the two.
- placement with no date entry → firstCitedDate/lastCitedDate are `''` (render "N/A").
- first <= last invariant holds in every produced row.
- dates never widen or change row inclusion (inclusion parity with FB-067 cases).

### Live QA (real API, on the preview)

- Pick a known placement (e.g. the January O'Dwyer's placement) under last-30d
  all-models: verify First cited / Most recent fall inside the window and match a
  hand-run `/reports/domains` date query.
- Switch to ChatGPT-only: dates shift to ChatGPT's citations for that domain.
- Change the date range: dates re-bound to the new window.
- Containment: a non-Avenue-Z client shows no matchback (unchanged).

## 7. Out of scope

- No change to `getUrlCitations`, other AEO sections, or any other card.
- No AI/Glean, no synopsis (Avenue Z surfaces stay data-only).
- No server-side model filter (client-side aggregation is sufficient and matches
  the existing pattern); the `filters[]` capability is documented as a fallback.
- No DB migration, no new env var.

## 8. Process

superpowers plan → subagent-driven-development (implementer + reviewer per task,
tests along the way) → the Stage-1 review-record doc PR off `dev` → Thomas + Paul
review → merge. Per `CLAUDE.md` "Branch Flow & Promotion Pipeline".
