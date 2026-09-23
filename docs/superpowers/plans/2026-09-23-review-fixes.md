# Plan: Paul's 2026-09-23 review fixes across PRs 252, 255, 256

> **Status:** Finding 1 is implemented (`7b1d9c1`). Findings 2 to 8 are planned below and
> NOT yet implemented. This document changes no code.
>
> **Rule for this plan: no inferences.** Every item quotes Paul's comment verbatim, then
> states what the code actually does with a `file:line` anchor I read, then the fix, limited
> to what he asked for. Where he offered two options, one is chosen and the reason is a fact
> from the code, not a preference. Each item ends with what is deliberately NOT done, because
> scope drift is the failure mode this plan is guarding against.
>
> This file is the plan of record for all three PRs. It lives on `feat/os-locked-months`
> because that is where the work started; the 252 and 255 fixes land on their own branches.

| # | PR | Sev | Location | State |
|---|---|---|---|---|
| 1 | 256 | ● | `locking-client.ts:70` | **DONE** `7b1d9c1` |
| 2 | 256 | ● | `lock-day.ts:84` | planned below |
| 3 | 252 | ● | `annotation-callouts.tsx:85` | planned below |
| 4 | 255 | ● (low) | `outline-top-content.ts:56` | planned below |
| 5 | 252 | ○ | `annotation-hides.ts:23` | planned below |
| 6 | 252 | ○ | `follower-graph.tsx:40` | planned below |
| 7 | 255 | ○ | `outline-media.ts:19` | planned below |
| 8 | 256 | ○ | `locking-client.ts:33`, `cache-warm/route.ts:134` | planned below |

---

## §0. What the first adversarial review caught, and one thing it got wrong

Kept because the near-misses are the useful part.

**It was right about four things**, each verified before acceptance: Finding 3's blast radius
(zero snapshots change, not "the annotated-graph snapshots will change"); the `lockingClient`
call-site count (18, not 3); the capture-failure logging (promoted from "confirm" to "fix",
since `live()` provably sat outside the try/catch); and a smaller fix for Finding 1 using the
existing `fetchImpl` rather than a new constructor option.

**It was wrong about Finding 6, and so was I when I repeated it.** The review argued Paul's
premise was refuted because `graphPosts` is React-cached (`graph-posts.ts:13`). That refutes a
claim Paul did not make. He wrote "**Top Content** and `graphPosts` each run their own
pipeline", and that is true: `top-content.tsx:67` calls `fetchTopContentFrozen` directly while
the graphs call it through the `graphPosts` wrapper. Two call paths, one render. Finding 6
stands. See §6.

---

## Before any code, per branch

1. `npx vitest run`, record the exact pass count.
2. `npx tsc --noEmit` and `npm run check:rsc`.
3. sha256 of every `__snapshots__` file on the branch.
4. Renaissance drift check, read only, all three databases.

**Expected golden-snapshot diff for every finding in this plan: zero.** A changed snapshot is
a defect in the fix until proven otherwise. Each new test must be shown to fail before the fix
and pass after.

---

## §0b. SECOND adversarial review: §4, §7 and §8a are BLOCKED

Run 2026-09-23 against the completed plan. It failed three sections outright. Each of the
three below was verified in the tree before I accepted it, because two of them reverse a
decision the plan had already argued for.

**§8a is withdrawn.** Two halves are wrong and the third is undecidable here.

1. *All-null headline metrics is NOT malformed, it is a modelled state.*
   `headline-build.ts:49-51` says so in its own comment: "No data for the window when EVERY
   requested metric came back present-but-null ... Distinct from the absent-key guard above
   (malformed)." Treating it as incomplete means a client with a genuinely quiet month never
   locks that month, serves live numbers for it forever, logs `lock skipped` on every render,
   and fails the next month's `priorParams` baseline read. That is a worse bug than the one
   being fixed, and there is no unlock tool to recover it.
2. *The graph half contradicts a passing test the plan did not notice.*
   `locking-client.test.ts:109` asserts `ALL_CHANNELS: {}` is **complete**. The plan proposed
   the opposite while flagging only the media test at `:126`.
3. *The media half contradicts `:126-134` too*, which the plan admitted while also calling the
   media half mandatory. Under the plan's own tie-breaker the whole of §8a produces no change,
   which the author would have discovered mid-implementation.

Also missed: `CLAUDE.md` already tracks this as a follow-up and records that locking an empty
answer "matches the old freeze table's deliberate frozen-empty behaviour". So Paul's second
option, fold it into that follow-up, is the state that already exists, and option 1 reverses a
deliberate decision. **§8a goes back to Paul as a question, not a change.**

**§7 is gated on §8a, so it defers with it.** The lock write stores the raw response
(`locking-client.ts:92`) *before* any builder parses it, and `completeReportsData` returns true
for `MULTI_METRIC_MEDIA_TYPE` on the brand entry alone (`:29-31`). So a malformed media answer
captured on lock day is stored permanently, and §7's new throw would then fire on every later
render of that locked month, forever, with no unlock tool. Today's `?? 0` is wrong but
recoverable. Shipping §7 without the media half of §8a converts a wrong number into a permanent
error card. Separately, §7 would throw on a shape nobody has probed, in a codebase where every
comparable throw cites a live probe.

**§4 is blocked on a decision, not on code.** The proposed shape (distrust only when the
distinct authors are exactly one) introduces a case Paul did not ask about: a renamed account
whose window *also* contains a partner collab has two distinct authors, so the stale handle is
trusted, every post is classed as a collab, and the client-facing owned Top 5 renders **empty**.
Today's rule falls back to `#ad`, which is imperfect but never empty. And his own literal
example, "a month where the client's only posts are collabs authored by partners", stays broken
when there is one partner, which is the common case for a small brand. His shape does not close
his own example. This needs his call between the two options he offered.

**Three smaller corrections applied to the sections below rather than blocking them:**

- §3's justification was factually wrong. This is Tailwind v4, which generates `space-y-*` as
  `:where(& > :not(:last-child))` with `margin-block-end`, not a `[hidden]` sibling chain with
  `margin-top`. The conclusion survives, but only because the `<ul>` is followed by the chart
  and so is genuinely not the last child. The third `no-print` rule is load-bearing on that
  ordering, which a class-string test will not catch.
- §2's note belongs on #250, where the edge-27 follow-up actually lives. `CLAUDE.md` has no
  edge-27 entry, so writing it there would be inventing a location Paul did not name.
- §8b promised a test with no surface to write it against: the URL building is inline in `GET`
  behind a bearer check and a live `fetch`, and the route has no test file. Either extracting a
  pure `buildWarmUrls` is in scope, or the test claim is dropped.

**What is implementable now, unchanged:** §3 (with the corrected rationale), §5, §6, §2, §8b.
**What goes back to Paul:** §4, §7, §8a.

---

## §2. Finding 2 (●, 256) — request-shape change silently misses every lock

**Paul, verbatim:**
> The lock key hashes the literal request: date strings with their `T04:00:00Z` suffix, the
> metric list, `limit`. Any later change to request shape misses every existing lock and
> silently recaptures live numbers for months clients have already seen. The only signal is a
> `late lock` warning. The edge-27 fix tracked on #250 does exactly this. So does adding a KPI
> to a tab.
>
> Please add a test that pins the request keys the getters produce for a fixed month, so a
> shape change fails CI and forces a deliberate decision (recapture, or map old keys). Also
> note it on the edge-27 follow-up.

**What the code does.** `requestKey` (`lock-day.ts:83-86`) sha256s `{method, params}` after
dropping `undefined` values and sorting keys. `lock-day.test.ts:66-71` pins only that the key
ignores argument order and changes on a real difference. Nothing pins the keys the getters
actually produce, so any change to a getter's request silently produces new keys.

**Fix.** Test only, no behaviour change. A characterisation test that pins the literal key
string for a fixed month, for each getter that goes through the locking client:

- `getPlatformHeadlines` (`headlines.ts:29-40`)
- both graph getters (`followers.ts`, `trends.ts`)
- `getContent` (`top-content.ts:147`, `:172`)
- **the `priorParams`-derived baseline key** (`lock-day.ts:69-81`), which a shape change breaks
  just as silently and which Paul's sentence covers ("misses every existing lock"): the compare
  baseline is a lock read like any other.

Plus the note on the edge-27 follow-up in `CLAUDE.md`, which he asked for explicitly.

**Not done:** no key-versioning scheme, no migration of old keys, no change to `requestKey`
itself. He asked for a test and a note.

---

## §3. Finding 3 (●, 252) — hidden callouts print in an exported PDF

**Paul, verbatim:**
> Staff see hidden callouts faded, with their thumbnail, "Hidden from client" and the
> Hide/Unhide button. Export PDF is `window.print()` of the page, and none of this carries
> `no-print`. So a PDF that staff export from a client's portal or dashboard view includes the
> very callouts the team hid from that client. Add `no-print` to hidden rows and to the toggle,
> or print the client's view.

**What the code does.** Confirmed at every point: export is `window.print()`
(`export-pdf-button.tsx:8`); `@media print` and `.no-print` exist and are already the
convention (`globals.css:265`, `:278`); the hidden row renders faded with thumbnail, the
"Hidden from client" label and the button, none of it `no-print`
(`annotation-callouts.tsx:85-99`).

**What limits the fix, and is already correct:** the chart dot is dropped for a hidden
annotation for everyone including staff (`trends.tsx:132`,
`marks={visible?.filter((a) => !a.hidden)...}`). No orphan dot, so the chart is not touched.

**Fix.** His first option, `no-print` on the hidden rows and on the toggle. Chosen over "print
the client's view" because that second option would mean re-resolving the annotations for a
different role at print time, which is a render change, and this one is two class strings.

Three places, not the two he named, because a third follows from the same mechanism:

1. `no-print` on a hidden `<li>`.
2. `no-print` on the Hide/Unhide button on every row (it is a control; it should never print).
3. `no-print` on the `<ul>` when every item is hidden. The `<ul>`
   (`annotation-callouts.tsx:112`) is a direct DOM child of `<section className="space-y-3">`
   (`trends.tsx:76`; fragments add no node), and `space-y-3` sets `margin-top` through a
   sibling selector that `display: none` does not remove from the chain, so an all-hidden list
   collapses to 0px and keeps its margin: a stray gap in the PDF.

**Tests.** A hidden row carries `no-print` and a visible one does not; the button carries it on
both; an all-hidden list carries it on the `<ul>` and a mixed list does not; and the existing
behaviour that a hidden annotation's chart mark stays absent, re-pinned so this change cannot
quietly alter it.

**Not done, and filed:**
- The "Annotations" legend pill also prints. Cosmetic, not a leak, not in his finding.
- `annotation-hides.ts:35`: when the hides table fails, staff get `args.items` unmarked, so
  previously-hidden annotations display **and** print normally. That is a hole in the hide
  feature's degraded path, wider than a print fix, and it is the same path Finding 5 covers.

---

## §4. Finding 4 (● low, 255) — a correct handle is distrusted

**Paul, verbatim:**
> (low) This distrusts a correct handle whenever no Instagram post in the window is authored by
> the client. For example, a month where the client's only posts are collabs authored by
> partners. The rule then falls back to #ad, collab posts without #ad land in the owned Top 5,
> and the log says "own handle matches no post author," which is wrong. Rare, but it's a
> client-facing list. Consider distrusting only when every authored post shares one author that
> isn't the stored handle (what a rename looks like), or validating the handle once when it's
> saved.

**What the code does.** `handleMatchesNoAuthor` (`outline-top-content.ts:54-58`):

```ts
const authors = posts.filter((p) => p.channel === 'INSTAGRAM' && p.author).map((p) => p.author)
return authors.length > 0 && !authors.includes(own.INSTAGRAM)
```

So any window whose Instagram posts all carry authors, none of which is the stored handle,
returns true. A month of partner-authored collabs is exactly that, and the handle is fine.

**Fix.** His first option: distrust only when **every** authored post shares one single author
that is not the stored handle, which is what a rename looks like. Chosen over "validate the
handle once when it's saved" because that second option is a write-path change in the
switch-on script and the admin surface, i.e. a different PR, and he marked this low.

The condition becomes: authors exist, the set of distinct authors has exactly one member, and
that member is not the stored handle. A month of several different partner authors then keeps
trusting the handle, which is the case he described.

**Tests.** A month whose only posts are collabs by two different partners keeps the handle
(fails today); a renamed account, every post by one other author, still distrusts it (passes
today, must keep passing); an empty author set still returns false; a window where one post
matches the handle still returns false.

**Not done:** no change to the `#ad` fallback itself, no handle validation on save, no change
to `missingAuthors` (`:48-51`), which is a different condition he did not raise.

---

## §5. Finding 5 (○, 252) — fail-closed has no test

**Paul, verbatim:**
> `a0fea87`'s "fail closed without a client row" has no test. Reverting it to fail open still
> passes the suite. It can't happen from the page today, but pin it: client lookup returns
> nothing → a client gets no annotations.

**What the code does.** `withHides` (`annotation-hides.ts:22-23`) throws when
`getClientBySlug` returns nothing, so the catch returns `{ items: [] }` for a client and
`{ items: args.items }` for staff.

**Fix.** Test only. Mock the client lookup to return nothing: a client role gets `items: []`
and no controls; a staff role gets every annotation and no controls; the error is logged. Prove
the test fails by reverting the guard to fail open, exactly as he described.

**Not done:** no behaviour change. The staff-side degraded path (staff see unmarked
annotations) is filed under §3, not changed here.

---

## §6. Finding 6 (○, 252) — the comment about request sharing

**Paul, verbatim:**
> The comment says the post read costs no extra request, but Top Content and `graphPosts` each
> run their own pipeline. The Dash client passes an `AbortSignal`, which opts out of Next's
> per-request fetch dedupe, so only the data cache can merge them. That means up to twice the
> content calls on a cold cache. Fix the comment, or have Top Content share the read.

**What the code does, checked because the first review claimed this finding was refuted:**
`top-content.tsx:67` calls `fetchTopContentFrozen` **directly**. The two graphs call
`graphPosts` (`follower-graph.tsx:53`, `engagement-trend.tsx:45`), which wraps
`fetchTopContentFrozen` in React `cache` (`graph-posts.ts:13`). So the two graphs share one
call and Top Content makes a second. **Paul is right.** The comment
(`follower-graph.tsx:39-40`) says "the React-cached read both graphs of a tab share, so this
costs no extra request", which is true of the two graphs and reads as absolute.

**Fix.** His first option, fix the comment: scope "no extra request" explicitly to the other
graph, and say Top Content issues its own. Chosen over "have Top Content share the read"
because of a fact in the code, not a preference: the two callers pass **different** fourth
arguments on purpose. `graphPosts` passes `{ writeSnapshot: async () => {} }` so a graph can
never freeze a window, while Top Content passes none and must write the snapshot
(`graph-posts.ts:14`, `top-content.tsx:67`). Sharing one read means deciding which of those
two behaviours wins, which changes when a window freezes. That is a behaviour change in the
freezing path and belongs in its own PR.

**Not done:** no code change at all, only the comment, plus a reply on the PR citing
`top-content.tsx:67` and `graph-posts.ts:13` so the record shows why the comment was clarified
rather than the pipeline merged.

---

## §7. Finding 7 (○, 255) — a malformed media answer reads as zero

**Paul, verbatim:**
> An absent `reel` entry correctly means zero. But if `reel` is present and
> `metrics.VIEWS.ALL_CHANNELS` isn't, this also reads 0, with no flag and no log.
> `buildHeadlines` throws in the same situation (`outline-headlines.ts:29-30`). Default to 0
> only when the media type is absent, and throw otherwise so the row gets its "Could not load"
> flag.

**What the code does.** `buildMediaKpis` (`outline-media.ts:16-23`) already throws when the
brand entry is missing (`:17`), then for each spec does
`data[s.mediaType]?.metrics?.[s.metric]?.ALL_CHANNELS` and `value: m?.value ?? 0` (`:20-21`).
The `?? 0` cannot tell "no reels this month" from "the reel entry is there but the metric is
malformed". `buildHeadlines` does throw in the equivalent case (`outline-headlines.ts:29-30`).

**Fix.** Exactly his sentence: zero only when `data[s.mediaType]` is absent; if the media type
is present but the metric or its `ALL_CHANNELS` is not, throw, so the row gets the
`MEDIA_FAILED` "Could not load from Dash" flag the outline already defines
(`outline-layout.ts`).

**Tests.** Absent media type stays 0 with no throw; present media type with a missing metric
throws; present with a missing `ALL_CHANNELS` throws; a well-formed answer is unchanged.

**Not done:** no change to the brand-entry throw at `:17`, no change to `delta()`, no new flag
type. The `MEDIA_FAILED` flag already exists.

---

## §8. Finding 8 (○, 256) — two separate comments

### 8a. Empty-but-shaped answers count as complete

**Paul, verbatim:**
> "Complete" passes `ALL_CHANNELS: {}`/`null` on a graph, and all-null headline metrics.
> `MULTI_METRIC_MEDIA_TYPE` passes on the brand entry alone. A transient empty answer on the
> lock day then locks an empty chart or blank tiles for good, which contradicts `6845ccb`'s own
> reasoning. Treat those as incomplete, or fold this into your Top Content empty-panel
> follow-up.

**What the code does.** `completeReportsData` (`locking-client.ts:15-31`): for `GRAPH` it
requires only that `'ALL_CHANNELS' in entry` (`:23`), so `{}` and `null`-valued series pass;
for `MULTI_METRIC_MEDIA_TYPE` it returns `true` on the brand entry alone (`:29-31`); otherwise
it requires each metric key to be present, so an all-null set of metrics passes.

**Fix.** His first option, treat those as incomplete, in all three shapes he named. The media
branch is explicitly included: it is the one report type 255 introduces, so leaving it out
would let Findings 7 and 8 both look done while the gap between them stays open.

An incomplete answer is already served and not stored, with a `lock skipped` warning
(`locking-client.ts:74-77`), so this widening needs no new machinery.

**Tests.** A graph whose `ALL_CHANNELS` is `{}` or `null` is incomplete; headline metrics all
null is incomplete; a media answer with the brand entry but no media-type entries is
incomplete; and the existing case that "a media answer with the brand entry but no reels is
complete" must be re-examined against this change, because it is currently a passing test that
asserts the opposite for one shape. **If those two conflict, the existing test wins until Paul
says otherwise**, and the conflict is reported rather than resolved unilaterally.

### 8b. The sweep is last in the warm queue

**Paul, verbatim:**
> The sweep URLs are added after every regular warm URL. With `maxDuration = 300` and
> `CONCURRENCY = 8`, the sweep is what gets cut when a run overruns. Pages return 200 even when
> a part errors, so the `ok` count can't show whether a month was captured. Put the sweep first,
> or give it its own cron.

**What the code does.** `cache-warm/route.ts:116-133`: the per-client report URLs are pushed
first, then `lockSweepUrls` appended, then one `mapWithConcurrency(urls, CONCURRENCY, ...)`.

**Fix.** His first option, put the sweep first. Chosen over "give it its own cron" because that
means a new schedule, a new route and a new auth path, which is a deployment change, and this
one is the order of two pushes.

**Tests.** The sweep URLs appear before any regular warm URL in the built list.

**Not done:** the second half of his sentence, that the `ok` count cannot show whether a month
was captured, is an observability gap in `warmOne`, not something reordering fixes. **file**,
and it is partly covered already by the capture-failure log added in Finding 1.

---

## Merge path

Unchanged from the reviewed plan. Fixes on each PR's own branch, pushed at first commit; Paul
re-reviews on the PR where he raised each one; the three merge into `organic-social-october` in
any order with zero conflicts re-proven; that promotes to `dev` as one unit; #252 stays in draft
until Jasmine has seen the annotations.

**Cross-PR composition gap, still filed, still untestable on either branch alone:** 252's
`graphPosts` calls `fetchTopContentFrozen`, which 256 rewrites to short-circuit to `fetchLive`
for locked clients, so after the merge graph annotations for a locked month come through
`getContent` and therefore through the Finding 1 capture path. One composition test belongs on
the deliverable branch once both have merged.
