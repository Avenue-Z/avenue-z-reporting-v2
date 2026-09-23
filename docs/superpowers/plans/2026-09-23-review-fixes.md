# Plan: Paul's 2026-09-23 review fixes across PRs 252, 255, 256

> **Status:** revised 2026-09-23 after an adversarial review that broke four parts of the
> first draft. NOT yet implemented. No code is changed by this document.
>
> **What the review changed, and why the first draft was wrong, is recorded in §0.** That
> section stays in the file: the near-misses are the useful part.

**Scope.** The eight findings Paul posted at 17:45Z on 2026-09-23. Three ● correctness,
five ○ cleanup. Nothing else: no refactors, no drive-by fixes.

| # | PR | Sev | Location | Finding |
|---|---|---|---|---|
| 1 | 256 | ● | `locking-client.ts:70` | The capture can freeze a stale cached answer |
| 2 | 256 | ● | `lock-day.ts:84` | Request-shape change silently misses every existing lock |
| 3 | 252 | ● | `annotation-callouts.tsx:85` | Hidden callouts print in an exported PDF |
| 4 | 255 | ● (low) | `outline-top-content.ts:56` | A correct handle is distrusted when no post is client-authored |
| 5 | 252 | ○ | `parts/annotation-hides.ts:23` | "Fail closed without a client row" has no test |
| 6 | 252 | ○ | `parts/follower-graph.tsx:40` | Comment said to be wrong about request sharing. **It is not. See §0.** |
| 7 | 255 | ○ | `outline-media.ts:19` | A present-but-malformed media entry reads 0 instead of flagging |
| 8 | 256 | ○ | `locking-client.ts:33`, `cache-warm/route.ts:134` | Empty-but-shaped answers count as complete; sweep is last in the warm queue |

**Order.** 256 first (blocks a merge), then 252 (client-facing before Jasmine's demo), then
255. One branch at a time.

---

## §0. What the adversarial review caught in the first draft

Recorded because each of these would have shipped.

1. **Finding 6 was backwards.** The first draft accepted Paul's premise and planned to
   "fix the comment". The comment is accurate: `graphPosts` is `cache(...)` from React
   (`lib/organic-social/graph-posts.ts:13`) and its own doc says "the React-cached read
   **both graphs of a tab** share". The two graphs genuinely do share one fetch, so
   rewriting that comment would have inserted a falsehood into correct code. Paul read
   "costs no extra request" as a claim about Top Content too, which is the ambiguity worth
   closing, not the mechanism.
2. **Finding 3's blast radius was wrong in the dangerous direction.** The draft said the
   annotated-graph golden snapshots "will change … that is expected". They will not:
   all 17 `__snapshots__` files on the 252 branch contain zero annotation markup (grepped
   for `Hidden from client`, `Unhide`, `aria-label="Annotations"`, all zero), because every
   golden fixture passes no annotations on purpose. The draft would have pre-authorised a
   snapshot diff this fix cannot legitimately produce, which is exactly the hole an
   unrelated regression walks through.
3. **The call-site count was off by 6x.** The draft said `lockingClient` has "three call
   sites (`base.ts` and two test files)". It is 18: one in `base.ts` and **17** in
   `locking-client.test.ts`. The two files the draft named, `lock-wiring.test.ts` and
   `lock-parity.test.ts`, call it zero times; they go through `dashClientFor`.
4. **The capture-failure logging row was filed as "confirm" when it should be "fix".** In
   `locked()`, `const res = await live()` is **not** inside the `store()` try/catch, so a
   throwing capture logs nothing at all.

The review also supplied a **simpler fix for Finding 1** than the draft's, adopted below.

---

## Before any code: the snapshot

Per branch, before the first edit:

1. `npx vitest run`, record the exact pass count.
2. `npx tsc --noEmit` and `npm run check:rsc`, both expected clean.
3. `git rev-parse HEAD` and the sha256 of every `__snapshots__` file on the branch.
4. Renaissance drift check, read only, all three databases.

Re-run after. **For every finding in this plan the expected golden-snapshot diff is zero.**
A changed snapshot is a defect in the fix until proven otherwise.

---

## Finding 1 (●, 256): the capture can freeze a stale cached answer

### Mechanism

Verified in the installed Next 16.1.6 (`node_modules/next/dist/server/lib/patch-fetch.js`),
each link read rather than assumed:

1. Every Dash call is sent with `next: { revalidate: 3600 }` (`lib/dash-social/client.ts:46`).
2. On a dynamic request the work unit store is type `'request'`, whose case **breaks
   without assigning** `revalidateStore` (`:274-278`).
3. So `autoNoCache` is false (`:374`): it requires `revalidateStore?.revalidate === 0`.
   **The `Authorization` header does not disable caching on its own**, which was the first
   draft's guess at why this finding might be void, and it is wrong.
4. `hasNoExplicitCacheConfig` is false too, because the fetch sets an explicit revalidate
   (`:368`). `export const dynamic = 'force-dynamic'` would not save it either:
   `noFetchConfigAndForceDynamic` (`:340`) requires `!currentFetchRevalidate`, which 3600
   defeats. So the response is cached (`:534`).
5. Past the TTL, on a dynamic request `isStaticGeneration` is false, so Next takes the else
   branch at `:722-744`, fires a background revalidate and returns `entry.value.data`, the
   stale body.
6. `locked()` hands that to `complete()`, it passes because it is well formed, and it is
   written to `dash_response_locks` permanently.

**Two honest caveats to state to Paul rather than claim a fully proven chain:**

- Step 5 is correct as Next code. Whether a days-old entry is actually returned depends on
  the cache handler Vercel injects (`incremental-cache/index.js:58-71`), whose age and
  eviction policy is not in `node_modules` and cannot be verified from this repo.
- The trigger is narrower than the draft's worked example. Before month M's lock day
  `settledThrough` returns M-1, so `locked()` early-returns `live()` for M, and
  `lockSweepUrls` never renders M before its lock day. So a stale entry exists only if a
  **human** viewed that exact month, tab and `custom:` range earlier and the data cache
  still holds it. Real, and worth fixing, but that is the honest exposure.

### Fix (revised: smaller than the draft's)

The draft added a `noStore` constructor option to `DashSocialClient`. Not needed. The class
already takes `fetchImpl` (`client.ts:25`), so the capture client is built by wrapping it:

```ts
new DashSocialClient({ token, fetchImpl: (u, i) => fetch(u, { ...i, cache: 'no-store', next: undefined }) })
```

`getNextField` tests `typeof init?.next?.[field] !== 'undefined'` (`patch-fetch.js:254-257`),
so `next: undefined` reads as **absent** and the conflict check never fires. That matters:
`cache: 'no-store'` sent **alongside** a live `next.revalidate` is treated as conflicting
(`:320-329`), warns, and unsets **both**, silently restoring the cached path. A fix that
looks right and does nothing.

`lockingClient` takes the capture reader as a **required** field on `Opts`, not an optional
positional argument. Required, because an optional one defaulting to `inner` reinstates the
exact bug the moment anyone constructs the wrapper without it. `tsc` then forces all 18
call sites, which is the point.

### Tests (each written first and proven to fail)

1. The capture uses the capture reader; `inner` is not called on a miss.
2. A lock hit calls neither live reader.
3. An incomplete answer returns live and writes nothing (existing behaviour, re-pinned).
4. A **throwing** capture writes nothing and logs once (see the edge-case table).
5. A client built with the capture `fetchImpl` sends `cache: 'no-store'` and **no** `next`
   key; the default client sends `next.revalidate: 3600` and no `cache` key. Asserted
   against a fake fetch that records its init. This is the test Paul asked for, and it needs
   no Next internals.

### Blast radius

18 `lockingClient` call sites (1 in `base.ts`, 17 in `locking-client.test.ts`). Only clients
with `reportingMonths` get the wrapper, so Renaissance is untouched by construction.
`DashReader = Pick<DashSocialClient, …>` is unaffected. `lock-wiring.test.ts:29` spies on
`DashSocialClient.prototype.getReportsData`, so a second instance is still stubbed;
`lock-parity.test.ts:14` asserts the unlocked path's prototype and is unaffected. Zero
rendered output changes, so zero snapshot changes.

### Edge-case gate (crosses a network boundary, writes shared state)

| Item | Call |
|---|---|
| External failure: a Dash outage on lock day now fails the capture where a stale hit previously masked it | **fix**, as intended behaviour. Test 4 pins that nothing is written. |
| Operator visibility | **fix** (promoted from "confirm"). `live()` at `locking-client.ts:70` is outside the `store()` try/catch, so a throwing capture logs nothing. Wrap the miss path and log `lock capture failed ${tag(end, key)}` before rethrowing. Note the nuance: `channelErrorPolicy(scoped=false)` swallows the throw only on Overview, and all three October clients hide Overview, so their sweep reads are scoped and do rethrow. It is still silent in practice because the sweep is a cron and its pages return 200 even when a part errors. |
| Bounds | **fix the claim** (the draft said "nothing to bound"). `no-store` also loses the data cache's cross-render dedupe and its `incrementalCache.lock`, so concurrent identical captures all reach Dash. Bounded (once the lock row exists `live()` is never called again) but it must be stated, alongside the retry ladder (`client.ts:56-64`, up to 10s on a 429) against `maxDuration = 300`. |
| Input boundaries | **file**. Finding 8 widens `complete()`; kept separate so this change stays one thing. |
| State and concurrency | **confirm** the existing insert-race test still covers it. Bypassing the cache makes a duplicate live fetch likelier, not a new failure mode. |
| Security | **decline**. Token stays in a header, no response body is logged. |

---

## Finding 2 (●, 256): request-shape change silently misses every lock

No behaviour change. Add a characterisation test pinning the exact request keys the getters
produce for one fixed month, so a shape change fails CI and forces a deliberate decision
(recapture, or map old keys forward).

The draft said "the getters" without naming them. The test must cover `getPlatformHeadlines`
(`headlines.ts:29-40`), both graph getters, `getContent` (`top-content.ts:147`, `:172`), and
**the `priorParams`-derived baseline key** (`lock-day.ts:76-88`), which a shape change breaks
just as silently. `lock-day.test.ts:67-70` currently pins only argument-reorder stability.

Note it on the edge-27 follow-up in `CLAUDE.md`, since that work changes exactly this.

---

## Finding 3 (●, 252): hidden callouts print in an exported PDF

### Mechanism, confirmed in the tree

- Export PDF is `window.print()` (`components/export-pdf-button.tsx:8`); `@media print` and
  `.no-print` already exist (`app/globals.css:265`, `:278`) and the export button itself
  uses the convention.
- A hidden annotation's `<li>` renders faded with its thumbnail, "Hidden from client" and
  the Hide/Unhide button (`annotation-callouts.tsx:85-99`), none of it `no-print`.

**What limits the fix:** the chart dot is already dropped for a hidden annotation for
everyone including staff (`trends.tsx:132`). No orphan dot, so the chart is not touched.

### Fix

1. `no-print` on a hidden row, and on the Hide/Unhide button for every row (it is a control).
2. **`no-print` on the `<ul>` itself when every item is hidden.** The draft claimed hiding
   every `<li>` leaves "no visible artifact". Wrong: the `<ul>`
   (`annotation-callouts.tsx:112`) is a direct DOM child of `<section className="space-y-3">`
   (`trends.tsx:76`, fragments add no node), and `space-y-3` applies `margin-top` via a
   sibling selector that `display: none` does not remove from the chain. An all-hidden list
   collapses to 0px and keeps its margin, leaving a stray gap in the PDF.

`.no-print` is (0,1,0) and no competing `!important` display rule in the print block matches
an `<li>` or `<button>` (`globals.css:270-307`). Record that `#__next > div` at (0,1,1)
*would* beat it, and is dead only because `#__next` is a Pages Router id the App Router never
emits, so nobody re-adds an id-scoped display rule there.

### Tests

1. A hidden row carries `no-print`; a visible one does not.
2. The toggle button carries `no-print` on hidden and visible rows.
3. An all-hidden list carries `no-print` on the `<ul>`; a mixed list does not.
4. Chart marks for a hidden annotation stay absent (existing behaviour, re-pinned).

### Blast radius

Class strings in one client component. **Zero golden snapshots change** (verified: 0 hits
for annotation markup across all 17 snapshot files). The only test touching the class list is
`annotation-callouts.test.tsx:93` (`toContain('opacity-40')`), which is unaffected.
Renaissance renders v1 and never reaches this component.

### Out of scope, deliberately

- The "Annotations" legend pill also prints. Cosmetic, not a leak. **file**.
- `parts/annotation-hides.ts:35`: when the hides table fails, `args.items` is returned
  unmarked, so previously-hidden annotations display **and** print normally. That is a
  degraded-path hole in the hide feature itself, wider than a print fix. **file**, and it is
  the same code path Finding 5 wants a test for.

---

## Finding 4 (● low, 255): own-handle distrusted when no post is client-authored

Not yet read in the code. Paul's mechanism: the rule distrusts a correct handle whenever no
Instagram post in the window is client-authored (for example a month of partner-authored
collabs), falls back to `#ad`, lands collab posts in the owned Top 5, and logs "own handle
matches no post author", which is wrong.

His two shapes: distrust only when every authored post shares one author that is not the
stored handle (what a rename looks like), or validate the handle once when it is saved.

**To do before planning:** read `outline-top-content.ts` around `:56` and its tests, then
choose. Left as a placeholder rather than guessed at, because this one decides what a client
sees in their Top 5.

---

## Findings 5, 7, 8 (○)

- **5 (252):** add the missing fail-closed test, so reverting `a0fea87` to fail open breaks
  the suite. Same code path as the `annotation-hides.ts:35` item filed above.
- **7 (255):** default to 0 only when the media type is absent; throw otherwise so the row
  gets its "Could not load" flag, matching `buildHeadlines` (`outline-headlines.ts:29-30`).
- **8 (256):** treat empty-but-shaped answers as incomplete, and put the sweep first in the
  warm queue (or give it its own cron). **The widening must explicitly cover the
  `MULTI_METRIC_MEDIA_TYPE` branch** (`locking-client.ts:29-31`), which returns `true`
  unconditionally on the brand entry. That is the one report type 255 introduces, so without
  it Findings 7 and 8 both look done while the gap between them stays open.

## Finding 6 (○, 252): resolved as no change

The comment at `parts/follower-graph.tsx:40-43` is accurate about what it claims. Tighten the
wording so "costs no extra request" cannot be read as a claim about Top Content, and reply to
Paul citing `graph-posts.ts:13`. Do **not** rewrite the mechanism, and do not make Top Content
share the read: the two graphs already share.

---

## Cross-PR composition gap (new, from the review)

Neither PR tests it: 252's `graphPosts` calls `fetchTopContentFrozen`, which 256 rewrites to
short-circuit to `fetchLive` for locked clients. After the merge, graph annotations for a
locked month come out of `dash_response_locks` through `getContent`, i.e. straight through
the Finding 1 capture path. Add one composition test on the deliverable branch after both
merge. **file** until then, since neither branch can test it alone.

## Merge path

1. Fixes on each PR's own branch, pushed as soon as each has its first commit.
2. Paul re-reviews on the PR where he raised it.
3. The three merge into `organic-social-october`, any order, zero conflicts re-proven.
   Textual conflicts checked: none. `lib/dash-social/client.ts` is touched by neither 252 nor
   255; `base.ts` and `locking-client.ts` are 256 only; `annotation-callouts.tsx` and
   `trends.tsx` are 252 only. `drizzle/0024_*` is on 252 and 256 only because it sits in
   their shared ancestor `a5a80ef`, not as two competing migrations.
4. `organic-social-october` to `dev` as one reviewed unit.
5. #252 stays in draft until Jasmine has seen the annotations.
