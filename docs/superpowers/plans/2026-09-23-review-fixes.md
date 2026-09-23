# Plan: Paul's 2026-09-23 review fixes across PRs 252, 255, 256

> **Status:** written 2026-09-23, NOT yet implemented. Adversarial review first, then code.
> No code is changed by this document.

**Scope.** The eight findings Paul posted at 17:45Z on 2026-09-23, across the three open
October PRs. Three are ● correctness, five are ○ cleanup. Nothing else is in scope: no
refactors, no drive-by fixes, no widening.

| # | PR | Sev | Location | Finding |
|---|---|---|---|---|
| 1 | 256 | ● | `lib/organic-social/locking-client.ts:70` | The capture can freeze a stale cached answer |
| 2 | 256 | ● | `lib/organic-social/lock-day.ts:84` | Request-shape change silently misses every existing lock |
| 3 | 252 | ● | `components/report-sections/organic-social/annotation-callouts.tsx:85` | Hidden callouts print in an exported PDF |
| 4 | 255 | ● (low) | `lib/organic-social/outline-top-content.ts:56` | A correct handle is distrusted when no post in the window is client-authored |
| 5 | 252 | ○ | `parts/annotation-hides.ts:23` | "Fail closed without a client row" has no test |
| 6 | 252 | ○ | `parts/follower-graph.tsx:40` | Comment claims no extra request; the reads don't actually share |
| 7 | 255 | ○ | `lib/organic-social/outline-media.ts:19` | A present-but-malformed media entry reads 0 instead of flagging |
| 8 | 256 | ○ | `lib/organic-social/locking-client.ts:33` and `app/api/cache-warm/route.ts:134` | Empty-but-shaped answers count as complete; the sweep is last in the warm queue |

**Order.** 256 first (it blocks a merge), then 252 (client-facing before Jasmine's demo),
then 255. One branch at a time, each PR's fixes on its own branch, no cross-branch edits.

---

## Before any code: the snapshot

Taken once per branch, before the first edit, so "nothing else moved" is provable rather
than asserted:

1. `npx vitest run` and record the exact pass count.
2. `npx tsc --noEmit` and `npm run check:rsc`, both expected clean.
3. `git rev-parse HEAD` and the sha256 of every `__snapshots__` file the branch owns.
4. Renaissance drift check, read only, in all three databases.

Re-run all four after the fix. Any golden snapshot that changes is a defect in the fix
until proven otherwise, because none of these findings should alter a rendered pixel for
Renaissance or for a client.

---

## Finding 1 (●, 256): the capture can freeze a stale cached answer

### Mechanism, proven not assumed

Verified against the installed Next 16.1.6, reading
`node_modules/next/dist/server/lib/patch-fetch.js`:

1. `DashSocialClient.request` sends every Dash call with `next: { revalidate: 3600 }`
   (`lib/dash-social/client.ts:46`).
2. On a **dynamic** request the work unit store has type `'request'`, and that case
   **breaks without assigning** `revalidateStore` (`patch-fetch.js:274-278`).
3. So `autoNoCache` is `false` (`:374`), because it requires
   `revalidateStore?.revalidate === 0`. **The `Authorization` header does not disable
   caching on its own.** This was my first guess at why the finding might be wrong, and it
   is wrong: the header only forces no-cache when the route's revalidate is already 0.
4. `hasNoExplicitCacheConfig` is also false, because the fetch sets an explicit
   `revalidate`. So neither auto-no-cache path fires and the response is cached.
5. Past the 1 hour TTL, on a dynamic request `isStaticGeneration` is false, so Next takes
   the else branch at `:722-744`: it fires a background revalidate and returns
   `entry.value.data`, **the stale body**.
6. `locked()` calls `live()`, receives that stale body, `complete()` passes on it because
   it is well-formed, and it is written to `dash_response_locks` permanently.

Paul's worked example holds: the team views August on Sep 2, nothing re-requests that URL,
the Sep 5 sweep captures Sep 2's numbers and locks them forever. That defeats D27, which
is the whole point of locking on the 5th.

### Fix

Give the capture path a reader that cannot be served from the fetch cache. The capture is
the only call that must be fresh; every other read may be cached, and should stay cached,
because that is what keeps the pages fast.

- `DashSocialClient` gains one constructor option, `noStore?: boolean`. When set,
  `request()` sends `cache: 'no-store'` and **omits** `next.revalidate` entirely. Both must
  not be sent together: `patch-fetch.js:320-329` treats `cache: 'no-store'` plus
  `revalidate > 0` as a conflict, warns, and unsets **both**, which would silently restore
  the cached path. This is the trap in the obvious version of this fix.
- `lockingClient` takes a second reader, `capture`, used only for the fetch whose result
  will be written. Everything else keeps using `inner`.
- `base.ts` constructs the second client and passes it, so the wiring is explicit at the
  one place that already knows the client is a locked one.

Rejected alternative: a per-call `{ noStore }` argument on every reader method. It has to
be threaded through `getReportsData`, `getContent` and `getMedia`, widens three public
signatures, and puts the decision at every call site instead of one.

### Tests (written first, each proven to fail before the fix)

1. The capture calls the capture reader, not `inner`. Fails today.
2. A lock **hit** never calls either live reader.
3. An incomplete answer still returns the live value and writes nothing (existing behaviour
   pinned, must not regress).
4. `DashSocialClient` with `noStore` passes `cache: 'no-store'` and **no** `next` key; the
   default client passes `next.revalidate: 3600` and no `cache` key. Asserted against a
   fake fetch that records its init. This is the test Paul asked for, and it is deterministic
   without touching Next internals.

### Blast radius

`lockingClient` has three call sites (`base.ts` and two test files). Only clients with
`reportingMonths` get the locking wrapper at all, so Renaissance is untouched by
construction. The extra client instance is created only on that path. No rendered output
changes, so every golden snapshot must be byte-identical.

### Edge-case gate (this change crosses a network boundary and writes shared state)

| Item | Call |
|---|---|
| External failure: the capture fetch now bypasses the cache, so a Dash outage on lock day fails the capture where a stale hit would previously have masked it | **fix** in the sense that it is the intended behaviour: an incomplete or failed answer is already not written (`locked()` returns live and logs `lock skipped`). Add a test that a throwing capture writes nothing. |
| Operator visibility: which client and month failed to capture at 3am | **fix**. The existing `lock skipped` and `late lock` warnings already carry slug, period end and key prefix. Confirm the capture-failure path logs one of them, and add it if it does not. |
| Bounds: no loop is added, one extra fetch per uncached capture | **decline**, nothing to bound. |
| Input boundaries: `complete()` already validates the shape before a write | **file**. Finding 8 widens `complete()`; kept separate so this change stays one thing. |
| State and concurrency: two renders capturing the same key at once | **file**. The insert race already has a test per Paul's review ("the insert race ... has a test that fails when broken"). Bypassing the cache makes a duplicate live fetch marginally more likely, not a new failure mode. Confirm the existing test still covers it. |
| Security: the token is in a header, never a URL; no new logging of a response body | **decline**, nothing changes. |

---

## Finding 2 (●, 256): request-shape change silently misses every lock

### Mechanism

`requestKey` hashes the literal request: dates with their `T04:00:00Z` suffix, the metric
list, the limit. Change any of that later and every existing lock key misses, so months
clients have already seen are silently recaptured from live Dash and can show different
numbers. The only signal is a `late lock` warning in a log nobody is watching at the time.

This is not hypothetical: the edge-27 fix tracked on #250 changes exactly this, and so does
adding a KPI to a tab, which is a routine outline change.

### Fix

No behaviour change. Add a characterisation test that pins the exact request keys the
getters produce for one fixed month, so that changing a request shape fails CI and forces a
deliberate decision (recapture, or map old keys forward). Note it on the edge-27 follow-up
in `CLAUDE.md` so whoever does that work sees it.

### Blast radius

Test-only plus one doc line. Zero runtime change.

---

## Finding 3 (●, 252): hidden callouts print in an exported PDF

### Mechanism, confirmed in the tree

- Export PDF is `window.print()` (`components/export-pdf-button.tsx:8`).
- `@media print` and the `.no-print` helper already exist
  (`app/globals.css:265`, `:278`), and the export button and the data-chat widget both use
  it. So there is an established convention to follow, not a new one to invent.
- A hidden annotation's `<li>` renders faded at `opacity-40` with its thumbnail, the text
  "Hidden from client" and the Hide/Unhide button
  (`annotation-callouts.tsx:85-99`). None of it carries `no-print`.
- So a PDF that staff export from a client's view contains the very callouts the team hid
  from that client.

**What is already correct, and limits the fix:** the chart dot is dropped for a hidden
annotation for everyone including staff
(`trends.tsx:132`, `marks={visible?.filter((a) => !a.hidden)...}`, commit `a0fea87`). So
there is no orphan dot on the printed chart and the fix does not need to touch the chart.

### Fix

`no-print` on the hidden row, and on the Hide/Unhide button for every row. The button is a
control and should never print. The container is a bare `<ul>` with no heading and no
border, so hiding every child leaves an empty zero-height flex box and no visible artifact
(checked: `annotation-callouts.tsx:112`).

### Tests

1. A hidden annotation's `<li>` carries `no-print`; a visible one does not.
2. The toggle button carries `no-print` on both a hidden and a visible row.
3. The chart marks for a hidden annotation stay absent (existing behaviour, re-pinned so
   this change cannot quietly alter it).

### Blast radius

Two class strings in one client component. The golden snapshots for the annotated graphs
will change, because the class list is part of the rendered output. That is expected and is
the **only** snapshot change allowed by this fix. Renaissance renders v1 and never reaches
this component.

### Out of scope, deliberately

The "Annotations" legend pill is also a control that prints. Cosmetic, not a leak, and not
in Paul's finding. **file**, not fixed here.

---

## Finding 4 (● low, 255): own-handle distrusted when no post is client-authored

Not yet investigated in the code. Paul's mechanism: the rule distrusts a correct handle
whenever no Instagram post in the window is authored by the client, for example a month
whose only posts are partner-authored collabs. It then falls back to `#ad`, collab posts
without `#ad` land in the owned Top 5, and the log says "own handle matches no post
author", which is wrong.

His suggestion: distrust only when every authored post shares one author that is not the
stored handle, which is what a rename actually looks like. Or validate the handle once when
it is saved.

**To do before planning the fix:** read `outline-top-content.ts` around `:56`, find the
existing tests, and decide between the two shapes. Written up here as a placeholder rather
than guessed at, because this one decides what a client sees in their Top 5.

---

## Findings 5 to 8 (○)

Each is small and understood from Paul's note, but none has been read in the code yet:

- **5 (252):** add the missing test that a missing client row fails closed, so reverting
  `a0fea87` to fail open breaks the suite.
- **6 (252):** the comment claims the post read costs no extra request. It is wrong because
  the `AbortSignal` opts the call out of Next's per-request dedupe. Fix the comment, or make
  Top Content share the read. Prefer fixing the comment: sharing the read is a bigger change
  than the finding warrants, and Finding 1 is already touching this area.
- **7 (255):** default to 0 only when the media type is absent; throw otherwise so the row
  gets its "Could not load" flag, matching `buildHeadlines` (`outline-headlines.ts:29-30`).
- **8 (256):** treat empty-but-shaped answers as incomplete so a transient empty answer on
  lock day cannot be locked forever; and put the sweep first in the warm queue, or give it
  its own cron, so it is not what gets cut when a run overruns.

---

## Merge path

1. Fixes land on each PR's own branch. Every branch is pushed as soon as it has its first
   commit.
2. Paul re-reviews what he asked for, on the PR where he asked for it.
3. The three merge into `organic-social-october`, any order, zero conflicts re-proven
   across the whole set.
4. `organic-social-october` promotes to `dev` as one reviewed unit.
5. #252 stays in draft until Jasmine has seen the annotations, per Paul's own note. The
   fixes do not change that.

## Open question for the reviewer

Finding 1 adds a second `DashSocialClient` instance per locked client per render. It is
constructed inside `dashClientFor`, which is `React.cache`-wrapped, so it is once per render
and not once per call. Confirm that is acceptable rather than threading a per-call flag.
