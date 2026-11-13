# OS x AEO: can the team's Peec dashboard be rebuilt from the API? (2026-11-09)

**Answer.** The dashboard itself cannot be pulled, but every table and graph in the team's outline can be rebuilt from Peec's reports API, and the rebuilt numbers match the outline's own screenshots.
The adapter is `lib/organic-social/aeo-informed/` (guide: `ENGINEERS.md` in that folder). This note keeps what was measured and what went wrong on the way, so nobody has to rediscover it.

## How this was checked

- Peec's live OpenAPI (`GET https://api.peec.ai/customer/v1/openapi/json`, 117 endpoints), Peec's public docs, and this repo's existing Peec code (`lib/peec/`).
- Read-only calls with a Peec company key against one real project (GET listings and POST `/reports/*` only). Pulls were saved and analyzed offline, so any date window could be tested against the outline without more calls.
- The real adapter was then run live against the same project, and every figure that can be read off the outline was asserted (24 checks, all passing). That run needs the key and the project's figures, so it lives outside the repo.

## What Peec exposes

- **No dashboard, widget or saved-view endpoint** exists in the live spec. Docs say a layout is personal to one user; sharing produces a public read-only link or a PDF, which render but return no data.
- The rebuild uses `POST /reports/urls` (per-URL retrievals, citations, inline citation position, channel title, brands mentioned), `POST /reports/brands` (chats per day), and `GET /brands`, `/brands/social-channels`, `/source-tags`, `/classifications/domains`.
- **Source tags and domain classifications** are filterable on the reports: `domain_classification` (by name), `domain_tag_id` and `url_tag_id` (by `stg_` id). `tag_id` is a different thing (prompt tags). The outline's "Organic Social" label is both a custom domain classification and a source tag, and both select the same sources.
- A `url_tag_id` filter returns nothing when no URL carries the tag, so only the domain level can be used until URLs are tagged.

## What was reproduced

The first table (item count, top rows, channels, URL types, Retrieved %, both change columns), the URL gaps rows (retrievals, citations, position, change, share within rounding), and all four graphs (every weekly point, and the "No source data" state).
The different tables in the outline use different windows (a 30-day window, a calendar month, and graphs on weekly buckets from each chart's own start date), and a change column always compares with the previous window of the same length, not the previous calendar month.

## Traps found (each cost time; each has a test)

1. **`urlJoinKey` merges videos.** `lib/url.ts` drops the query string, so every `youtube.com/watch?v=...` URL collapses into one key (on the project measured, thousands of URLs became far fewer keys). Group on the exact URL Peec returns.
2. **Offset paging is unreliable.** Rows can be missed or repeated when they tie, and repeated (url, day) rows are legitimate so a duplicate check cannot detect it. Pull by date chunks that each fit one page; split a full chunk.
3. **Chats per day.** The domains report skips days when the chosen domain has no row. The brands report (own brand, by day, `visibility_total`) covers every day and gave identical totals where both existed.
4. **Ownership by handle over-counts.** A registered handle in the URL path adds rows Peec does not attribute to the channel. Matching the channel title on a platform the brand registered reproduced every graph point; the handle rule left one point of the "used as a source" graph far from Peec's own value.
   The first version of the offline probe also counted a URL as "ours" if any row of it was, which produced the same discrepancy (an unexplained first point) until ownership was judged per row.
5. **Citation position is null for URLs that have citations but none inline.** Peec only ranks inline citations; null shows as a dash.
6. **The URL gaps table is Peec's rows, and a URL can be several rows.** When different competitors cite a URL, Peec returns it as separate rows (about 9% more rows than URLs here), and the outline's item count is a row count: merging by URL, as the first version did, came out about 7% short. Asking Peec for the whole window with the `gap` filter and keeping its rows lands within 1% of the outline's count (not exact; moving the window a whole day either way moves the count by 5 to 20, so data that moved after the screenshot is the likely cause). The outline's five visible rows then match on retrievals, citations, position and change, and their order is competitor brands mentioned times retrievals (ranks 1 to 5; retrievals, citations, share, position and mentions alone do not give it). The first table has no repeated URLs. Found 2026-11-09 by pulling the same September window by day and whole, then testing sorts offline.
7. **A bucket before a project's first data has no chats.** Percentages there are `null`, not 0, and `meta.warnings` says which days had no chat data.

## The gate and the contract

A result that is wrong must not reach a page, so every result passes a data gate (`gate.ts`, 44 named rules, 40 of which stop the result) before the only production function, `getAeoInformedSocial`, returns it. The contract it enforces is typed code (`contract.ts`) and the YAML in `docs/contracts/` is generated from it.

- **Independent recount.** The first version of the gate checked chats and changes against numbers the same code had just computed, which is circular (found by the review). The gate now gets the raw Peec rows and recounts chat totals, the sources in each table, every row's numbers and its change, and the bounds on every graph point.
- **Missing chat days are errors.** A day with no chat count inside a window shrinks the denominator and inflates every percentage; days before the project's first chat data only warn.
- **As-of against the clock.** The as-of date must be before today, so an unfinished day is never counted. The clock is injected so this is testable.
- **No ungated option.** `getAeoInformedSocial` cannot return a result that broke a rule; tests and probes use `inspect.ts`.
- **Enforcement in CI:** a mutation suite corrupts a good result (or its raw rows) once or more per rule and fails if a rule has no test; a drift test fails if the YAML differs from the code; a conformance test proves the Peec parsers reject everything the raw contracts forbid.

**Live runs, 2026-11-09** (real adapter, read only, gate enforced, one real project): the window the outline uses, a calendar month, the last 7 days, year to date, and a month ending at the as-of date with graphs running past it.
All five passed with no gate error. Year to date warns, correctly: 21 days before the project's first chat data and no previous window to compare with, and those days are before the first data, so they are not errors.

## Not exact yet

- URL gaps item count (fewer here than the outline shows, and the outline omits one row this includes).
- The outline's competitor table is a copy of its first table, so the competitor rule is ours.
- Ownership is proven for the own brand on LinkedIn only.
- The outline crops the right-hand columns of its tables.
These are returned in `meta.unverified` and listed in `CLAUDE.md` under Known Follow-ups.

## Review log (process, not content)

Spec first, then code, with fresh-eyes review at each step:

| Step | Result |
|---|---|
| Spec, round 1 | 34 findings, 3 blockers (the chats source was unmeasured; `urlJoinKey` merges videos; what table 1 contains), all fixed or ruled |
| Spec, round 2 (changed text only) | 0 blockers, 5 majors (chunk density for chat-level pulls, two contradictory pull designs, spec marking unbuilt code as built, zero-chat buckets, an untested rule), all fixed |
| Whole-branch code review | 0 blockers, 2 majors (real figures in public test fixtures; no test on window edge days), 21 minors. Everything was fixed or documented in code comments; one rule documented instead of changed (graphs with no own source are `null`, even when chats exist) |
| Gate and contract review | 3 blockers (the chat and change checks were circular; a missing chat day only warned; the change columns were not recounted), several majors (graphs not tied to the rows, no clock check, an ungated mode a page could use, mutation tests that survived a weakened rule). All fixed: the gate recounts from the raw rows, a missing chat day is an error, the as-of date is checked against an injected clock, the ungated mode is gone, and the weak mutations are strengthened |

Tests were written before each module (the folder has well over 300 now). Beyond them: `tsc`, `eslint`, `check:rsc`, `next build` and the full suite pass.
