# Salesforce Owner Query 5xx Fallback: Code Review Record

**Scope.** PR #240, branch `fix/salesforce-owner-500-fallback`, diff range `e5c2363^..ec0c45a` (two commits). Two files: `lib/salesforce/pipeline.ts` (+42 / -5) and `lib/salesforce/pipeline.orchestration.test.ts` (+121). No unrelated code.

**This document changes no code.** It compiles the two-round review on PR #240 (Thomas, 2026-09-14, rounds at `e5c2363` and `ec0c45a`, approved at `ec0c45a`) into the standard shape. The round-one findings were fixed on the feature branch in `ec0c45a` before approval, so §5 records them as closed, with what remains open listed separately.

Origin: after Renaissance's `salesforce_config` was set on the prod DB (2026-09-13), prod's Executive Overview rendered **"Owner breakdown unavailable."** under Open Deals by Owner while the four Pipeline tiles loaded. Prod's runtime log carried `[salesforce] owner fetch failed for renaissance: Error [SmQueryError]: Supermetrics 500` on every render.

---

## 1. How it works

### 1.1 Where the owner breakdown comes from

Open Deals by Owner is one Supermetrics Salesforce query, `getOwnerRows` (`lib/salesforce/pipeline.ts:499`), issued in parallel with the three stage queries in `getSalesforcePipelineImpl`.

- **Fields:** `OWNER_FIELDS` (`pipeline.ts:27`): `opportunity_owner`, `opportunity_is_closed`, `opportunity_count`, `opportunity_amount`, `campaign_name`.
- **Window:** `openWindow()` (`pipeline.ts:157`), created-date basis (`OPEN_SETTINGS`, `pipeline.ts:112`), capped at `OWNER_MAX_ROWS = 500` (`pipeline.ts:38`), 60s ceiling (`SALESFORCE_TIMEOUT_MS`, `pipeline.ts:93`).
- **Scoping:** `filterByCampaign` (`pipeline.ts:602`) keeps only rows whose `campaign_name` is in the client's `salesforce_config.campaignNames`. For a client with no configured list it is a pass-through (`campaign-filter.ts:111`).
- **Ranking:** `transformByOwner` keeps not-closed rows, aggregates per owner and sorts by open deal **count** descending (`pipeline.ts:311`).

**`campaign_name` is on this query for one reason only: so `filterByCampaign` can scope it.** For an unscoped client the column changes nothing about the result. That fact is what the fallback relies on.

### 1.2 What the change does

`ownerRowsImpl(slug, campaignScoped)` (`pipeline.ts:486-497`):

1. Runs `OWNER_FIELDS` as before, with the full 60s budget.
2. If that throws, it retries **once**, without `campaign_name` (`OWNER_FIELDS_UNSCOPED`, `pipeline.ts:459`), only when **all** of the following hold (`pipeline.ts:494`):
   - the client is **not** campaign-scoped;
   - the error is an `SmQueryError` (`instanceof`, not duck-typed);
   - its `status` is `>= 500`, treating a missing status as `0`.
3. Logs `[salesforce] owner query failed with campaign_name for <slug>, retrying without it:` before retrying (`pipeline.ts:495`).
4. Gives the retry **what is left** of the 60s, minimum 1s: `Math.max(SALESFORCE_TIMEOUT_MS - (Date.now() - started), 1_000)` (`pipeline.ts:496`).

If the retry also fails it rejects. The composer's `.catch` (`pipeline.ts:549`) turns that into `byOwner: null`.

### 1.3 Why each guard is there

**No fallback for a campaign-scoped client.** Rows without `campaign_name` normalize to `''` and match nothing, so `filterByCampaign` would return `rows: []` with `unmatched: true`, and the block would render "No owners matched the agency-sourced campaigns; they may have been renamed." over what is actually a vendor outage. The guard can't drift from the filter: `campaignScoped` comes from `hasCampaignScope` (`pipeline.ts:520`), which is built on the same `wantedSet` helper as `filterByCampaign` (`campaign-filter.ts:65`, `:79`, `:105`), and a test asserts the two agree across `undefined`, `[]`, `['']`, `[' ']` and real names (`campaign-filter.test.ts:129`). Both values come from the one `getClientBySlug` per render.

**5xx only.** A 4xx is an answer about the query, not a fault. `SmTimeoutError` is a separate class and fails `instanceof`. Socket errors propagate raw. `smQuery` throws three **statusless** `SmQueryError`s (`lib/supermetrics/client.ts:311`, `:320`, `:325`), such as "neither data nor schedule_id"; `?? 0` keeps those out of the fallback, where `?? 500` would wrongly admit them.

**Scope passed as an argument, no cache version bump.** `campaignScoped` is a parameter of the cached fetcher, so it is part of the `unstable_cache` key. A fallback result is stored only under `(slug, false)` and can never be served once a campaign list is configured, and pre-existing `(slug)` entries are orphaned rather than collided with. Thomas confirmed the key construction against Next's source (`fixedKey + JSON.stringify(args)`).

**One budget across both queries.** `call()` keeps every attempt of a retry chain inside one deadline (`client.ts:28-30`, `:166`), pinned by `client.retry.test.ts`. The fallback retries one level above that seam, so without the remainder calculation `getOwnerRows` would have a 120s worst case, on a report page that declares no `maxDuration`.

### 1.4 What the reader sees

`pipeline-performance.tsx:143-158`:

| State | `byOwner` | Renders |
|---|---|---|
| Primary succeeds | rows | the owner list |
| Unscoped, primary 5xx, fallback succeeds | rows (same owners, counts, amounts, truncation flag) | the owner list |
| Fallback also fails, or scoped client fails, or non-5xx failure | `null` | "Owner breakdown unavailable." |
| Scoped client, nothing matched | `[]`, `ownerCampaignUnmatched` | "No owners matched the agency-sourced campaigns; they may have been renamed." |
| Query succeeded, genuinely no open deals | `[]` | "No open deals by owner." |

The `null` versus `[]` distinction is the invariant the review cared most about: an outage must never read as "no deals".

### 1.5 The diagnosis, corrected

On 2026-09-13 the owner + `campaign_name` query on the `openWindow()` range `2023-01-01..2029-12-31` returned **HTTP 500, 5 of 5** (sample request ids `2LBdxpenxJAdeThrY7rjHutPjuHXxNbn`, `YTpLqKvwpzpKLTxXg8hxJKKWeZ8aTuC3`). The same query without `campaign_name` returned 200 with 88 rows, and narrower windows returned 200.

On 2026-09-14 Thomas ran the same query **19 times, all 200** (sequential, inside a 4-query `Promise.all`, and cache-busted; 146 rows). The 88-row and narrow-window numbers still reproduced exactly.

So this was a **transient vendor fault that lasted hours**, not a deterministic 500 on one window. It outlasted `smQuery`'s own two 5xx retries on every prod render during the incident. Those retries cover a short blip; this fallback covers a repeat of a long outage. Staging never showed it because its owner entry was already cached, and `unstable_cache` keeps serving a stale value when a background refresh throws.

### 1.6 Cost on the failing path

`smQuery` spends about 8.6s on its two internal 5xx retries before throwing, so the fallback starts with roughly 51s of the 60s, against a measured ~10s cold and ~1.6s warm for the unscoped owner query. A successful fallback is cached for the hour like any other result, and cache-warm at `:30` pays it before a reader does.

---

## 2. Verification method

**Gates, run for this record at `ec0c45a` (2026-09-14):** `npx vitest run` **1047 passed / 118 files**; `npx tsc --noEmit` exit 0; `npm run check:rsc` clean. CI on PR #240 green (`test`, `rsc-boundary`, Vercel). These match Thomas's round-two ground truth.

**Static anchors confirmed at the stated line** (`git show origin/fix/salesforce-owner-500-fallback:<file>`, all matched): `pipeline.ts:27`, `:93`, `:157`, `:311`, `:459`, `:486`, `:494`, `:495`, `:496`, `:499`, `:520`, `:549`, `:602`, `:613`; `campaign-filter.ts:65`, `:79`, `:105`; `campaign-filter.test.ts:129`; `client.ts:28-30`, `:166`, `:311`, `:320`, `:325`; `pipeline-performance.tsx:143-158`; tests at `pipeline.orchestration.test.ts:1187`, `:1199`, `:1212`, `:1232`, `:1247`.

**Mutations executed for this record** (each applied to a detached worktree copy of `pipeline.ts`, the orchestration spec run, the file restored; not part of the diff):

| Mutation | Result |
|---|---|
| Fallback swallows its failure: `.catch(() => [])` | **1 failed**: `when the fallback also fails, the breakdown is unavailable, not an empty list` |
| Fallback gets a fresh `SALESFORCE_TIMEOUT_MS` | **1 failed**: `the fallback spends what is left of the 60s budget, not a fresh 60s` |
| `(e.status ?? 0)` becomes `(e.status ?? 500)` | **1 failed**: `a non-5xx owner failure is not retried without campaign_name` |
| Scoped guard neutralized | **1 failed**: `a campaign-scoped client never drops campaign_name: the breakdown stays unavailable` |

**Mutations run by Thomas on the PR** and not repeated here, all failing a named test: dropping `instanceof SmQueryError` for a duck-typed `.status`; the composer passing `false` instead of the scope; dropping the `status >= 500` check; rethrowing instead of retrying; keeping `campaign_name` in the fallback; swapping the field lists.

**Executed by Thomas, not re-run here:** feeding campaign-less rows through a scoped `filterByCampaign` gives `rows: []` with `unmatched: true` (the rationale for the scoped guard); fallback rows aggregate to the same owners, counts, amounts and truncation flag as the primary.

**Flagged rather than asserted (external trigger unverified):** the live 500 no longer reproduces, so the fallback path **cannot be exercised against the live API today**. The tests above are the only evidence it behaves. The Next.js cache-key construction was checked by Thomas against Next's source and is cited, not re-probed; `@/lib/cache` is mocked as a pass-through in the orchestration spec, so no test exercises key construction.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `pipeline.ts:496` | At `e5c2363` the both-fail path had no test: changing the fallback to `.catch(() => [])` left all 1045 tests green, and the block would print "No open deals by owner." over a total outage. **Closed in `ec0c45a`** (`pipeline.orchestration.test.ts:1232`). |
| 2 | ● | CONFIRMED | `pipeline.ts:496` | At `e5c2363` the fallback opened a fresh 60s, taking `getOwnerRows`'s worst case to 120s and breaking the one-budget invariant `client.ts:28-30` states. **Closed in `ec0c45a`** (remainder, 1s floor; test `:1247`). |
| 3 | ○ | CONFIRMED | `pipeline.ts:494` | `(e.status ?? 0)` and `instanceof SmQueryError` were correct but unpinned; `?? 500` would route statusless `SmQueryError`s into the fallback. **Closed in `ec0c45a`** (test `:1212`). |
| 4 | ○ | CONFIRMED | PR #240 description, `pipeline.ts:461-485` | The original framing called this a deterministic 500 on one window; it did not reproduce in 19 of 19 attempts. **Closed**: description and docblock reframed as a transient, hours-long vendor fault. |
| 5 | ○ | CONFIRMED | `pipeline.ts:499`, `:549` | "Only the unscoped-5xx path changes" was not literally true: the new argument changes every `ownerRows` cache key, so every client, scoped included, cold-misses once after deploy. **Documented** in the PR; harmless. |
| 6 | ○ | CONFIRMED | `pipeline.orchestration.test.ts:1199` | The scoped test's comment claimed to pin the scope reaching "its cache key", but `@/lib/cache` is mocked in that file. **Closed in `ec0c45a`** (comment trimmed). |
| 7 | ○ | CONFIRMED | `pipeline.ts:495`, `lib/cache.ts` | A successful fallback is recorded as a healthy fetch, so the `salesforce/ownerRows` beacon stays green while the vendor fault persists; one `console.warn` per instance per hour (cache miss only) is the only trace. **Documented**, no change: intended degradation. |
| 8 | ○ | PLAUSIBLE | `pipeline.ts:496` | The 1s floor means the fallback only rescues a **fast** first failure. A slow 5xx that burns most of the budget leaves the fallback ~1s against a ~10s cold query, and the block degrades exactly as before the fix. **No change**: correct degradation, but not a rescue. |
| 9 | ○ | CONFIRMED | `pipeline.ts:311` | `transformByOwner` sorts by count only, so owners tied on count can swap order between the primary and fallback queries. Same set, same numbers. Cosmetic, **no change**. |

Both **●** correctness findings were closed on the feature branch before approval.

---

## 4. Detail

### Finding 1: both-fail path unpinned

**Mechanism.** The shipped code rejects when the fallback fails, and the composer's `.catch` (`pipeline.ts:549`) sets `byOwner: null`, so it was always correct. But the only existing failure test rejected with a plain `Error`, which fails the `instanceof` guard, so the fallback never ran under test. With `[]` instead of a rejection, and `ownerCampaignUnmatched` false because an unscoped client never sets it, `pipeline-performance.tsx:148` takes the `length === 0` branch and prints "No open deals by owner." This was the merge condition, because the live path is currently unreproducible and the tests are the only evidence.

**Fix (landed).** Unscoped client, both owner calls reject with `new SmQueryError('Supermetrics 500', 500)`; assert two owner calls and `byOwner` null.

### Finding 2: fresh 60s budget on the fallback

**Mechanism.** `query()` closes over `salesforceQuery`, so the fallback is a whole new `salesforceQuery → smQuery → call()`, and `call()` defaults its deadline per invocation (`client.ts:166`). Worst case for `getOwnerRows` became 120s while every other Salesforce fetcher stays at 60s. Report pages declare no `maxDuration`, so a 120s owner path is killed by the platform rather than degrading to "Owner breakdown unavailable.", and cache-warm's wall time (`ceil(urls / 8) × render` against a fixed 300s) doubles that term. The realistic added cost was seconds; 120s was the pathological ceiling.

**Fix (landed).** Record `started` before the first query; the fallback gets `Math.max(SALESFORCE_TIMEOUT_MS - (Date.now() - started), 1_000)`. Test: with 20s used by the first attempt, owner calls get `timeoutMs` 60_000 then 40_000.

### Finding 3: two guards unpinned

**Mechanism.** Both survived mutation with the suite green. `?? 500` would retry the live statusless `SmQueryError('Supermetrics response had neither data nor schedule_id')` without `campaign_name`. A duck-typed `.status` check is lower stakes but abandons the deliberate `instanceof` precedent in `lib/dashboard/errors.ts`.

**Fix (landed).** The non-5xx test also runs a statusless `SmQueryError` and `Object.assign(new Error('Supermetrics 500'), { status: 500 })`, each asserting one owner call and `byOwner` null.

### Finding 4: diagnosis did not hold

**Mechanism.** See §1.5. A deterministic 500 justifies a structural workaround; a transient one is what `smQuery`'s retries exist for. The evidence that prod logged the failure on every render for hours is what justifies keeping a fallback for a recurrence.

**Fix (landed).** PR description leads with "a transient Supermetrics 500 that lasted hours" and cites the 19 of 19.

### Finding 5: one cold miss for every client

**Mechanism.** Adding the `campaignScoped` argument changes the key for every `ownerRows` entry. Each misses once after deploy, then warms normally; cache-warm at `:30` absorbs it.

**Fix.** None needed; stated in the PR so nobody reads a one-off post-deploy owner fetch as a regression.

### Finding 6: test comment over-claimed

**Mechanism.** `@/lib/cache` is mocked as a pass-through in `pipeline.orchestration.test.ts`, so the scoped test pins that the scope reaches the impl as an argument, not that it reaches a cache key.

**Fix (landed).** Parenthetical removed.

### Finding 7: green beacon during a live fault

**Mechanism.** The `console.warn` fires inside the cached impl, so only on a miss, and `cached()` records the fallback's success as a healthy fetch.

**Operational note.** A green `salesforce/ownerRows` beacon does **not** mean the vendor fault ended. The real signal is a runtime-log search for `[salesforce] owner query failed with campaign_name`.

### Finding 8: the floor only rescues a fast first failure

**Mechanism.** If the primary burns most of the 60s before 5xx-ing, the fallback starts near the 1s floor and times out, and the block renders "Owner breakdown unavailable.", identical to having no fallback. For the failure actually observed the numbers are comfortable (§1.6). PLAUSIBLE because a slow 5xx has not been observed.

**Operational note.** If the symptom returns looking like the original bug, check how long the primary query ran before the warn line, not whether the fallback works.

### Finding 9: tie order

**Mechanism.** `Array.sort` is stable, but the two queries can return rows in different orders, so owners with equal counts can swap places. No change.

---

## 5. Follow-ups

**Closed on the feature branch before approval (`ec0c45a`)**
1. **Finding 1**: both-fail test. This was the merge condition.
2. **Finding 2**: fallback spends the remaining budget.
3. **Finding 3**: statusless and duck-typed error cases pinned.
4. **Finding 4**: diagnosis reframed as a transient vendor fault.
5. **Finding 6**: test comment trimmed.

**Operational, carried in the PR description (no code)**
6. **Finding 7**: green beacon is not evidence the fault ended; grep the logs.
7. **Finding 8**: a slow 5xx defeats the fallback; check primary duration before the warn.
8. **Finding 5**: one cold miss per client after deploy.

**Needs a live call first**
9. The fallback path cannot be verified against the live API until the vendor fault recurs. When it does, confirm the warn line appears and the owner list renders.

**Unrelated, seen in both environments' logs**
10. `numeric field "opportunity_amount" missing, defaulting to 0`. Not tracked elsewhere yet.

**Cleanup:** Finding 9, none.

**Blocking the ship:** none. Both correctness findings are closed and pinned by mutation-verified tests. #240 reaches prod only through `dev → staging → main`.
