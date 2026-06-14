# Follow-up: §F `averagePosition` via Get-Chat citation position

**Date:** 2026-06-12
**Status:** Deferred (NOT part of the URL-citations + agent-paths task)
**Parent spec:** [2026-06-12-peec-url-citations-agent-paths-design.md](./2026-06-12-peec-url-citations-agent-paths-design.md)

## What's deferred

The Content Impact §F "Owned Content Cited in AI" table has an **Average Position**
column ([content-impact-tables.tsx:341](../../../components/report-sections/peec-ai/content-impact-tables.tsx#L341),
rendered `#1.8`). It is the **citation position** — where an owned source sits in the
list of sources an AI answer cites — not the brand's rank in the answer.

This stays `null` (`--`) after the parent task. It is the only §F field the
`/reports/urls` endpoint cannot provide.

## Why it's separate (not just config)

- **Wrong data shape in the report endpoints.** `/reports/urls` has no position field;
  `ApiDomainRow` has none either. `ApiBrandRow.position` exists but is a single
  brand-level number (one "your brand"), so it cannot vary per owned-domain row.
- **The only source is per-conversation.** `GET /chats/{chat_id}/content` returns
  `sources: [{ url, urlNormalized, domain, citationCount, citationPosition }]`.
  Computing an average position per URL across a period requires an **N+1 fan-out**:
  1. Enumerate every chat id in the window (already available via `/queries/search`,
     which the client fetches as `queriesRes` — each row has `chat.id`).
  2. `GET /chats/{id}/content` for each chat — potentially hundreds–thousands of calls.
  3. Extract `sources[].citationPosition` per normalized URL and average.
- Different data model (transcripts vs aggregate rows), different parsing, and it needs
  its own caching / rate-limit / possibly-async strategy.

## Rough implementation sketch (when picked up)

- New `getCitationPositions(clientSlug, { start_date, end_date })` in `lib/peec/client.ts`.
- Reuse the chat ids already collected from `/queries/search` (avoid a second enumeration).
- Bounded concurrency over `/chats/{id}/content`; cache aggressively (positions are
  historical and stable). Consider the async-query pattern if volume is high.
- Aggregate `citationPosition` per `urlNormalized` → mean. Join into §F rows by the same
  `normalizeUrl` key introduced in the parent task.
- Verify the live `/chats/{id}/content` shape with a read-only probe first (the docs were
  inaccurate for `/reports/urls` and `/agent-analytics/visits`; do not trust them here).

## Effort vs payoff

Fills exactly one column (§F `averagePosition`). The parent task fills ~7 fields with two
aggregate calls. Revisit only after the parent task ships and if the position column is
deemed worth the fan-out cost.
