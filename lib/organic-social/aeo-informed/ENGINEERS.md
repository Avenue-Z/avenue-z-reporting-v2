# AEO Informed Social adapter

Rebuilds the Organic Social x AEO views (three tables and four graph series) from Peec's reports API, so the numbers do not depend on anyone's
custom Peec dashboard. Peec has no endpoint to export or read a dashboard, widget or saved view, so this works from the data and applies the same rules the
Peec screens use.

**Status: built and tested, not wired to anything.** There is no page, route, tab, sidebar entry, cron, column or migration, and nothing imports this folder.
A page that shows it is a separate piece of work. Brand logos are not available from Peec (the brands endpoint returns a color and no image), so a page
shows names and colors.

**Gated and contract-checked.** Every result passes a data gate before it is returned (see "The data contract and the gate" below); a result that breaks a stopping rule throws instead of reaching a page.

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
  // now: () => Date.now(),                                         // the clock for the as-of check; only tests change it
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
| `urlGaps` | Sources where our brand is not mentioned and at least one competitor is, for the gaps window, as Peec's own rows (a URL can be several). Ordered by competitor brands times retrievals. |
| `graphs` | `GraphPoint[]`: `graphId`, `series`, `weekStart`, `weekEnd`, `value` (`null` = "No source data"), `unit` (`citations` or `percent`), `partial`. Ordered by graph, then week. |
| `meta` | `asOf`, the start and weeks of each graph, windows used, own brand, selector, chats per window, request and row counts, `warnings`, `unverified`, and `gate` (the gate's verdict: rules checked and warnings; a returned result never has errors). |

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
- **One by-day span serves every window, except URL gaps.** The adapter pulls one span covering the current window, the previous window and the citation graphs, then builds each window from it.
  Pulls are `socials-by-day`, `used-chat-level` (dimensions date and chat), and `chats-by-day`. Each is labeled in every error.
- **URL gaps are Peec's own rows for the window, not merged URLs.** Peec returns a URL as several rows when different competitors cite it (about 9% more rows than URLs on the live check),
  and the outline's item count is a row count. So `gaps-current` and `gaps-prior` are one request each, with `gap >= 1` and no date dimension (`pullWindow` in `chunks.ts`), a full page throws
  because an offset cannot be trusted, and the table keeps the rows as returned. A row is compared with the previous-window row for the same URL and competitors, or with the URL's only row
  on both sides; anything else has an empty change. (Merging by URL gave the same number of URLs the by-day pull had, which was the "item count" difference.)
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
| The finished result breaks a stopping rule of the data gate | `AeoGateError` listing the rule codes and places; nothing is returned. `getAeoInformedSocial` has no ungated option; tests and probes use `inspect.ts`, which a view must not import. |
| Zero rows after the selector | Valid empty tables; every graph bucket is `null` |
| Days in a window with no chats row | `meta.warnings` entry, for example `days with no chats data in window: socialsPrior (2)` |

## The data contract and the gate

Two things stand between Peec and a page.

**The contract (`contract.ts`)** is the single source of truth, as typed field specs: the six raw Peec responses (open: extra fields ignored), the internal per-URL sum, and the three output shapes (closed: an extra field is a violation).
Each field has a kind, nullability, a range, allowed values or a prefix. From it:

- `gate.ts` validates every output row at runtime (`contract-validate.ts`; messages name a row and a field, never a value).
- `contract.test.ts` proves `shape.ts` and the raw contracts agree: for every field of every raw contract, a sample row passes and a row with that field removed, retyped, nulled or below its minimum makes the parser throw.
- `contract-yaml.ts` renders the contract-core YAML in `docs/contracts/aeo-informed-social/`; `npx tsx scripts/gen-aeo-contract.ts` writes it and `contract-yaml.test.ts` fails if a committed file differs from the generated one or a stray file appears. The YAML is a design copy that is checked for drift: contract-core is Python and does not run in the app, and its boundaries are in `observe` mode. The runtime enforcement is `gate.ts` and `shape.ts`.

**The gate (`gate.ts`)** runs on the finished result, and the only function a view should call, `getAeoInformedSocial`, returns nothing if the gate finds an error. It runs against the raw Peec rows the result was built from, so a total, a change or a bound is checked against a simple independent recount, not against a number the same code just produced.
`GATE_RULES` is the catalog: each rule has a code, a severity and a plain-English sentence. There are 44 (40 stop the result, 4 warn):

| Group | What it checks |
|---|---|
| Contract and numbers | every field is the right kind, range and value; no NaN or infinity anywhere |
| Summary | each "change" window is the same length and ends the day before; no table window runs past the as-of date, and the as-of date is before today (so no unfinished day is counted); counts equal the rows; chat totals are whole numbers; the unverified list is complete; the own brand and the tag (and its id, for a tag) are named |
| Independent recount | each window's chat total equals a recount of the daily chat counts; the tables hold exactly the sources Peec returned; the retrievals and citations add up; every row's numbers and its change against the previous window equal a recount, row by row |
| First table and its splits | ranks 1..n and the sort order; the star equals "owned by our brand"; Retrieved % equals retrievals over chats; its change agrees with the retrievals change and the chats; a new URL has an empty change in both columns; the own and competitor tables are exact, ordered, ranked subsets with no overlap |
| URL gaps | ranks and order (ties by URL); citation share is a row's citations over the table total; every row has a brand mentioned; no source behind the table mentions our own brand; new-URL changes agree |
| Graphs | all four present, in order, with the right number of weeks; 7-day buckets from the graph's own start date; the partial flag matches the as-of date; own brand and the right unit; percentages within 0 to 1; whole citations; all "No source data" or data in every week (a week with no chats at all is the one exception); no point above what the raw rows allow; never "No source data" when our own channels were retrieved |
| Fit to use | a window with no chats is refused; so is any day inside a window that has no chat count once the project has chat data (it would shrink the denominator and inflate every percentage). An empty table, a previous window with no chats, and adapter warnings (such as days before the project's first chat data) are passed on as warnings |

**What is proven, and how.** `gate.test.ts` corrupts a known-good result (or its raw rows) at least once per rule and asserts that rule appears, with more than one corruption where a single one would leave a branch untested; a test fails if the catalog has a rule with no test, or a test names a rule that is not in the catalog. The tests assert that the rule appears, not that nothing else does.
Run live against a real project with the gate enforced on 2026-11-09 (see the findings note): the window the outline uses and four others, with no false alarm.
Violations never contain a value from the data; an adapter warning with anything but a window name and a count is withheld.

**Limits.** The recount uses the same raw rows the builders used, so it catches a builder bug but not a wrong or incomplete pull (chunking and the Peec shape checks cover that). The competitor-mentioned rule on URL gaps assumes `gap` implies a mentioned competitor; that held on every live window tried. A window with no chats refuses the whole result, including tables that would have stood.

## What is not exact yet (`meta.unverified`, always returned)

1. `url_gaps_item_count`: keeping Peec's rows lands within 1% of the outline's item count, not on it. Moving the window by a whole day either way changes the count by 5 to 20, and no whole-day window gives the outline's exact number, so the likely cause is data that moved after the screenshot was taken. Not proven.
2. `url_gaps_sort_order`: the outline's five visible rows are ranks 1 to 5 under competitor brands mentioned times retrievals, and no other sort tried gives that (retrievals, citations, share, position, mentions). It is a fit to five rows, not a documented Peec rule.
3. `competitor_table_definition`: the outline's competitor screenshot is a copy of its first table, so the competitor rule (above) is ours.
4. `own_channel_non_linkedin_and_competitor_matching`: ownership is proven for the own brand on LinkedIn.
5. `pdf_columns_cropped`: the outline crops the right-hand columns of its tables.

`column-map.ts` maps every column, graph and setting in the outline to the field that carries it, with a status (`exact`, `derived`, `unverified`, `not_available`).
A test keeps it in step with the output types. The status words are documentation tied to the live check below, not enforced.

## Checking it against a live project

The rules above were reproduced against a real project's own export with a read-only run of the real adapter (about 14 requests, under 10 seconds). That run needs a Peec
company key and the project's own figures, so it lives outside the repo. To repeat it: build `getAeoInformedSocial` inputs for the windows in the export, then compare table 1, the gaps rows and
each graph point.

## Tests

`npx vitest run lib/organic-social/aeo-informed` (covered by the existing `lib/organic-social/**` glob, so `vitest.config.ts` needs no change). One test file per module: `windows`, `chunks`, `shape`,
`peec-read`, `urls`, `ownership`, `platform`, `tables`, `graphs`, `index` (against a fake Peec server, `test-world.ts`, that pins every request body and the call order), `column-map`, `contract`, `contract-yaml` and `gate` (through `inspect.ts`).
Fixtures use invented names and numbers. The generated YAML contract is in `docs/contracts/aeo-informed-social/`; `contract.ts` is the source of truth and `shape.ts` and `gate.ts` are the runtime checks.
