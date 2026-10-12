# Plan: pin the lock keys the getters produce (Paul's ● on PR 256, `lock-day.ts:84`)

> One finding. Test only, no behaviour change. Every statement below was read from the code
> while writing this file; the command that produced it is named in brackets. Nothing here is
> from memory or inference.

## Paul, verbatim

> The lock key hashes the literal request: date strings with their `T04:00:00Z` suffix, the
> metric list, `limit`. Any later change to request shape misses every existing lock and
> silently recaptures live numbers for months clients have already seen. The only signal is a
> `late lock` warning. The edge-27 fix tracked on #250 does exactly this. So does adding a KPI
> to a tab.
>
> Please add a test that pins the request keys the getters produce for a fixed month, so a shape
> change fails CI and forces a deliberate decision (recapture, or map old keys). Also note it on
> the edge-27 follow-up.

## What the code does

**The key.** `requestKey(method, params)` sha256s `{method, params}` after dropping `undefined`
values and sorting keys [`sed -n '83,86p' lib/organic-social/lock-day.ts`]. The only existing
test pins argument-order stability and that a real difference changes the hash
[`sed -n '66,71p' lib/organic-social/lock-day.test.ts`]. Nothing pins what the getters produce.

**Which getters reach the lock.** `locked()` computes a key for `getReportsData` and
`getContent`; `getMedia` is passed straight through to `inner`
[`sed -n '102,115p' lib/organic-social/locking-client.ts`].

**The five requests a scoped Instagram month produces**, each read at its call site:

| # | getter | method | shape |
|---|---|---|---|
| 1 | `getPlatformHeadlines` | getReportsData | `TOTAL_GROUPED_METRIC`, `aggregateBy: 'BRAND'`, `requirePosts: true`, metrics from `metricNamesFor`, **with** context dates [`sed -n '15,45p' lib/organic-social/headlines.ts`] |
| 2 | `getFollowerGraph` | getReportsData | `GRAPH`, `timeScale: 'DAILY'`, `metrics: [TOTAL_FOLLOWERS]`, **no** context dates [`sed -n '18,45p' lib/organic-social/followers.ts`] |
| 3 | `getEngagementTrend` | getReportsData | same as 2 with the engagements metric [`sed -n '18,45p' lib/organic-social/trends.ts`] |
| 4 | `getTopContent` owned | getContent | `channel: ch`, `metric: CONTENT_METRIC[ch]`, `limit: 500` [`sed -n '140,155p' lib/organic-social/top-content.ts`] |
| 5 | `getTopContent` UGC | getContent | `channel: 'INSTAGRAM_UGC'`, `metric: 'UGC_TOTAL_ENGAGEMENTS'`, same dates and limit, only when the targets include Instagram [`sed -n '163,178p' lib/organic-social/top-content.ts`] |

**Two facts the test must pin, because both are exactly what Paul's sentence is about:**

- **The date format differs by getter.** Getters 1 to 3 use `isoRangeTz`, which appends the
  literal `T04:00:00Z`; getter 4 and 5 use `isoRange`, which is plain `yyyy-mm-dd`
  [`grep -n "isoRange(\|isoRangeTz(" lib/organic-social/{headlines,followers,trends,top-content}.ts`].
- **The graphs have no baseline key.** `priorParams` returns null unless
  `contextStartDate` and `contextEndDate` are both strings
  [`sed -n '69,81p' lib/organic-social/lock-day.ts`], and only `headlines.ts` sends them: the
  count is 1 for headlines, 0 for followers, 0 for trends
  [`grep -c contextStartDate lib/organic-social/{followers,trends,headlines}.ts`]. So exactly one
  baseline key exists for this month, from the headlines request.

## The fix

A characterisation test, no production change.

**Fixture, every value fixed so the hash cannot move with the clock, the environment or the DB:**

- `vi.setSystemTime` frozen, because `settledThrough` is derived from `requestClock()` and decides
  whether a key is computed at all [pattern: `sed -n '23,29p' lib/organic-social/lock-wiring.test.ts`].
- `getClientBySlug` mocked, because `brandId` and the channel allowlist come from the DB through
  `dashClientFor` [`sed -n '42,52p' lib/organic-social/base.ts`].
- `dateRange` and `compareRange` both `custom:` ranges. A preset would resolve against today and
  the pinned hash would rot.
- One channel, Instagram, so the set of keys is exactly the five above.

**Assertion shape:** drive the real getters through a real `lockingClient` and assert the keys it
hands the lock store (`deps.read`), not keys the test recomputes itself. Recomputing would pin
params to hash, which is not what Paul asked for; he asked for the keys **the getters produce**.

**Each pinned key is asserted alongside the params that produced it**, so a failure reads as "this
request changed shape" rather than two hex strings that tell the reader nothing.

## What this cannot catch, stated rather than implied

A change to a getter's request that is made **together** with a deliberate update to this test.
That is the point: the test forces the decision to be deliberate, it does not prevent it.

## Also asked for

The note about this on the edge-27 follow-up. It goes **both** on PR #250 and in the `CLAUDE.md`
follow-up list, because #250 is already merged
[`gh pr view 250 --json state`] and a note on a merged PR is not somewhere anyone reads before
changing a request shape.

## Not done

No change to `requestKey`, no key-versioning scheme, no migration of existing keys. He asked for a
test and a note.
