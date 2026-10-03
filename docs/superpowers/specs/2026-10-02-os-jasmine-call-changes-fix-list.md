# Fix list: every open minor on #306, closed before Paul's review

Status: REVIEWED (round 1: 3 MAJOR, 10 MINOR, all taken; changes below are marked "(review)"). Round 2 reviews the changed lines only. Branch `feat/os-jasmine-call-changes` at 0c60ff9e. Code
cited at that commit. Public repo: no brand ids, sheet ids, tab names or client figures here.

I asked for no minor to carry over. This list takes every open item from the build reviews, the fresh review of the
branch and the new CLAUDE.md follow-ups. Each one is either fixed here, with what could break and the test that proves
it, or closed with the reason it is not a defect. Nothing is left as "later".

## Guard rails for every fix
- Renaissance renders exactly as today until its data write: no change to `index.tsx`, `template.ts`, `base.ts`,
  `locking-client.ts`, `lock-day.ts`, `metrics.ts`, `headline-build.ts`, any golden test or snapshot.
- Shared code keeps today's output whenever the new input is absent: `parts/shared.tsx` `Fallback` (used by nine Organic
  Social parts, Renaissance's included; Paid Search, Meta and LinkedIn Ads have their own local `Fallback`, review),
  `sortable-top-content.tsx`, and `lib/concurrency.ts` (the cache warmer and the health sweep).
- The outline clients' Dash requests and lock keys are unchanged (`lock-key-pin.test.ts` passes unedited).
- No log line carries a brand id, a Dash URL, a sheet id, a tab or a value.
- Every fix is test-first: the test fails before the change and passes after.

## Fixes

### X1. YTD failure logs say what failed
**Today.** `ytd-review@3` logs each failed month with `kind` and `status` only, and anything that is not a Dash error is
`kind=other status=none` (`parts/ytd-review-live.tsx:22-26, 61-65`). `ytd-review@2` logs nothing per month at all
(`parts/ytd-review-sheet.tsx:50-52`), and neither does `ytd-review@1` (`parts/ytd-review.tsx:30`), which @2 renders
whenever there is no valid sheet for the year (review). A failed client read shows the error card with no log in @1, @2 and @3
(`parts/ytd-review.tsx:22`, `ytd-review-sheet.tsx:26`, `ytd-review-live.tsx:38`).
**Change.**
- Move `dashFailure` into a small shared module beside the parts (`parts/ytd-failure.ts`) and widen it. For a
  non-Dash error it returns `kind=other` plus a safe reason:
  - `missing=<METRIC,METRIC>` when the whole message matches
    `^(INSTAGRAM|FACEBOOK|TWITTER|LINKEDIN|TIKTOK): Dash omitted requested metric\(s\): ([A-Z0-9_]+(, [A-Z0-9_]+)*)$`
    (thrown at `lib/organic-social/outline-headlines.ts:30`; digits included for Facebook's `..._V2` names, review);
  - `reason=no-metrics` when the whole message is `<CHANNEL>: Dash returned no metrics for this brand` (`:90`);
  - otherwise `error=<name>` only for an `Error` whose `name` matches `^[A-Za-z][A-Za-z0-9]{0,39}$`, else
    `error=other` (review: a name can be overwritten, and a non-Error throw can carry one).
  Dash error lines stay exactly as today, with nothing added.
  Dash errors keep `kind` and `status` exactly as today. The message is still never logged.
- @1 and @2 log each failed month with the same line shape as @3 (`ytd-review@<n> Dash request failed slug= channel= month=
  kind= status=` plus the reason). The block still shows the same fallback card.
- @1, @2 and @3 log a failed client read: `[organic-social] ytd-review@<n> client read failed slug=<slug>`.
**Could break.** A regex that matches a message carrying a URL would log it. The match is anchored to the two exact
message shapes and to channel and metric name characters, so a URL cannot match. Tests feed a Dash error whose message holds a URL and a brand
id, and assert neither appears.
**Tests.** `ytd-failure.test.ts`: Dash timeout, rate limit, auth, API with a status, omitted metrics (including a
`_V2` name), no metrics, a plain `TypeError`, an Error with an overwritten name, a non-Error throw with a `name`; a
near-miss message holding a URL and a brand id never appears. `ytd-review.test.tsx`, `ytd-review-sheet.test.tsx` and
`ytd-review-live.test.tsx`: a failed month logs one line with the month; a failed client read logs one line; the card
is unchanged.

### X2. A wrongly cased `influencerSection` key warns
**Today.** `parseInfluencerSection` skips any key that is not a Dash channel name with no signal
(`lib/organic-social/influencer-section.ts:19`), so `{"Instagram": {"hidden": true}}` does nothing silently.
**Change.** The parser keeps skipping such keys (the spec says unknown keys are ignored, and the result does not
change), but returns them: `{ kind: 'ok', section, ignored: string[] }`. top-content@3 warns once per render when
`ignored` is not empty: `[organic-social] influencerSection ignored keys slug=<slug> keys=<names> other=<count>`.
A key is named only when its upper-case form is a channel name (the miscased case this targets); any other key is only
counted, since hand-typed jsonb could hold anything (review).
**Could break.** Callers that compare the whole parse result. Only top-content@3 and the parser's own tests read it; those tests compare the whole result and gain the field.
**Tests.** Parser: `ignored` lists the unknown keys and is empty otherwise; the section is unchanged. Part: a wrongly
cased key logs the warning with the slug and the key, and the page renders today's default section.

### X3. One sheet read per tab when the tiles and the YTD block start together
**Today.** `readYtdTab` is `cached()` (`lib/organic-social/ytd-sheet.ts:122-125`), built on `unstable_cache`, which is
not known to share a read that is still in flight. On a cold cache the tiles (`tile-sheets.ts:21`) and the YTD block
(`ytd-review-sheet.tsx:43`) can each send the same request to the Sheets API in one render.
**Change.** Inside `cached()` (around `readYtdTabImpl`, so every caller still passes through `cached()` and records
its own health and PERF line, review), concurrent reads of the same sheet and tab share one promise while it is in
flight. The entry is removed when the read settles, success or failure, so it never outlives the read. `lib/cache.ts`
is not touched, so the hourly cache and the 30 second failure replay behave exactly as today (pinned by
`lib/cache.negative.test.ts`). The read's AbortController and 10 second deadline belong to the read, not to a caller,
so sharing it across requests on one instance cannot let one request cancel another's.
**Could break.** A rejected shared promise must reach every caller and must not leave the entry behind (the next call
would replay a stale failure forever). Tested.
**Tests.** `ytd-sheet.test.ts`: two concurrent calls for one tab make one request and both get the grid; two different
tabs make two; after a failure, a later call makes a fresh request; both concurrent callers receive the failure.

### X4. The YTD timeout card stops telling viewers to shorten the date range
**Today.** Every YTD version uses the shared `Fallback`, whose timeout copy tells the viewer to try a shorter date
range (`parts/shared.tsx:11`). The YTD block picks its own months, so a viewer cannot act on it (an
existing CLAUDE.md follow-up from #255).
**Change.** `Fallback` takes an optional `timeoutText`. Absent, its output is byte for byte today's, so every other
Organic Social part, Renaissance's included, is unchanged. @1, @2 and @3 pass "Taking longer than usual. Try again in
a minute."
**Tests.** `Fallback` with no prop renders today's exact string; with the prop renders the new one. Each YTD version's
timeout case asserts the full new string and that "shorter date range" is gone; `outline-parts.test.tsx` asserts the
exact old string, pinning the default (review: today's tests match only "Taking longer than usual").

### X5. A failed YTD month stops new Dash requests from starting
**Today.** `mapWithConcurrency` (`lib/concurrency.ts:19-37`) keeps starting items after one rejects; the block is all
or nothing, so in December one failed month can still send up to nine more requests whose answers are thrown away. Its
comment also says current callers cannot reject, which stopped being true when the YTD blocks started using it.
**Change.** After the first rejection no new item starts. Items already in flight finish. The call still rejects with
the first error. The comment is corrected in both places (callers do reject now, and a later rejection is handled by `Promise.all`,
so it is never unhandled, review). @1 moves from `Promise.all` to `mapWithConcurrency(months, 3, ...)` with the same
`getOutlineKpis` arguments, so its requests and lock keys are unchanged (review). The cache warmer and health sweep never reject (their `fn` catches), so
their behaviour cannot change.
**Tests.** `concurrency.test.ts`: twelve items, limit three, the first item rejects: exactly three calls start and the
call rejects with that error. A sibling still in flight that rejects later raises no `unhandledRejection`. The existing order, limit and clamp
tests pass unedited. @1: at most three requests in flight, same arguments as before.

### X6. A hidden influencer section stays visible to staff, so a designation can be undone
**Today.** On a channel with `influencerSection.<CHANNEL>.hidden`, the influencer row is not rendered for anyone
(`parts/top-content-outline.tsx:57`). A staff member who marks an owned post as Influencer sends it into a row nobody
can see, and the only way back is deleting its row from the designations table.
**Change.** For staff only (`canSetDesignation(role)`, internal staff), the hidden platform's influencer row is
available behind a closed control, "Show posts hidden from clients (n)", with the normal card toggle inside, so a post
can be marked Organic again. Closed by default, so staff see what Jasmine asked for (call 20:13 to 20:36) until they
choose to open it (review). Spec section 4 and the comment at `top-content-outline.tsx:54-55` change to say so. A post
marked Organic moves to the owned row, which shows only the top `ownedLimit` posts, so a low-ranked post can leave both
rows (review); that is the owned row's existing rule.
For clients nothing changes: the hidden posts are not passed to the component at all, so they never reach a client
browser. `SortableTopContent` takes the row as an optional prop; absent, its markup is exactly today's.
**Could break.** Leaking hidden posts to a client. The posts are filtered on the server by role before the props are
built. Tested for both roles.
**Tests.** top-content@3: client role, hidden channel: no hidden section and no hidden post id in the props; staff role:
the closed control with its count and posts; a post with a stored Organic designation leaves the hidden row and is in
the owned group. `sortable-top-content.test.tsx`: with the prop, the closed control renders with its count; without
it, today's exact strings.

### X7. An empty heading cannot render an empty title
**Today.** `sortable-top-content.tsx:159-160` uses `??` for both the region name (default "Influencer posts") and the
heading (default "Influencer Posts"), so an empty string would render both empty. Unreachable
today (the parser rejects an empty label and top-content@3 passes only a truthy one).
**Change.** `||` in both places, so an empty string falls back to today's text. Absent, identical.
**Tests.** An empty `influencerHeading` renders the heading "Influencer Posts" and the region "Influencer posts".

### X8. Renaissance's brand answers the outline request in full (plan Task 16 step 2b)
Not code. A read-only private probe sends the request @3 sends (`getOutlineKpis`'s shape with `compareRange: null`,
through the plain Dash client: Renaissance has no `reportingMonths`, so nothing can lock) for Renaissance's brand on
Instagram, Facebook and LinkedIn for one finished month. It prints only the metric names returned against the names
asked for, or an error's class, never a message (Dash messages carry the brand URL, review).
Run now, before Paul's review, so the answer is known. A missing metric comes to me as a decision.

## Closed, not defects (with the reason)
- **A live client can note any past day.** The Day list offers only days inside the range on screen
  (`parts/chart-notes.ts:92-103`), so a note made through the page always shows on the range it was made on. A day
  outside any range can only come from a hand-made call by internal staff. Removed from the follow-ups.
- **Renaissance's YTD points will not match its rolling tiles; the sheet's Total Followers change will not equal Dash's
  Net New Followers; "(live)" can be an hour old.** These are the approved design (spec sections 5 and 8, Paul's Slack),
  not bugs. They move from open follow-ups to a short "known behaviour" note so the follow-up list holds only work.
- **The tiles' prior-year read counts toward health.** Deliberate: it signals a broken sheet. No client has a prior-year
  entry until 2027. Stated in the known-behaviour note.
- **The placement test resolves against the code template.** The staging script re-checks against the database row
  (plan Task 16 step 3, item 4). Not a defect.

## Order
Batch A: X5 (with @1), X3, X1 (shared plumbing, then logs). Batch B: X4, X7, X2. Batch C: X6. A fresh review of the changed
lines after each batch. Then X8, `make check`, push, the CLAUDE.md and PR updates.
