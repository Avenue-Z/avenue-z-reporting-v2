# Salesforce Open Stage Query 5xx Fallback: Code Review Record

**Scope.** PR #243, branch `fix/salesforce-open-stage-500-fallback`, diff range `04885e5^..ab35902` (four commits). Three files: `lib/salesforce/pipeline.ts`, `lib/salesforce/pipeline.orchestration.test.ts`, and `scripts/set-renaissance-campaign-scope.ts` (a header comment plus one output line). No unrelated code.

**This document changes no code.** It compiles Thomas's review of PR #243 (2026-09-15, at `04885e5`), whose four follow-ups landed on the feature branch in `0958e5f`, with a comment-only correction in `beb47e1`. Thomas re-reviewed `beb47e1` (round 2): he verified all four, confirmed the correction with his own probe, and raised one more ○ note (print the scoping warning in the script's output), which landed in `ab35902`. §5 records them as closed and lists what remains open. Neither round was an approval.

Builds on PR #240 (owner query fallback), reviewed in `docs/qa/salesforce-owner-500-fallback-code-review.md`. This change moves #240's guard into a shared helper and applies it to the open stage query.

---

## 1. How it works

### 1.1 The failure

Checking the #242 promotion on staging (deployment `bec7929`, 2026-09-15), Renaissance's Executive Overview rendered **"Couldn't load open pipeline."** on Open Deals, Total Pipeline and Weighted Pipeline (`pipeline-performance.tsx:67`), while Closed Won and Open Deals by Owner loaded. Staging's runtime logs, deduplicated:

| Time (UTC) | Log line |
|---|---|
| 14:14 | `open pipeline fetch failed ... SmQueryError: Supermetrics 500` |
| 14:14 | `owner query failed with campaign_name ... retrying without it: ... Supermetrics 500` |
| 14:14 | `owner fetch failed ... SmTimeoutError: Supermetrics request timed out after 33193ms` |
| 14:31 | `open pipeline fetch failed ... Supermetrics 500` |
| 14:31 | `owner query failed with campaign_name ... retrying without it` (fallback then succeeded) |
| 14:32 | `open pipeline fetch failed ... Supermetrics 500` |

The #240 owner fallback fired twice: it timed out at 14:14 and succeeded at 14:31, which is the first live evidence it works. The open stage query had no fallback.

**Raw probe, 14:53Z.** Renaissance, `openWindow()` = `2023-01-01..2029-12-31`, one attempt per query, no `smQuery` retries:

| Query | Result |
|---|---|
| open stage **+ `campaign_name`** | **500, 2 of 2** (~2s, body `{"error":{"code":"Error:","message":"Error:"}}`) |
| open stage **− `campaign_name`** | **200, 30 rows** (21s cold, then 1.6s) |
| owner **+ `campaign_name`** | **500, 2 of 2** |
| owner **− `campaign_name`** | **200, 87 rows** |
| won YTD stage + `campaign_name` (control) | 200, 22 rows |

Sample request ids `YCUJru3catW8jNwJC4SSd8sXeuKX2GeJ`, `XDKDuGNGNriQQeX9gq54xBpnAdpF2Ddm`. **It had cleared by 15:40Z**: Thomas got 200 on all five, including open stage + `campaign_name` 2 of 2. That is the same intermittent vendor fault as #240 (seen 2026-09-13, cleared 09-14, back 09-15), and it affects any wide-window query carrying `campaign_name`.

### 1.2 Where the open tiles come from

One query, `getOpenStages` (`pipeline.ts:475`), run in parallel with the two won queries and the owner query in `getSalesforcePipelineImpl`.

- **Fields:** `STAGE_FIELDS` (`pipeline.ts:19`): stage name, is_closed, probability, count, amount, `campaign_name`.
- **Window:** `openWindow()` (`pipeline.ts:157`), created-date basis (`OPEN_SETTINGS`, `pipeline.ts:112`), cap `STAGE_MAX_ROWS = 500` (`pipeline.ts:59`), 60s ceiling (`pipeline.ts:93`).
- **Scoping:** `filterByCampaign` (`pipeline.ts:620`), a pass-through for a client with no configured campaign list.
- **Tiles** (`transformPipeline`, `pipeline.ts:268`), over rows where `is_closed` is false: Open Deals = sum of count; Total Pipeline = sum of amount; Weighted Pipeline = sum of amount × probability / 100.

**Why dropping `campaign_name` cannot move an unscoped client's tiles.** Removing the dimension only merges rows that share `(stage, is_closed, probability)`. All three tiles are plain sums over that group, and probability is constant inside it, so the merge is arithmetically invisible (Thomas).

### 1.3 What the change does

`queryWithUnscopedFallback(slug, label, fields, campaignScoped, query)` (`pipeline.ts:453-468`) is #240's owner logic moved into one helper:

1. Runs `query(fields, SALESFORCE_TIMEOUT_MS)`, recording `started` first (`:460`).
2. On failure, rethrows unless **all** hold (`:464`): the client is not campaign-scoped; the error is an `SmQueryError` (`instanceof`); its `status` is `>= 500`, treating a missing status as `0`.
3. Logs `[salesforce] ${label} query failed with campaign_name for ${slug}, retrying without it:` (`:465`).
4. Retries once with `fields.filter((f) => f !== 'campaign_name')`, on `Math.max(SALESFORCE_TIMEOUT_MS - (Date.now() - started), 1_000)` (`:466`).

Call sites:

- `openStagesImpl(slug, campaignScoped)` (`pipeline.ts:470`), label `'open stage'`. **New.**
- `ownerRowsImpl(slug, campaignScoped)` (`pipeline.ts:515`), label `'owner'`. Same behaviour as #240, and its warn string is byte-identical.
- The composer computes `campaignScoped = hasCampaignScope(...)` once (`pipeline.ts:541`) and passes it to both (`:550`, `:570`).

If the retry fails it rejects, the composer's `.catch` (`:550-552`) returns `null`, `openUnavailable` is set (`:632`), and the tiles read "Couldn't load open pipeline.", never $0.

**`filter`, not `splice`.** `STAGE_FIELDS` is shared with `wonStagesImpl`, so stripping the column in place would silently corrupt the won query after any open fallback. Thomas confirmed that mutation fails 8 tests.

### 1.4 What is deliberately excluded

- **Campaign-scoped clients.** Rows without `campaign_name` normalize to `''` and match nothing, so the tiles would dash under "the campaigns may have been renamed" over a vendor fault. `hasCampaignScope` is the same `wantedSet` predicate `filterByCampaign` uses (`campaign-filter.ts:65`, `:79`, `:105`).
- **The won queries** (`wonStagesImpl`, `pipeline.ts:479`). Their windows are a year or less, the probe got 200 for year-to-date with `campaign_name`, and snapshot skew (§1.5) would land on a client-facing year-over-year delta. The docstring warns against wrapping them with a hardcoded `false`, which is the natural edit and reads a scoped client as unscoped. A test now pins it (§3 finding 2).

### 1.5 The figures are the same up to snapshot skew

Thomas verified live at 15:45Z, Renaissance, `openWindow()`:

| Field set | Open deals | Total pipeline |
|---|---|---|
| base **+ `campaign_name`** | 4057 | $181,244,340.49 |
| base, no `campaign_name` | 4057 | $181,244,995.45 |
| base + `opportunity_lead_source` | 4057 | $181,244,995.45 |
| base + `opportunity_owner` | 4054 | $181,243,673.29 |

Supermetrics caches an extract per field set, so the two sides can come from snapshots taken at different times: **$654.96 apart on $181M** between fresh calls.

**A/B trap for whoever verifies this next.** Thomas first measured a perfectly reproducible **$118,357.87** gap across four cold pairs. It was two stale extracts: perturbing `end_date` busts the aggregation layer but not the extract, so the "cold" control proved nothing. The tell was that stage counts differed between the two sides, which no dimension can cause.

### 1.6 Cache, budget and scoping consequences

- **Cache key.** `cached()` calls `cachedFn(today, ...args)`, so the new boolean changes both the positive and negative-memo keys for `openStages`. Every client cold-misses once after deploy, and a fallback entry can never be served to a client later scoped (Thomas confirmed against `lib/cache.ts`).
- **Budget.** The observed 500s are ~2s each, so after `smQuery`'s two internal retries most of the 60s remains, against a measured 10–23s cold open query. A **slow** first failure defeats the fallback: at 14:14Z the owner fallback started with ~33s and timed out.
- **Scoping switches it off.** `campaignNames` is absent for Renaissance in dev (`ep-still-tree-aqs8ui6d`), staging (`ep-restless-union-aqkw7ig0`) and prod (`ep-green-violet-aq11mz6s`) (Thomas). Running `scripts/set-renaissance-campaign-scope.ts` sets it, and both fallbacks stop applying to Renaissance. The script says so in its header comment (`set-renaissance-campaign-scope.ts:21`) and prints it after the write, so the person running it sees it too.

---

## 2. Verification method

**Gates, run for this record at `0958e5f`** (`beb47e1` changes comments only and `ab35902` one script output line; the orchestration spec, 66 passed, and `tsc` were re-run at `beb47e1`, `tsc` again at `ab35902`; Thomas reproduced 1054 / 118 at `beb47e1`): `npx vitest run` **1054 passed / 118 files**; `npx tsc --noEmit` exit 0; `npm run check:rsc` clean. Thomas reproduced 1052 / 118 at `04885e5`.

**TDD record.** The five open-fallback tests were written before the implementation. The retry, both-fail and budget tests failed for the expected reason (1 open call where 2 were expected; `[60000]` where `[60000, 40000]` was expected). The scoped and non-5xx tests passed at RED, because the code never retried then, so they were checked by mutation. The two review tests (`:1395`, `:1419`) pin existing behaviour and were likewise checked by mutation.

**Static anchors confirmed at `0958e5f`, unchanged at `beb47e1` and `ab35902`** (`git show 0958e5f:<file> | grep -n`): `pipeline.ts:19`, `:59`, `:93`, `:112`, `:157`, `:268`, `:426`, `:448-449`, `:453`, `:460`, `:464`, `:465`, `:466`, `:470`, `:475`, `:479`, `:515`, `:520`, `:541`, `:550`, `:551`, `:570`, `:620`, `:632`, `:682`; `pipeline.orchestration.test.ts:254`, `:1272`, `:1309`, `:1324`, `:1337`, `:1355`, `:1372`, `:1395`, `:1419`; `pipeline-performance.tsx:67`; `campaign-filter.ts:65`, `:79`, `:105`; `set-renaissance-campaign-scope.ts:21`, `:78`.

**Mutations.** Each was applied to a backed-up copy of `pipeline.ts` with the orchestration spec run and the file restored; none is part of the diff.

| # | Mutation | By | At | Result |
|---|---|---|---|---|
| 1 | Composer passes `false` to `getOpenStages` | author, Thomas | `04885e5` | 1 failed: scoped test (`:1324`) |
| 2 | `(e.status ?? 0)` → `(e.status ?? 500)` | author, Thomas | `04885e5` | 2 failed: owner + open non-5xx |
| 3 | `instanceof SmQueryError` → duck-typed `.status` | author, Thomas | `04885e5` | 2 failed: owner + open non-5xx |
| 4 | Fallback swallows its failure (`.catch(() => [])`) | author, Thomas | `04885e5` | 2 failed: owner + open both-fail |
| 5 | Fallback gets a fresh 60s | author, Thomas | `04885e5` | 2 failed: owner + open budget |
| 6 | Drop the `1_000` floor | Thomas | `04885e5` | **survived** |
| 6′ | same | author, Thomas | `0958e5f` / `beb47e1` | **1 failed**: `a fallback that starts with almost no budget left still gets the 1s floor` |
| 7 | Strip the column in place (`splice`) | Thomas | `04885e5` | 8 failed |
| 8 | `>= 500` → `> 500` | Thomas | `04885e5` | 6 failed |
| 9 | Open label `'open stage'` → `'owner'` | Thomas | `04885e5` | 1 failed |
| 10 | Capture `started` after the first attempt | Thomas | `04885e5` | 2 failed: owner + open |
| 11 | Wrap `wonStagesImpl` in the helper with `false` | Thomas | `04885e5` | **survived** |
| 11′ | same | author, Thomas | `0958e5f` / `beb47e1` | **1 failed**: `a won query is never retried without campaign_name, even for an unscoped client` |

That every shared-guard mutation (2, 3, 4, 5, 8, 10) fails **both** the owner and open describes is the evidence the refactor preserves behaviour: the owner path runs through the same guard, not through a second copy.

**Logic executed in a throwaway probe** (tsx, deleted; not part of the diff): campaign-less won rows through a scoped `filterByCampaign(rows, ['2026 - Inbound Prospecting'])` return `kept: 0, active: true, unmatched: true`, and `transformPipeline` on the result gives `closedWon.value` 0, which `wonValueUnknown` dashes. This corrects the stated consequence of finding 2.

**Live calls.** The author's raw probe at 14:53Z (§1.1) and Thomas's at 15:40–15:45Z (§1.1, §1.5) are direct Supermetrics API calls. The per-environment `campaignNames` state (§1.6) is Thomas's DB check, cited and not re-run.

**Flagged rather than asserted (external trigger unverified):** the **open** stage fallback has not run against the live API. The fault cleared before this branch was deployed anywhere. Only the owner path of the shared helper has been seen working live (staging 14:31Z). The tests are the evidence for the open path.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ○ | CONFIRMED | `pipeline.ts:426` | At `04885e5` the docstring claimed an unscoped client's figures are "identical" without `campaign_name`. They are the same only up to snapshot skew between separately cached extracts ($654.96 on $181M), and the naive cold A/B is misleading ($118K false gap). **Closed in `0958e5f`.** |
| 2 | ○ | CONFIRMED | `pipeline.ts:479` | Nothing pinned the won queries outside the fallback. Wrapping `wonStagesImpl` with a hardcoded `false` left all 64 spec tests green; a scoped client would then drop `campaign_name` on a 5xx, match none of its campaigns, and dash Closed Won under the false "may have been renamed" caveat (the review said it would report the whole book; corrected in §4). **Closed in `0958e5f`** (test `:1419`; docstring `:448-449`). |
| 3 | ○ | CONFIRMED | `pipeline.ts:466` | The `1_000` budget floor was the only branch in the new helper with no test behind it; removing it left the suite green. Carried over from #240. **Closed in `0958e5f`** (test `:1395`). |
| 4 | ○ | CONFIRMED | `pipeline.ts:541`, `set-renaissance-campaign-scope.ts:21`, `:78` | The fallback protects Renaissance only while `campaignNames` is unset. Setting it (the #230 campaigns) silently turns both fallbacks off, and the tiles dash on the next vendor fault weeks later. **Documented** in the scope script's header, its output, and the PR; correct behaviour, no change to the fallback. |
| 5 | ○ | CONFIRMED | `pipeline.ts:475`, `:550` | The new argument changes every client's `openStages` cache key, so each cold-misses once after deploy (up to ~21s measured on a cold open query; staging has no warm cron). **Documented** in the PR. |
| 6 | ○ | CONFIRMED | `pipeline.ts:465`, `lib/cache.ts` | A successful fallback is recorded as a healthy fetch, so `salesforce/openStages` stays green while the vendor fault persists. The only trace is `[salesforce] open stage query failed with campaign_name`. **Documented**; intended degradation. |
| 7 | ○ | CONFIRMED | `pipeline.ts:466` | A slow first failure leaves the fallback too little budget, and it degrades exactly as without it. Observed live on the shared owner path: staging 14:14Z, `SmTimeoutError` after 33193ms. **No change**: correct degradation, not a rescue. |

No **●** correctness findings. Thomas described the refactor as the right call and agreed with leaving the won queries alone.

---

## 4. Detail

### Finding 1: "identical" overclaims

**Mechanism.** See §1.5. The arithmetic guarantees the tiles are invariant to the dimension, but the vendor serves each field set from its own cached extract, so the two sides can differ by snapshot age. Low stakes for one absolute figure; it is also the strongest argument against extending the fallback to the won queries, where the skew would move a year-over-year delta.

**Fix (landed).** Docstring reworded to "the same ... up to snapshot skew", with the measurement and the A/B trap written down.

### Finding 2: won queries not pinned out

**Mechanism.** `queryWithUnscopedFallback` reads as generic. `wonStagesImpl` has no `campaignScoped` to pass, so the obvious wrap passes `false`, which tells the helper every client is unscoped. For a scoped client a won-query 5xx would drop `campaign_name`.

**Correction to the review.** Thomas's comment, and the docstring as first written in `0958e5f`, said Closed Won would then report the whole org's book as agency-sourced. It would not. `filterByCampaign` reads the configured names, not `campaignScoped`, so campaign-less rows match nothing. Probed directly (§2): `kept: 0, active: true, unmatched: true`, and the composer's `wonValueUnknown` dashes the tile under the "campaigns may have been renamed" caveat. That is the same false accusation the scoped guard prevents on the open and owner queries. It's still worth pinning, but the harm is a wrong caveat, not an inflated number. The docstring and test comment were corrected in `beb47e1`. Thomas confirmed the correction in round 2 with his own probe: a $9M whole-book closed-won row with no `campaign_name` came out as `closedWon` 0, `wonValueUnknown` true, `wonCampaignUnmatched` true.

**Fix (landed).** Test on an **unscoped** client: both won queries (current and prior-year) reject with `SmQueryError('Supermetrics 500', 500)`; asserts two won calls in total, each carrying `campaign_name`, and `wonUnavailable` true. Pinned on an unscoped client so that any wrapping fails and must be a deliberate decision, not only the hardcoded-`false` one.

### Finding 3: 1s floor unpinned

**Mechanism.** Without the floor a fallback that starts past the deadline gets a non-positive timeout and aborts immediately; with it, it gets 1s. A cold open query takes 10–23s, so neither completes, and the practical difference is small. It was simply the only unpinned branch in a helper now shared by two call sites.

**Fix (landed).** First attempt advances the clock 59.5s; asserts open-query timeouts `[60_000, 1_000]`.

### Finding 4: scoping disables the fallback

**Mechanism.** `campaignScoped` flips to true the moment `salesforce_config.campaignNames` holds a real name. Both fallbacks then rethrow, which is correct for a scoped client, but the two changes look unrelated and the symptom only appears on the next vendor fault.

**Fix (landed, documentation only).** A `SIDE EFFECT` block at the top of `scripts/set-renaissance-campaign-scope.ts`, naming the four affected blocks and the log line to check.

### Findings 5–7

Operational consequences carried in the PR description; see §1.6. No code change for any of them.

---

## 5. Follow-ups

**Closed on the feature branch (`0958e5f`)**
1. **Finding 1**: docstring reworded to snapshot skew, with the A/B trap.
2. **Finding 2**: won queries pinned out of the fallback by test.
3. **Finding 3**: 1s floor pinned by test.
4. **Finding 4**: scoping side effect documented in the scope script's header and printed in its output (the output line was Thomas's round-2 note).

**Operational, carried in the PR description (no code)**
5. **Finding 6**: a green `salesforce/openStages` beacon is not evidence the fault ended; grep for `open stage query failed with campaign_name`.
6. **Finding 7**: a slow 5xx defeats the fallback; check how long the primary ran before the warn.
7. **Finding 5**: one cold `openStages` miss per client after deploy.

**Needs a live call first**
8. The open stage fallback has not run against the live API. After this reaches staging, on the next recurrence confirm the warn line appears and the three open tiles render.

**Decide together**
9. Whether the won queries should ever get a fallback. Current answer is no (§1.4); revisit only if a won query logs the same 500, and weigh the snapshot skew landing on a year-over-year delta.
10. Before scoping Renaissance (#230), decide whether losing both fallbacks is acceptable or whether a scoped-safe degradation is needed.

**Unrelated, seen in both environments' logs**
11. `numeric field "opportunity_amount" missing, defaulting to 0`: a missing amount silently becomes $0 and still feeds Total Pipeline, Weighted Pipeline and the owner amounts (`lib/salesforce/num.ts:13-17`). Tracked in `CLAUDE.md` → *Known Follow-ups — Salesforce / Executive Overview* (PR #248); GitHub Issues are disabled on this repo.

**Blocking the ship:** none. All review follow-ups are closed, including Thomas's round-2 output note (`ab35902`). Thomas has not yet approved. #243 reaches staging and prod only through `dev → staging → main`.
