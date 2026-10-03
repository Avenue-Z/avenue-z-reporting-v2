# Fix list: every open minor on #306, closed before Paul's review

Status: DRAFT, for one fresh adversarial review before any code. Branch `feat/os-jasmine-call-changes` at 0c60ff9e. Code
cited at that commit. Public repo: no brand ids, sheet ids, tab names or client figures here.

I asked for no minor to carry over. This list takes every open item from the build reviews, the fresh review of the
branch and the new CLAUDE.md follow-ups. Each one is either fixed here, with what could break and the test that proves
it, or closed with the reason it is not a defect. Nothing is left as "later".

## Guard rails for every fix
- Renaissance renders exactly as today until its data write: no change to `index.tsx`, `template.ts`, `base.ts`,
  `locking-client.ts`, `lock-day.ts`, `metrics.ts`, `headline-build.ts`, any golden test or snapshot.
- Shared code that Renaissance or other sections render (`parts/shared.tsx` `Fallback`, `sortable-top-content.tsx`,
  `lib/concurrency.ts`) keeps today's output whenever the new input is absent.
- The outline clients' Dash requests and lock keys are unchanged (`lock-key-pin.test.ts` passes unedited).
- No log line carries a brand id, a Dash URL, a sheet id, a tab or a value.
- Every fix is test-first: the test fails before the change and passes after.

## Fixes

### X1. YTD failure logs say what failed
**Today.** `ytd-review@3` logs each failed month with `kind` and `status` only, and anything that is not a Dash error is
`kind=other status=none` (`parts/ytd-review-live.tsx:22-26, 61-65`). `ytd-review@2` logs nothing per month at all
(`parts/ytd-review-sheet.tsx:50-52`). A failed client read shows the error card with no log in @1, @2 and @3
(`parts/ytd-review.tsx:22`, `ytd-review-sheet.tsx:26`, `ytd-review-live.tsx:38`).
**Change.**
- Move `dashFailure` into a small shared module beside the parts (`parts/ytd-failure.ts`) and widen it. For a
  non-Dash error it returns `kind=other` plus a safe reason:
  - `missing=<METRIC,METRIC>` when the message is exactly `<CHANNEL>: Dash omitted requested metric(s): <names>`
    (thrown at `lib/organic-social/outline-headlines.ts:30`; channel and metric names only, upper case and underscores);
  - `reason=no-metrics` for `<CHANNEL>: Dash returned no metrics for this brand` (`outline-headlines.ts:88`);
  - otherwise `error=<Error name>` (the class name only, never the message).
  Dash errors keep `kind` and `status` exactly as today. The message is still never logged.
- @2 logs each failed month with the same line shape as @3 (`ytd-review@2 Dash request failed slug= channel= month=
  kind= status=` plus the reason). The block still shows the same fallback card.
- @1, @2 and @3 log a failed client read: `[organic-social] ytd-review@<n> client read failed slug=<slug>`.
**Could break.** A regex that matches a message carrying a URL would log it. The match is anchored to the two exact
message shapes and to `[A-Z_, ]+`, so a URL cannot match. Tests feed a Dash error whose message holds a URL and a brand
id, and assert neither appears.
**Tests.** `ytd-failure.test.ts`: Dash timeout, rate limit, auth, API with a status, omitted metrics, no metrics, a
plain `TypeError`, a non-Error throw; a message with a URL never appears. `ytd-review-sheet.test.tsx` and
`ytd-review-live.test.tsx`: a failed month logs one line with the month; a failed client read logs one line; the card
is unchanged.

### X2. A wrongly cased `influencerSection` key warns
**Today.** `parseInfluencerSection` skips any key that is not a Dash channel name with no signal
(`lib/organic-social/influencer-section.ts:19`), so `{"Instagram": {"hidden": true}}` does nothing silently.
**Change.** The parser keeps skipping such keys (the spec says unknown keys are ignored, and the result does not
change), but returns them: `{ kind: 'ok', section, ignored: string[] }`. top-content@3 warns once per render when
`ignored` is not empty: `[organic-social] influencerSection ignored keys slug=<slug> keys=<names>`. The key names are
config keys we type, never values.
**Could break.** Callers that compare the whole parse result. Only top-content@3 and the parser's own tests read it.
**Tests.** Parser: `ignored` lists the unknown keys and is empty otherwise; the section is unchanged. Part: a wrongly
cased key logs the warning with the slug and the key, and the page renders today's default section.

### X3. One sheet read per tab when the tiles and the YTD block start together
**Today.** `readYtdTab` is `cached()` (`lib/organic-social/ytd-sheet.ts:122-125`), built on `unstable_cache`, which is
not known to share a read that is still in flight. On a cold cache the tiles (`tile-sheets.ts:21`) and the YTD block
(`ytd-review-sheet.tsx:43`) can each send the same request to the Sheets API in one render.
**Change.** Wrap the cached reader so concurrent calls with the same sheet and tab share one promise while it is in
flight. The entry is removed when the read settles, success or failure, so it never outlives the read and the hourly
cache and 30 second failure replay behave exactly as today.
**Could break.** A rejected shared promise must reach every caller and must not leave the entry behind (the next call
would replay a stale failure forever). Tested.
**Tests.** `ytd-sheet.test.ts`: two concurrent calls for one tab make one request and both get the grid; two different
tabs make two; after a failure, a later call makes a fresh request; both concurrent callers receive the failure.

### X4. The YTD timeout card stops telling viewers to shorten the date range
**Today.** Every YTD version uses the shared `Fallback`, whose timeout copy is "Taking longer than usual — try a
shorter date range." (`parts/shared.tsx:11`). The YTD block picks its own months, so a viewer cannot act on it (an
existing CLAUDE.md follow-up from #255).
**Change.** `Fallback` takes an optional `timeoutText`. Absent, its output is byte for byte today's, so Paid Search,
Meta, LinkedIn Ads and every Renaissance part are unchanged. @1, @2 and @3 pass "Taking longer than usual. Try again in
a minute."
**Tests.** `Fallback` with no prop renders today's exact string; with the prop renders the new one. Each YTD version's
timeout case renders the new copy.

### X5. A failed YTD month stops new Dash requests from starting
**Today.** `mapWithConcurrency` (`lib/concurrency.ts:19-37`) keeps starting items after one rejects; the block is all
or nothing, so in December one failed month can still send up to nine more requests whose answers are thrown away. Its
comment also says current callers cannot reject, which stopped being true when the YTD blocks started using it.
**Change.** After the first rejection no new item starts. Items already in flight finish. The call still rejects with
the first error. The comment is corrected. The cache warmer and health sweep never reject (their `fn` catches), so
their behaviour cannot change.
**Tests.** `concurrency.test.ts`: twelve items, limit three, the first item rejects: exactly three calls start and the
call rejects with that error. The existing order, limit and clamp tests pass unedited.

### X6. A hidden influencer section stays visible to staff, so a designation can be undone
**Today.** On a channel with `influencerSection.<CHANNEL>.hidden`, the influencer row is not rendered for anyone
(`parts/top-content-outline.tsx:57`). A staff member who marks an owned post as Influencer sends it into a row nobody
can see, and the only way back is deleting its row from the designations table.
**Change.** For staff only (`canSetDesignation(role)`, internal staff), the hidden platform's influencer row renders
in its own section, headed "Hidden from clients", with the normal card toggle, so the post can be marked Organic again.
For clients nothing changes: the hidden posts are not passed to the component at all, so they never reach a client
browser. `SortableTopContent` takes the row as an optional prop; absent, its markup is exactly today's.
**Could break.** Leaking hidden posts to a client. The posts are filtered on the server by role before the props are
built. Tested for both roles.
**Tests.** top-content@3: client role, hidden channel: no hidden section and no hidden post id in the props; staff role:
the section with its posts. `sortable-top-content.test.tsx`: with the prop, a region "Hidden from clients" renders; without
it, today's exact strings.

### X7. An empty heading cannot render an empty title
**Today.** `sortable-top-content.tsx:159-160` uses `??`, so an empty string would render an empty heading. Unreachable
today (the parser rejects an empty label and top-content@3 passes only a truthy one).
**Change.** `||`, so an empty string falls back to today's text. Absent, identical.
**Tests.** An empty `influencerHeading` renders "Influencer Posts".

### X8. Renaissance's brand answers the outline request in full (plan Task 16 step 2b)
Not code. A read-only private probe sends `getOutlineKpis`'s exact request for Renaissance's brand on Instagram,
Facebook and LinkedIn for one finished month and prints only the metric names returned against the names asked for.
Run now, before Paul's review, so the answer is known. A missing metric comes to me as a decision.

## Closed, not defects (with the reason)
- **A live client can note any past day.** The Day list offers only days inside the range on screen
  (`parts/chart-notes.ts:92-101`), so a note made through the page always shows on the range it was made on. A day
  outside any range can only come from a hand-made call by internal staff. Removed from the follow-ups.
- **Renaissance's YTD points will not match its rolling tiles; the sheet's Total Followers change will not equal Dash's
  Net New Followers; "(live)" can be an hour old.** These are the approved design (spec sections 5 and 8, Paul's Slack),
  not bugs. They move from open follow-ups to a short "known behaviour" note so the follow-up list holds only work.
- **The tiles' prior-year read counts toward health.** Deliberate: it signals a broken sheet. No client has a prior-year
  entry until 2027. Stated in the known-behaviour note.
- **The placement test resolves against the code template.** The staging script re-checks against the database row
  (plan Task 16 step 3, item 4). Not a defect.

## Order
Batch A: X5, X3, X1 (shared plumbing, then logs). Batch B: X4, X7, X2. Batch C: X6. A fresh review of the changed
lines after each batch. Then X8, `make check`, push, the CLAUDE.md and PR updates.
