# Plan: a malformed media answer is flagged, not shown as zero (Paul's ○ on PR 255, `outline-media.ts:19`)

> One finding. Every statement below was read from the code while writing this file, with the
> command that produced it in brackets. Nothing from memory, nothing inferred.

## Paul, verbatim

> An absent `reel` entry correctly means zero. But if `reel` is present and
> `metrics.VIEWS.ALL_CHANNELS` isn't, this also reads 0, with no flag and no log.
> `buildHeadlines` throws in the same situation (`outline-headlines.ts:29-30`). Default to 0 only
> when the media type is absent, and throw otherwise so the row gets its "Could not load" flag.

## What the code does

`buildMediaKpis` [`sed -n '11,24p' lib/organic-social/outline-media.ts`]:

```ts
if (!data?.[String(brandId)]) throw new Error(`${channel}: Dash returned no media data for this brand`)
for (const s of specs) {
  const m = data[s.mediaType]?.metrics?.[s.metric]?.ALL_CHANNELS
  out[s.key] = { ..., value: m?.value ?? 0, delta: delta(m) }
}
```

The optional chain collapses four different situations into the same `0`:

| # | shape | today | should be |
|---|---|---|---|
| 1 | `data.reel` absent | 0 | 0, unchanged. No posts of that type in the window is a real zero. |
| 2 | `data.reel` present, no `metrics` | 0 | throw |
| 3 | `data.reel.metrics` present, no `VIEWS` | 0 | throw |
| 4 | `data.reel.metrics.VIEWS` present, no `ALL_CHANNELS` | 0 | throw |

Rows 2 to 4 are Paul's finding. Row 1 is the case he explicitly wants left alone.

**A fifth shape must NOT throw, and it is the one a careless fix breaks:** `ALL_CHANNELS`
present with a null `value`. Today that is `?? 0`, and it is a legitimate answer, so the new
rule must key off the shape being absent, not off the value being falsy.

## Why this cannot disturb the existing tests

The brand entry is checked only by the guard on the first line; the loop reads `data[s.mediaType]`
and never the brand key. The existing fixture is `const brand = { 42: { metrics: {} } }`
[`sed -n '13,15p' lib/organic-social/outline-media.test.ts`], which has **no `reel` key**, so it
is row 1 and stays zero. The test `no reels in the window is zero, with no arrow` keeps passing
unchanged [`sed -n '21,23p' lib/organic-social/outline-media.test.ts`].

## Where the throw surfaces, checked rather than assumed

`outline-data.tsx` wraps the call in `safe`, logs `Views on Reels failed`, and builds
`failed = new Set(m.data ? [] : media.map((x) => x.key))`, so every media row of that tab is
flagged `MEDIA_FAILED` ("Could not load from Dash")
[`git show "origin/feat/organic-social-no-overview:components/report-sections/organic-social/parts/outline-data.tsx" | sed -n '18,32p'`].

Two consequences to state honestly rather than imply:

- The accurate invariant is **every media row of that tab**, not the one malformed row. Today
  that is one row, because `OUTLINE_MEDIA_KPIS` has a single Instagram spec.
- The Data block is **not** blanked. `selectOutlineRows` short-circuits on a row already marked
  `unavailable` before its own "no tile for outline row" throw, so a flagged row renders as the
  flag and the rest of the block renders normally.

## The fix

Split the optional chain so the absent case is explicit and everything else throws:

```ts
const entry = data[s.mediaType]
if (!entry) { out[s.key] = zeroRow(s); continue }      // row 1, Paul's "absent means zero"
const m = entry.metrics?.[s.metric]?.ALL_CHANNELS
if (!m) throw new Error(`${channel}: Dash returned ${s.mediaType} without ${s.metric}`)
out[s.key] = { ..., value: m.value ?? 0, delta: delta(m) }
```

`m.value ?? 0` is kept deliberately: shape 5 above.

## Tests

1. `reel` present with no `metrics` throws.
2. `reel` present, `metrics` present, no `VIEWS` throws.
3. `VIEWS` present, no `ALL_CHANNELS` throws.
4. `reel` absent is still zero with no arrow (the existing test, re-pinned in the new file so the
   pair reads together).
5. `ALL_CHANNELS` present with a null value is still zero and does **not** throw.
6. The brand entry's own empty `metrics` object still does not throw, so the guard and the loop
   stay independent.

Each proven to fail against the current code before the change.

## Risk to disclose on the PR, not hide

The lock stores Dash's raw response before any builder parses it, and the media branch of
`completeReportsData` accepts a media answer on the brand entry alone. So once #255 and #256 are
both on `organic-social-october`, a malformed media answer captured on lock day is stored
permanently and this throw then shows "Could not load" for that month forever, with no unlock
tool. That is worse than today in permanence and better in honesty, since today shows a
fabricated `0`. Paul asked for the visible flag. It is named on the PR as a known gap, together
with the fact that narrowing `completeReportsData` to prevent it cannot be scoped: the media
request carries no media type, so the completeness check cannot know which entry matters.

## Not done

No change to the brand-entry guard, no change to `delta`, no new flag type (`MEDIA_FAILED`
already exists), no change to `completeReportsData`.
