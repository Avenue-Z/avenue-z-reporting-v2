# AEO Informed Social adapter

Rebuilds the Organic Social x AEO views (three tables and four graph series) from Peec's reports API, so the numbers do not depend on anyone's
custom Peec dashboard. Peec has no endpoint to export or read a dashboard, widget or saved view, so this works from the data and applies the same rules the
Peec screens use.

**Status: built and tested, not wired to anything.** There is no page, route, tab, sidebar entry, cron, column or migration, and nothing imports this folder.
A page that shows it is a separate piece of work. Brand logos are not available from Peec (the brands endpoint returns a color and no image), so a page
shows names and colors.

**Read only.** The reader can call four Peec listing endpoints and two report endpoints and nothing else. It has no method that can create, update or delete
anything in Peec.

## Use

```ts
import { getAeoInformedSocial } from '@/lib/organic-social/aeo-informed'
import { lastNDays, calendarMonth } from '@/lib/organic-social/aeo-informed/windows'

const result = await getAeoInformedSocial({
  apiKey: process.env.PEEC_AI_CUSTOMER_TOKEN!,           // a Peec company key
  projectId,                                              // the client's Peec project id (clients.peec_customer_project_id)
  asOf: '2026-11-08',                                     // last day to count, UTC. Normally yesterday.
  views: {
    socials: lastNDays('2026-11-05', 30),                 // tables 1 and 2, compared with the 30 days before
    gaps: calendarMonth('2026-09'),                       // URL gaps, compared with the 30 days before
    graphs: {                                             // each graph has its own start date, in 7-day buckets
      citations_all: { from: '2026-08-14', weeks: 12 },
      citations_linkedin: { from: '2026-09-03', weeks: 4 },
      citations_instagram: { from: '2026-09-03', weeks: 4 },
      used_as_source_all: { from: '2026-09-03', weeks: 4 },
    },
  },
  // selector: { name: 'Organic Social', via: 'classification' },   // the default; via: 'tag' uses a source tag instead
})
```

`socials.end` and `gaps.end` must not be after `asOf` (a `RangeError` is thrown before any call). `windows.ts` has `lastNDays`, `calendarMonth`, `ytd`, `allTime`,
`previousWindow` (the window of the same length that ends the day before), `weeklyBuckets`, `eachDay` and `daysIn`. Dates are UTC calendar days and every window is inclusive.

### Result

| Field | What it is |
|---|---|
| `socialsAll` | Every tagged URL, ranked by retrievals, with `isOwnChannel` as the star. This is the table the outline screenshots show. |
| `socialsOwn` | Rows owned by our brand, ranked from 1. |
| `socialsCompetitor` | Rows owned by another brand that registered a channel, ranked from 1. |
| `urlGaps` | Sources where our brand is not mentioned and at least one competitor is, for the gaps window. |
| `graphs` | `GraphPoint[]`: `graphId`, `series`, `weekStart`, `weekEnd`, `value` (`null` = "No source data"), `unit` (`citations` or `percent`), `partial`. Ordered by graph, then week. |
| `meta` | Windows used, own brand, selector, chats per window, request and row counts, `warnings`, and `unverified`. |

Row types are `SocialsRow` and `GapRow` in `tables.ts`. Every delta is `number | null` (null when the URL has no row in the previous window). Percentages are fractions 0 to 1.

## How each number is made

| Number | Rule |
|---|---|
| Tag filter | `domain_classification in [name]` (or `domain_tag_id in [id]` with `via: 'tag'`). Both select the same sources on the project this was built against. |
| Retrievals, total citations | `retrieval_count` and `citation_count` summed over the window's days. Counts add across days because a chat belongs to one day. |
| Change columns | Against the previous window of the same length, joined on the exact URL Peec returns. |
| Retrieved % | A URL's retrievals divided by the window's chats. Chats come from `/reports/brands` (own brand, by day, `visibility_total`), which covers every day. |
| Retrieved % change | Percentage points against the previous window. `null` when the URL is new or either window has 0 chats. |
| Citation share (URL gaps) | A row's citations divided by the sum of citations over every row of the same pull. |
| Citation position | Sum of `citation_position_sum` over sum of `citation_position_count`. `null` when no chat cited the URL inline: Peec only ranks inline citations, so a URL can have citations and no position. |
| Own channel (the star) | See below. |
| Citation graphs | Own-channel citations per 7-day bucket from the graph's own start date (not ISO weeks), for the platforms of that graph. |
| Used as a source | Per bucket, distinct chats with at least one own-channel source retrieved, over that bucket's chats. Uses the chat-level pull. |
| "No source data" | `value` is `null` in every bucket when no own-owned row on the graph's platforms was retrieved anywhere in the graph's window. Once there is one, an empty bucket is a real 0. |
| Partial buckets | A bucket after `asOf` is dropped; one that crosses it has `partial: true` and its percentage uses only the days up to `asOf`. |

### Which source is "ours" (`ownership.ts`)

Peec attributes a source to a channel through the row's `channel_title`. A row is owned by the brand whose name starts the channel title at a word boundary,
provided the brand registered a channel on that URL's platform (the eight platforms Peec supports, `platform.ts`). The longer name wins, a tie is no owner, and
a row with no title has no owner. A handle in the URL path is deliberately not used: it adds rows Peec does not count and moves the "used as a source" graph away from what Peec draws.

Known limits: proven for the own brand on LinkedIn only; a channel titled "<Brand> Something" that is not the brand's is still credited to it (own or competitor).
Tables decide ownership from a URL's most-retrieved title and graphs decide per row, so a URL whose rows carry different titles can differ between the two.

## How it pulls (`chunks.ts`, `peec-read.ts`)

- **Never offset paging.** Peec's offset paging can shift when rows tie, so rows can be missed or repeated, and a repeated (url, day) row is legitimate, so a duplicate check cannot catch it.
  Every dated pull is split into chunks of at most 31 days (14 for the chat-level pull), one request each with `offset: 0` and `limit: 10000`.
  A chunk that comes back full is split in half and each half is pulled again, down to one day; a full single day throws `PeecPageCapError` instead of returning a partial day.
- **One by-day span serves every window.** The adapter pulls one span covering the current window, the previous window and the citation graphs, then builds each window from it. Pulls are
  `socials-by-day`, `gaps-by-day` (with the `gap >= 1` filter), `used-chat-level` (dimensions date and chat), and `chats-by-day`. Each is labeled in every error.
- **Never group Peec URLs with `lib/url.ts` `urlJoinKey`.** It drops the query string, so every `youtube.com/watch?v=...` video collapses into one row. Group on the exact string Peec returns.
- **Reader behavior:** one request at a time through one gate (450 ms apart), a timeout per attempt (90 s, capped at the time left), 5 attempts on 429 (`Retry-After` capped at 60 s), 3 on 5xx and on network failures,
  no retry on other 4xx, a whole-call `deadlineMs` (default 10 minutes), `cache: 'no-store'`, redirects refused, and the key redacted from any error text. `onRetry` (default one `console.warn` line) reports each retry.
  These are chosen defaults, not measured limits; Peec's documented limit is 200 requests per minute per project.

## Failure behavior

| Situation | Result |
|---|---|
| Bad date, `start > end`, `weeks < 1`, or `socials.end` / `gaps.end` after `asOf` | `RangeError` before any call |
| Selector name not found | `PeecSelectorError` listing the names that exist |
| No own brand, or more than one | `PeecBrandError` |
| A list endpoint returns exactly its limit (1,000) | `AeoPullError` (it may be cut off) |
| Any pull fails after retries | `AeoPullError` naming the pull and window, wrapping the original error as `cause`. No partial result. |
| A response changes shape | `PeecShapeError` naming the endpoint, row and field, never the value (rows hold client data) |
| Zero rows after the selector | Valid empty tables; every graph bucket is `null` |
| Days in a window with no chats row | `meta.warnings` entry, for example `days with no chats data in window: socialsPrior (2)` |

## What is not exact yet (`meta.unverified`, always returned)

1. `url_gaps_item_count`: against the outline the gaps table has fewer items here, and the outline omits one row this includes. Peec evaluates `gap` per (url, day) row; the table's own definition of "competitor" may differ.
2. `competitor_table_definition`: the outline's competitor screenshot is a copy of its first table, so the competitor rule (above) is ours.
3. `own_channel_non_linkedin_and_competitor_matching`: ownership is proven for the own brand on LinkedIn.
4. `pdf_columns_cropped`: the outline crops the right-hand columns of its tables.

`column-map.ts` maps every column, graph and setting in the outline to the field that carries it, with a status (`exact`, `derived`, `unverified`, `not_available`).
A test keeps it in step with the output types. The status words are documentation tied to the live check below, not enforced.

## Checking it against a live project

The rules above were reproduced against a real project's own export with a read-only run of the real adapter (about 14 requests, under 10 seconds). That run needs a Peec
company key and the project's own figures, so it lives outside the repo. To repeat it: build `getAeoInformedSocial` inputs for the windows in the export, then compare table 1, the gaps rows and
each graph point.

## Tests

`npx vitest run lib/organic-social/aeo-informed` (covered by the existing `lib/organic-social/**` glob, so `vitest.config.ts` needs no change). One test file per module: `windows`, `chunks`, `shape`,
`peec-read`, `urls`, `ownership`, `platform`, `tables`, `graphs`, `index` (against a fake Peec server that pins every request body and the call order) and `column-map`.
Fixtures use invented names and numbers. The data contract for the Peec boundaries is in `docs/contracts/aeo-informed-social/`; `shape.ts` is the runtime source of truth.
