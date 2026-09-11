# Code Review Record — `Renaissance-CRM-Salesforce` (PR #208)

**Feature under review:** PR #208 — Renaissance CRM data: Salesforce via Supermetrics, targeting `dev`.
**Diff range reviewed:** `749b891..fb03de9` (merge base with `dev` through branch head), 21 files, +5341/-2. No unrelated code is in scope.
**Reviewers:** Paul (rounds 1 through 4), Thomas (author, and reviewer of the round-4 fixes).
**This document changes no code.** Unusually for this template, it is written *after* the fixes landed rather than before: PR 208 ran four review rounds on the branch, each round's fixes were applied and re-reviewed on the branch before merge, and this record consolidates the arc. Every finding below carries its resolution and the commit that closed it.

This is Half A only — the data layer. There is no UI consumer on this branch.

Files in scope:

| File | Change |
|---|---|
| `lib/salesforce/base.ts` | new — `salesforceQuery()` wrapper + `resolveCompareIso()` |
| `lib/salesforce/pipeline.ts` | new — four pipeline tiles, by-owner breakdown, fetch orchestration |
| `lib/salesforce/contacts.ts` | new — weekly contact pacing |
| `lib/salesforce/num.ts` | new — `toNumber` / `parseBool` / `toBool` coercion |
| `lib/salesforce/types.ts` | new — `PipelineData`, `WeeklyContacts`, row types |
| `lib/salesforce/*.test.ts` (4 files) | new — 109 tests |
| `lib/db/schema.ts`, `drizzle/0021_*` | new nullable `clients.salesforce_config` jsonb column |
| `lib/supermetrics/constants.ts` | `DS_IDS.SALESFORCE = 'SF'` |
| `scripts/seed.ts` | `salesforceConfig` field, Renaissance org id |
| `MIGRATIONS-PENDING.md` | ordered apply-before-merge checklist for 0021 |
| `vitest.config.ts` | four salesforce specs added to the CI include allowlist |
| `docs/superpowers/{plans,specs}/*` | build plan, CR-fix plan, parity scorecard |

---

## §1 How it works

Everything comes from **one source**: the Supermetrics Salesforce connector (`ds_id: 'SF'`, `lib/supermetrics/constants.ts`), account `00D15000000Em4GEAS`, with the per-client API key read from the env var named in `clients.sm_api_key_env_var`. `salesforceQuery()` (`lib/salesforce/base.ts:24`) resolves key and account, calls `smQuery`, and returns `parseSmRows` output. There is no second source, no blending, and no server-side filtering (see §1.6).

### 1.1 The four pipeline tiles

`getSalesforcePipelineImpl` (`lib/salesforce/pipeline.ts:240`) issues **four queries in parallel**, on two different date bases:

| Query | Fields | Window | Date basis |
|---|---|---|---|
| open | `STAGE_FIELDS` | `openWindow()` | `deal_created` |
| closed-won, current | `STAGE_FIELDS` | `year_to_date` | `deal_closed` |
| closed-won, prior | `STAGE_FIELDS` | `previous_year` of that | `deal_closed` |
| by-owner | `OWNER_FIELDS` | `openWindow()` | `deal_created` |

**Why two bases.** Openness is a property of *right now* — is this deal still open, yes or no — not of a date range. The original implementation windowed the open tiles by close date (the connector's `deal_closed` default), which silently kept only deals whose close date had already passed: the overdue subset. Live, that is 295 deals / $18.0M against a true 3,849 / $150.3M, roughly an 8x understatement. The open tiles therefore query the **created-date** basis over a wide window and filter `is_closed` in our own code. `closedWon` legitimately stays on the close-date year-to-date window, because closed-won is a historical fact recorded at close time.

**The window is derived, never hardcoded** (`openWindow(now)`, `lib/salesforce/pipeline.ts:69`) — January 1 of nine years ago through nine years out. Supermetrics' Salesforce historical floor is a **rolling** "today minus 10 years", so a static literal slips under it as the clock advances and every open and owner query 400s with `START_DATE_HISTORICAL`. That happened: a hardcoded `2016-08-20`, correct on the day it was probed, was one day under the floor by the next morning. Nine years back is always comfortably above a ten-year rolling floor (worst case, on Dec 31, still a day above), and an opportunity open nine or more years is vanishingly rare. Year-granular bounds keep the query cache-stable within a calendar year.

Given `open` = rows where `!isClosed`:

- **Open Deals** = sum of `opportunity_count`
- **Total Pipeline** = sum of `opportunity_amount`
- **Weighted Pipeline** = sum of `amount × (probability / 100)`. Probability arrives 0-100, so the divide is mandatory or the figure is 100x too large; a test pins it.
- **Closed Won** = sum of `amount` over rows where `isClosed` **AND** `stage === wonStage`

All three open tiles carry **no delta** (`kpiNoDelta`, `lib/salesforce/pipeline.ts:118`). A prior-year window has had a year for its deals to close, so open pipeline trends to ~0 by construction and any year-over-year percentage is structurally invalid, not merely noisy. `closedWon` keeps its delta, computed against the prior-year window and withheld by `pct()` (`:105`) whenever the prior is non-positive — closed-won amounts can go negative (credits, refunds), and -50k to +100k must not render as "down 300%".

### 1.2 What counts as "won", and why not `is_won`

`wonStage` is `salesforceConfig.wonStageName ?? 'Closed Won'` (`:40`), a per-client override read from the DB row. Two native alternatives were considered and rejected:

- **`opportunity_is_won`** also covers roughly 1,822 renewals carrying $0, which are not new-business wins. It is also not requested at all, since it is a dimension and would multiply row cardinality for no benefit.
- **`opportunity_amount_closed_won`** exists natively but cannot honor a per-client `wonStageName`, and most likely keys off `is_won` with the same renewal problem.

Won additionally requires `isClosed`, so a row whose stage reads `Closed Won` while its `is_closed` flag is still false (a mid-migration state) counts once — as open — instead of inflating both tiles.

### 1.3 By-owner breakdown

Open rows aggregated by `opportunity_owner`, sorted by deal count descending (`transformByOwner`, `:204`). One owner can span several rows because `is_closed` is a dimension. A blank owner falls back to `Unassigned`. A failed fetch surfaces as `byOwner: null`, never `[]` — the two must never be conflated, or a failure reads as "this client has no owners".

### 1.4 Weekly contacts

`yearWeekIso_created` + `contact_count`, year to date, with the prior-year window for comparison, on the `fetched_by_created` basis (`CONTACT_SETTINGS`, `lib/salesforce/contacts.ts:15`) so these are genuinely new contacts per week.

The API returns `'YYYY|WW'`, normalized to `'YYYY-Www'`, merged by key (a duplicated week must not displace the real prior week), sorted numerically, and then **gap-filled** with explicit zeros from the first observed week through the current one (`gapFill`, `:98`). The API omits empty periods entirely, so without gap-filling the "previous" week could be any distance back in the calendar while still being presented as week over week. For this metric an absent week genuinely is zero contacts created, so the zero is the truth rather than a guess. A week number its year does not have (W53 in a 52-week year) has no slot in the rebuilt calendar and warns rather than vanishing from the total.

The comparison rule is the load-bearing part:

- **`currentWeek`** is the ISO week in progress, covering only the days elapsed, published alongside `currentWeekPartial` and `daysElapsedInCurrentWeek` so a consumer cannot render it without meeting the fact that it is partial.
- **`previousWeek`** is the most recent *complete* week.
- **`completedWeekOverWeek`** compares the two most recent *complete* weeks. It is deliberately not a comparison against `currentWeek`: rendered on a Monday, partial-vs-complete reads as an ~85% collapse that is really just a week that has barely started. The field was renamed from `weekOverWeek` precisely so it cannot be misread as describing the current week.
- **`priorYearWeek`** matches the same ISO week number as `previousWeek`, so both sides are full weeks. This also sidesteps the compare window's own ragged edge: it ends on the same calendar date a year earlier, which is almost never the same weekday, so its final bucket is clipped short.

### 1.5 Data-quality flags on `PipelineData`

Six flags exist so a degraded number is legible to whoever reads the dashboard, rather than only to whoever reads the server log:

| Flag | Means |
|---|---|
| `stageTruncated` | a stage query hit `maxRows`; the four headline tiles may be undercounted |
| `ownersTruncated` | the owner query hit `maxRows`; keyed to the raw row count on purpose, since a capped response can hide owners we never rendered |
| `unrecognizedClosedFlags` | count of rows whose `is_closed` value could not be read; those rows are failed CLOSED, shifting the tiles by an unknown amount in a known direction. Counts rows across the section's overlapping queries, not distinct deals |
| `wonStageUnmatched` | the closed-won window returned rows but none counted as won, so a $0 tile is a stage-label problem rather than a real zero |
| `openUnavailable` / `wonUnavailable` | that query failed and degraded; the tile is 0 for want of data |

### 1.6 Deliberate non-choices

- **No server-side filters.** A typo'd filter field returns HTTP 200 with empty data and no error, indistinguishable from a legitimate zero. Filtering happens in the transforms, where a mistake fails a test.
- **All connector settings pinned**, never left on Supermetrics defaults: `deal_date_field`, `data_fetched_by`, `convert_to_default_currency`. The last is pinned `false` because requesting `true` 500s outright on this org ("multi-currency not enabled"); the org is single-currency, confirmed twice (blank `opportunity_currency_iso_code`, plus the connector's own refusal).
- **Both fetchers cached** at a 1-hour TTL with `byClient` tags, matching the HubSpot fetchers they replace: six Supermetrics queries per render, any of which can take the async schedule/poll path, is too much live-render latency for a client-facing page.

---

## §2 Verification method

Findings were probed, not just read.

1. **Static anchors** confirmed at the stated `file:line` on the branch head (`fb03de9`).
2. **Logic executed.** Each round's fixes were written test-first and mutation-checked by hand: the widened boolean vocabulary, the unrecognized-flag counter, the warn suppression, the `.catch`, the week merge, the gap-fill, and the completed-week filter were each reverted individually, confirmed to fail their test, and restored. `lib/salesforce/` runs **109 tests**, up from 60 before review.
3. **Live read-only probes** against the Renaissance account, via `smQuery` directly (the DB path was unavailable — see §5):

| Probe | Result |
|---|---|
| Date basis, close-date YTD vs created-date wide | 295 / $18.0M vs 3,849 / $150.3M |
| Stage cardinality, wide window | 31 rows, 13 stages (cap 500) |
| Owner cardinality, wide window | 129 rows, 93 owners, 36 open (cap 500) |
| Cold-call latency | 6.6s to 12.7s, plus two outright 15s timeouts |
| Static floor `2016-08-20`, one day after it was probed clean | **400**, twice, in 0.5s |
| Derived window `openWindow()` | 200 — 3,858 deals / $153.0M |
| `convert_to_default_currency: true` | 500, "multi-currency not enabled" |

4. **Database state** verified directly rather than trusting a migrator exit code: `select column_name from information_schema.columns where table_name = 'clients' and column_name = 'salesforce_config'`.
5. **CI**: `test`, `rsc-boundary` green on the branch head; `tsc --noEmit` and `check:rsc` clean locally.

---

## §3 Findings

Severity: **●** correctness, **○** cleanup/convention. Status: CONFIRMED (proven in-tree or live) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

### Round 1-3 (19 findings, all closed)

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `pipeline.ts:164` | Open tiles windowed by close date, showing only the overdue subset (~8x understated) |
| 2 | ● | CONFIRMED | `pipeline.ts:73` | A won-stage row not flagged closed was double-counted into open *and* won |
| 3 | ● | CONFIRMED | `num.ts:21` | `''` / `null` / whitespace silently coerced to a confident `0` |
| 4 | ● | CONFIRMED | `num.ts:18` | Coercion warns named no field, so they were unactionable |
| 5 | ● | CONFIRMED | `contacts.ts:53` | `currentWeek` was the last present bucket, silently promoting a stale week |
| 6 | ● | CONFIRMED | `contacts.ts:60` | Partial-vs-complete week delta shipped unsuppressed |
| 7 | ● | CONFIRMED | `contacts.ts:28` | Duplicate week keys pushed as separate buckets, not merged |
| 8 | ● | PLAUSIBLE | `contacts.ts:39` | Lexicographic sort assumed a well-formed ISO year |
| 9 | ● | CONFIRMED | `base.test.ts:3` | The file never ran in CI, so `resolveCompareIso` was covered by nothing |
| 10 | ● | CONFIRMED | `schema.ts:151` | Migration ordering: the column ships with the code that reads it (see §5) |
| 11 | ● | CONFIRMED | `MIGRATIONS-PENDING.md` | `db:migrate` is timestamp-gated and can no-op silently while exiting 0 |
| 12 | ○ | CONFIRMED | `base.ts:39` | Three connector settings left on Supermetrics defaults |
| 13 | ○ | CONFIRMED | `pipeline.ts:47` | `pct()` sign-flipped on a negative prior |
| 14 | ○ | CONFIRMED | `pipeline.ts:149` | `ownersTruncated` semantics vs. the deduped list |
| 15 | ○ | CONFIRMED | `pipeline.ts:20` | Cardinality comment off by 2x |
| 16 | ○ | CONFIRMED | `pipeline.ts:90` | Currency conversion never pinned |
| 17 | ○ | CONFIRMED | `pipeline.ts:32` | `opportunity_amount_closed_won` not compared against the stage-literal approach |
| 18 | ○ | CONFIRMED | `contacts.ts:67` | Comment named a report type that this source does not have |
| 19 | ○ | CONFIRMED | `orchestration.test.ts:31` | Fixtures carried `opportunity_is_won`, implying a field production never requests |

### Round 4 (6 findings, all closed)

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 20 | ● | CONFIRMED | `num.ts:38` | `toBool` failed closed on an unrecognized flag, moving a `'Yes'` row into `closedWon` with no signal |
| 21 | ● | CONFIRMED | `pipeline.ts:202` | The widened open query had no `.catch`, so one slow call blanked the section and discarded data that fetched fine |
| 22 | ● | CONFIRMED | `pipeline.ts:213` | Owner cap justified on a year-to-date measurement after the window widened to all history |
| 23 | ● | CONFIRMED | `pipeline.ts:51` | `OPEN_WINDOW` bounds stated as proof rather than as a connector limit |
| 24 | ○ | CONFIRMED | `pipeline.ts:26` | `STAGE_MAX_ROWS` headroom comment stale |
| 25 | ○ | CONFIRMED | `pipeline.ts:118` | Two warns fired as a contradictory pair, naming one stage absent and present in consecutive lines |

### Round 4 fixes, reviewed in turn (1 finding, closed)

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 26 | ● | CONFIRMED | `pipeline.ts:51` | The fix for #23 hardcoded `2016-08-20` as a static floor. That floor is **rolling**; the literal 400'd the next day, and the `.catch` added for #21 turned the crash into a permanent silent $0 across three tiles and `byOwner` |

Finding 26 is the one worth remembering. Two individually sound fixes — a wide window and a degrade path — combined into a failure mode neither had alone: the degrade path converted a loud daily crash into a silent daily zero. It was found by reviewing the reviewer's own fixes rather than assuming they were safe because they closed a finding.

---

## §4 Detail on the load-bearing findings

**#1 — date basis.** `deal_date_field` defaults to `deal_closed`, so filtering by date before checking `is_closed` discards every open deal whose close date has not yet arrived, which is most of them. Fixed by splitting the queries onto two bases (§1.1). Live-confirmed both before and after.

**#20 — boolean coercion.** `toBool` recognized `true/false/1/0` only. A CRM export carrying `'Yes'` fell to the unrecognized branch, which fails CLOSED, so a `Closed Won` row carrying `'Yes'` passed the `isClosed &&` filter into `closedWon`. Probed: openDeals 0, totalPipeline 0, closedWon $500k, zero warns. Fixed by widening the vocabulary (`parseBool`, `num.ts:33`) **and** surfacing `unrecognizedClosedFlags`, since failing closed remains the right default but must not be invisible.

**#21 — degrade path.** The won-prior and owner fetches caught and degraded; the open and won-current queries threw through, so one timeout blanked the section via the error boundary and discarded the tiles that had succeeded. Not hypothetical: the 15s guard fired live during probing. Fixed with matching catches plus `openUnavailable` / `wonUnavailable`.

**#26 — rolling floor.** Supermetrics' floor is `today - 10 years`, recomputed daily. A literal probed clean on 2026-08-20 was under the floor on 2026-08-21, and every open and owner query 400'd. Combined with #21's catch, the tiles rendered $0 with `openUnavailable` set — but nothing consumes that flag yet, so the dashboard would have shown a confident zero indefinitely. Fixed by deriving the window from the clock, with a test pinning the rolling-floor property so a static literal fails it.

**#10 — migration ordering.** Drizzle's relational query builder enumerates columns explicitly; it never emits `select *`. So `salesforce_config` appears in **every** `clients` read the moment the column enters `lib/db/schema.ts`, including `getClientBySlug` / `getClientByEmail`, which back the Auth.js session callback and every `/dashboard` and `/portal` page. Against a database without the column that is Postgres `42703`, and it throws rather than degrades — a full outage, not a broken CRM block. Compounded by #11: `drizzle-kit migrate` reads only the newest bookkeeping row and applies by timestamp comparison, never by hash, so an out-of-order row causes it to skip the migration and still exit 0.

---

## §5 Follow-ups

**Blocking the feature working live (not the merge):**

1. **Apply migration 0021 to staging and production** before the code reaches those branches, using `scripts/migrate-http.ts` (hash-diffed) rather than `npm run db:migrate`, and verify with the `information_schema` query every time regardless of exit code. Applied and verified on the development database on 2026-08-21.
2. **Set `renaissance.salesforce_config`** with a targeted UPDATE. It is still `null`, so the section renders nothing and an end-to-end `getSalesforcePipelineImpl('renaissance')` probe is not yet possible. This is also why the live probes in §2 went through `smQuery` directly.

**Highest-value remaining risk:**

3. **The 15s `REQUEST_TIMEOUT_MS` guard is now load-bearing on a client-facing tile.** Cold calls on the corrected window measured 6.6s to 12.7s, with two outright timeouts during probing. A timeout degrades to `$0` + `openUnavailable`, but **nothing renders that flag until Half B**, so the failure still presents as a confident zero. Already tracked in CLAUDE.md as configurable-dashboard tech debt; the widened window promotes it to a client-facing risk.
4. **Half B must consume the six data-quality flags** (§1.5), or they are just fields in an object and every degraded state renders as a real number.

**Process:**

5. **Migration-ordering CI guard** — PR #211, a label gate requiring `migration-applied` when a PR changes both `drizzle/*.sql` and `lib/db/schema.ts`. Deliberately not the blanket both-changed failure originally proposed, which would fail every legitimate migration PR since Drizzle generates the migration alongside the schema edit. Still needs adding as a required status check on `dev`, `staging` and `main`.

**Cleanup, deferred by agreement:**

6. **`resolveCompareIso` is now copy-pasted a third time** (byte-identical across salesforce, meta, linkedin), and **`@/lib/ga4/client` drags the GA SDK** transitively into every Supermetrics module that imports date helpers. One shared `lib/date-range` helper fixes both, but it touches two other channels, so it is tracked as a follow-up rather than widening this PR's blast radius.
