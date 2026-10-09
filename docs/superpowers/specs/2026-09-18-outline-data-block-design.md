# The outline's Data block and the engagement breakdown under the graph: design

Status: approved in chat on 2026-09-18 ("yes go ahead with all three", task C), under my
standing rule: anything that follows Jasmine's outlines and leaves Renaissance untouched
proceeds. On PR 255 with the Overview removal, so the three clients' layout ships as one PR.

**Update 2026-09-22.** Jasmine settled the two rows Dash cannot fill (Slack, 4:04 PM): "for FB, we can
just remove all together and for TT can replace reposts with favorites?". So Facebook's Data block has
no Profile Views row at all, and TikTok's fourth engagement row is Favorites, backed by Dash's
`TOTAL_FAVORITES` (probed 2026-09-22: the only favorites metric its TikTok catalogue offers, accepted on
both bases, and equal to the sum of the per-post favorites for the same window). No outline row is blank
any more. The blank-and-flagged mechanism below is kept for a row that ever needs it again, and the
paragraphs beneath this one are the record as written on 2026-09-18 and 2026-09-21.

**Update 2026-09-21.** Jasmine answered the open questions this spec names.

- **Engagement Rate** now follows the monthly decks in the outline block (her words: "engagement rate
  should divide by views not followers so just follow the deck"). `OUTLINE_KPI_OVERRIDES` swaps in
  Instagram `AVG_ENGAGEMENT_RATE_VIEWS` and LinkedIn `AVG_ENGAGEMENT_RATE_BY_POST`, checked against the
  August decks and returning a compare value in the batched request. Facebook keeps its shared rate: it
  matches one of the two Facebook decks, and the other does not reconcile on any tile yet. TikTok's
  matched its deck. This supersedes "Engagement Rate keeps today's Dash metric per channel" below. The
  shared tiles (`PLATFORM_KPIS`), which Renaissance reads, are unchanged. Not covered here: the Top
  Content post cards on these tabs still show Instagram's per-post rate on the followers basis; that
  field is shared with Renaissance, so moving it is a separate change.
- **Question 6.** The Facebook Profile Views reason below ("Dash's metric counts post views") is
  withdrawn: nothing recorded which metric produced it. Instagram retired organic video views; the
  replacement is Views on Reels, a separate request, not built yet. TikTok Video Views is the same number
  as Views. Facebook Profile Views and TikTok Reposts are found in neither Dash's API nor its app code;
  Jasmine sees them on dashboards she builds, and the metric behind them is not identified yet.
- **Question 1** is answered (see the Overview removal spec's update). Question 3 (YTD Review) is its own
  build.
- **Facebook Profile Views and TikTok Reposts are shown blank, flagged "Not available from Dash".** I read
  every platform metric Dash's own dashboard builder offers, per channel, in my Dash login: neither exists
  for Facebook or TikTok (both exist for Instagram only). Following Jasmine's rule for missing data ("flag it
  for review and leave it blank"), the two rows now render in the outline's place as blank tiles with that
  flag, and Dash is never asked for them. The Data block draws its tiles with `OutlineHeadlines`, whose
  markup a test holds identical to the shared `PlatformHeadlines`; the shared component is not changed.
  Instagram Video Views and TikTok Video Views stay unrendered; `OUTLINE_PENDING_Q6` carries their reasons.
  This supersedes the rows table, the pending question 6 list, the "Engagement Rate keeps today's Dash
  metric" line and the question 6 tests described below, which are the design as of 2026-09-18.

## What the outlines ask for

Every platform tab, in order: Commentary; YTD Review; Data; {Platform} Follower Growth Graph;
{Platform} Engagement Graph with engagement metrics "directly under"; Top Performing Content.

**Data rows, every tab:** Total Followers, Net New Followers, Views, Total Engagements,
Engagement Rate, Profile Views, Video Views. Kenect Nashville (our `akara-living`): Profile
Clicks instead of Video Views.

**Under the engagement graph:**

| Tab | Metrics |
|---|---|
| Instagram | Likes, Comments, Shares, Saves, Reposts |
| Facebook, LinkedIn | Reactions, Comments, Shares, Post Clicks |
| TikTok | Likes, Comments, Shares, Reposts, Completion Rate |

## What renders today

The Data block is the `platform-headlines@1` part. Its tiles come from `PLATFORM_KPIS`
(`lib/organic-social/metrics.ts`), which is global: Renaissance reads the same list. On a
platform tab it shows every KPI for the channel, which already includes the whole engagement
breakdown. So the breakdown exists; it sits in the wrong place for these clients.

Against the outlines, today's tiles:

- say "Engagements" where the outline says "Total Engagements", and "Impressions" on LinkedIn
  where the outline says "Views" (Jasmine: "we will default to views for all platforms")
- carry the breakdown in the Data block instead of under the graph
- lack three rows Dash does have: Facebook Video Views, LinkedIn Video Views, and Instagram
  Profile Clicks (Kenect)
- lack four rows that do not work as written, which are Jasmine's question 6: Facebook Profile
  Views (Dash's metric counts post views, not profile visits, so it reads far too high), Instagram Video Views (always zero),
  TikTok Reposts (no longer in Dash), TikTok Video Views (the same number as Views)

## Probed before designing (read only, GET only, 2026-09-18)

The three missing rows, sent in the exact request the tiles send (`TOTAL_GROUPED_METRIC`,
`aggregate_by=BRAND`, `require_posts`, Eastern window, one channel, context window) alongside
the channel's existing tile metrics, because one bad name 400s the whole batch:

| Row | Dash name | Other names tried |
|---|---|---|
| Instagram Profile Clicks | `PROFILE_CLICKS` | `PROFILE_CLICKS_BY_POST` 400 |
| Facebook Video Views | `PAID_AND_ORGANIC_VIDEO_VIEWS` | `..._BY_POST`, `ORGANIC_VIDEO_VIEWS_BY_POST`, `VIDEO_VIEWS_BY_POST` all 400 |
| LinkedIn Video Views | `VIDEO_VIEWS_BY_POST` | `VIDEO_VIEWS`, `VIDEO_VIEWS_ALL_POSTS` 400 |

Each returned 200 with a value and a prior-period value for every client that has the channel,
and none broke the batch. Each is the only name Dash accepts for that row, so it goes in both
basis columns, the same way today's Instagram and Facebook breakdown names do. The probe and
its output are private (`~/.claude/organic-social-work/probes/outline-extra-rows.ts`); no
client figure goes in the repo.

## The design

Three new, unpublished part versions. A client opts in through its own
`report_section_config['organic-social:platform']`. Renaissance has no such entry and its
template rows pin `platform-headlines@1`, so it keeps resolving to exactly today's parts.

### 1. `lib/organic-social/outline-layout.ts` (pure)

- `OUTLINE_EXTRA_KPIS`: the three probed rows as `KpiSpec`s, per channel. They live here, not
  in `PLATFORM_KPIS`, so Renaissance's tiles and its Dash request do not change.
- `OUTLINE_DATA_ROWS`: per variant (`standard`, `profileClicks`) and channel, the outline's Data
  rows as `{ key, label }` in outline order, with the outline's labels.
- `OUTLINE_BREAKDOWN_ROWS`: per channel, the breakdown rows as `{ key, label }`.
- `OUTLINE_PENDING_Q6`: the four question 6 rows, named, not rendered. When Jasmine answers,
  each is a one-line move into the rows above.
- Keyed by channel name string, so the TikTok rows sit here before PR 247 merges and switch on
  when TikTok joins `CHANNELS`.

Rows per tab:

| Tab | Data (`standard`) | Data (`profileClicks`, Kenect) | Under the graph |
|---|---|---|---|
| Instagram | Total Followers, Net New Followers, Views, Total Engagements, Engagement Rate, Profile Views | the same, then Profile Clicks | Likes, Comments, Shares, Saves, Reposts |
| Facebook | Total Followers, Net New Followers, Views, Total Engagements, Engagement Rate, Video Views | same as standard | Reactions, Comments, Shares, Post Clicks |
| LinkedIn | Total Followers, Net New Followers, Views, Total Engagements, Engagement Rate, Profile Views, Video Views | same as standard | Reactions, Comments, Shares, Post Clicks |
| TikTok (after PR 247) | Total Followers, Net New Followers, Views, Total Engagements, Engagement Rate, Profile Views | same as standard | Likes, Comments, Shares, Completion Rate |

Pending question 6, not rendered: Instagram Video Views, Facebook Profile Views, TikTok Video
Views, TikTok Reposts.

Engagement Rate keeps today's Dash metric per channel. Jasmine asked that it match Dash, and the
code comments record that it does; changing it is not part of this.

### 2. `lib/organic-social/outline-headlines.ts`

- `getOutlineKpis(slug, dateRange, compareRange, channel)`, wrapped in React `cache`: one Dash
  request per tab for the channel's tile metrics plus its extra rows, in the same request shape
  as `getPlatformHeadlines`. Both new parts call it with the same arguments, so a tab still makes
  one headline request, as today.
- `buildOutlineKpis(channel, metrics, specs)`, pure: the same rules as `buildPlatformHeadline`.
  A requested metric missing from a 200 throws; every metric null means no data; percents scale
  by 100; the delta comes from Dash's context value; footnotes carry through.
- `selectOutlineRows(kpis, rows, channel)`: picks the rows in order with the outline's labels,
  returning a `PlatformHeadline` the existing tile component already renders.

`delta` in `headline-build.ts` gains an `export` so both builders share one definition. That is
the only edit to a file on Renaissance's render path besides the registry, and it changes no
behaviour.

### 3. The parts

- `platform-headlines@2` (standard rows) and `platform-headlines@3` (Profile Clicks rows) in
  `parts/outline-data.tsx`. Same Suspense skeleton and error fallback as v1, same tile component.
  With no channel (Overview) or a channel no outline covers (X), they render v1 unchanged.
- `engagement-breakdown@1` in `parts/engagement-breakdown.tsx`: the breakdown tiles in a grid
  with no heading, placed directly after the engagement graph. With no channel or no rows for
  the channel it renders nothing.
- All three `published: false`. Unpublished parts can be pinned per client, but a promotion into
  the shared template, which Renaissance reads, is refused. The cost: freezing these clients'
  layout is also refused until someone publishes the parts. No client in prod, staging or dev
  has a frozen layout (checked read only on 2026-09-18).
- Registered in `parts/registry.ts`; v1 entries unchanged.

### 4. Turning it on, per client (a staging write, later)

```json
"organic-social:platform": {
  "versions": { "platform-headlines": 2 },
  "extraParts": [{ "id": "engagement-breakdown", "version": 1 }],
  "order": ["platform-headlines", "follower-graph", "engagement-trend", "engagement-breakdown", "top-content"]
}
```

`a-place-for-mom` and `joy-of-life` pin version 2, `akara-living` version 3. The write waits
until this PR's code is on staging: pinning a version the deployed code does not have renders
nothing, so writing early would blank the Data block on staging. It needs my go, runs through a
staging-only, dry-run-first, NULL-only script with in-transaction rollback checks, and its undo
is removing the `organic-social:platform` key.

## Proof that Renaissance does not change

- No change to `PLATFORM_KPIS`, `headlines.ts`, `platform-headlines.tsx` or the v1 parts. The
  one edit on the path is the `export` keyword on `delta`.
- Every existing test and golden snapshot passes unchanged.
- New test: the template with no platform override (Renaissance's case) resolves to exactly
  `platform-headlines@1`, `follower-graph@1`, `engagement-trend@1`, `top-content@2`.
- New test: the new parts are unpublished, so a template referencing them fails the published
  check that guards promotion.
- The drift check in prod, staging and dev: surface, row and users, part pins identical.

## Tests

- Rows: every outline row in outline order with the outline's label; every row key resolves to
  a spec for every channel in `CHANNELS`; the extra rows never reuse a `PLATFORM_KPIS` key; no
  question 6 row renders.
- Fetch: one request per tab, the tile metrics plus the extras, the tiles' request shape.
- Build: missing metric throws, all-null is no data, percent scaling, delta, labels, footnotes.
- Parts: v2 and v3 pick their rows; the breakdown shows its rows with no heading; Overview and
  uncovered channels fall back as described.
- Config: the opt-in above passes the app's own validator with the real registries and resolves
  to the five parts in outline order with the right versions.

## Edge cases

The new fetch crosses a network boundary and reads untrusted Dash payloads:

- **External failure:** fix. Timeouts and errors reuse `safe()` and the existing fallback card;
  a 200 missing a requested metric throws rather than showing a fabricated zero.
- **Input boundaries:** fix. Every value read is guarded (`?.value ?? 0`, context null or zero
  gives no delta), as in the v1 builder.
- **Bounds:** decline. One request per tab with at most 12 metrics (Instagram: 11 tile metrics plus Profile Clicks).
- **Operator visibility:** decline. Failures log and render the same fallback as v1.
- **State and concurrency:** decline. Read only, per-request cache.
- **Security:** decline. No new data reaches the browser beyond the tiles' numbers; brand ids
  stay server side.

## Overlaps

- PR 247 (TikTok): its rows are already in the layout and switch on when it merges; the key
  test then covers them.
- PR 252 (annotations): separate ids and versions (`follower-graph@2`, `engagement-trend@2`).
  The opt-in above does not pin graph versions, so annotations remain their own opt-in.
- PR 250: no files in common with this change.

## Open, not blocking

- Question 6: the four rows above. Question 1: Kenect's name and channel list. Question 3:
  YTD Review, not built here.
