# BigQuery Read Path (Google Ads, LinkedIn): Code Review Record

**Scope.** PR #459, branch `feat/bq-read-path-ads`. Feature diff `3e432e8f..92bbd8cb`
(`git diff origin/dev...92bbd8cb`): the eight feature commits `b738b616..f1366872` (2026-10-13/14),
the merge of `dev` at `ce4592c3` (no conflicts), and two commits from this review, `cd0d1c3f` and
`92bbd8cb`. 19 files, +812 / -11, all under `lib/bq/`, `lib/paid-search/base.ts`,
`lib/linkedin/base.ts`, their tests, `scripts/bq-shadow-compare.ts`, `.env.example` and
`vitest.config.ts`. No unrelated code.

**This document changes no code.** The two fixes it found were made on the feature branch
(`cd0d1c3f`, `92bbd8cb`) before this record, as the branch flow requires. Everything else is in §5.

Context: tracker item C1. Renaissance's Google Ads (and later LinkedIn) reporting moves off
Supermetrics onto the warehouse before the licence ends on 2027-01-20. This PR is the dashboard
side. It is off in every environment until `DATA_BACKEND_GOOGLEADS=bq` is set, and serves only the
slugs in `BQ_CLIENTS`.

---

## 1. How it works

### 1.1 The switch

`bqEnabled(source, slug)` (`lib/bq/backend.ts:11`) is true only when **both** hold:

- `DATA_BACKEND_GOOGLEADS` (or `DATA_BACKEND_LINKEDIN`) is exactly `bq`. Anything else, including
  unset or `BQ`, means live Supermetrics.
- the client's slug is in the comma-separated `BQ_CLIENTS`.

Each source has its own flag, so turning Google Ads on leaves LinkedIn on Supermetrics. Pinned by
`backend.test.ts:19` and, at the `linkedinQuery` level under exactly the Production config of the
C1 gate (Google Ads `bq`, LinkedIn unset, `BQ_CLIENTS=renaissance`), by `base.bq.test.ts`
"with only Google Ads switched to bq (the C1 production config), LinkedIn stays live and never
reads BigQuery".

### 1.2 Where a Google Ads number comes from when it is on

`awQuery` (`lib/paid-search/base.ts:19`) is the one funnel every Paid Search fetcher uses (KPIs,
hero, campaigns, leads, geo, keywords) plus the Paid Media trend. When the switch is on and the
call carries no Supermetrics `filters` or `settings`, it calls `readAwMart` instead of `smQuery`.

- **Which table.** `pickAwMart` (`lib/bq/googleads.ts:42`) picks one of six marts in
  `avenue-z-data-warehouse-prod.marts` from the fields asked for: conversions with keyword, geo or
  neither; otherwise keyword, geo or campaign performance. A field the chosen mart does not carry
  throws `unsupported` before any BigQuery call.
- **The SQL.** `buildAwSql` (`:54`) sums cost, clicks, impressions or conversions, grouped by the
  same dimensions Supermetrics was asked for (`Date`, ISO week `Yearweekiso`, campaign, keyword,
  match type, region, metro, conversion type), filtered to the client's Google Ads account and the
  date range. Values go in as named parameters. Table names are checked against `^[A-Za-z0-9_]+$`
  (`lib/bq/client.ts:32`).
- **Zero rows.** Supermetrics returns no row for a conversion type with 0 conversions; the marts
  keep them. `having sum(t.conversions) != 0` (`:66`) drops them so lists match.
- **Shape.** `toSmRows` (`:71`) hands rows back keyed and stringified exactly as Supermetrics did,
  so every transform downstream is unchanged.
- **Cache.** One hour per (account, fields, range), under `bigquery/readAwMart` (`:80`).

### 1.3 When it falls back to live, and what it logs

`readAwMart` (`:87`) refuses, and `awQuery` serves Supermetrics instead, in three cases:

| Reason | When | Where |
|---|---|---|
| `unsupported` | a field no mart carries, or a range starting before **2026-04-01** (`AW_HISTORY_FROM`, the first day prod's marts match raw) | `googleads.ts:50`, `:89` |
| `stale` | the range ends after the newest day in `mart_googleads_campaign_performance`. Checked once an hour (`martFreshThrough`, `lib/bq/freshness.ts:11`), so a partial range is never served | `freshness.ts:20` |
| `error` | anything else: BigQuery down, permission, timeout (20 s job cap, `client.ts:38`), bad key | `backend.ts:19` |

Every fallback writes one JSON line: `{"event":"bq_fallback","source","slug","reason","detail"}`
(`backend.ts:18`). A successful BigQuery read writes nothing.

### 1.4 LinkedIn

Built the same way (`lib/bq/linkedin.ts`, `lib/linkedin/base.ts:37`), with two declared gaps that
always stay live: Reach (`approximateUniqueImpressions`) and Geography (`memberRegion`). LinkedIn's
own rates (CTR, CPM, CPC, cost per lead, form completion) are recomputed as `round(sum/sum, 4)`,
which is what parity matched. **It is not being turned on in C1.** The connector has no LinkedIn
data yet (it waits on LinkedIn's API approval, E2, and the pull, A14), and with
`DATA_BACKEND_LINKEDIN` unset no LinkedIn call reaches BigQuery.

### 1.5 What the marts hold today

Prod's `connector_switch` (data-warehouse `dbt/models/staging/connector_switch.sql`) is empty on
`dev` and absent on `main`. So the Google Ads marts this PR reads are still **Supermetrics' stored
copy**, loaded nightly with a 35-day refresh window. The connector switch (X1) replaces it with the
connector's own pull. Turning this PR on before X1 moves Renaissance from live Supermetrics to
yesterday's stored Supermetrics; turning it on after X1 moves it to the connector. Finding 2 is
about that order.

---

## 2. Verification method

**Gates, run locally at `92bbd8cb` on 2026-11-16** (GitHub Actions is billing-blocked org-wide, so
the PR's checks fail in seconds with a billing message and say nothing about the code):
`make check` with CI's own placeholder `DATABASE_URL=postgresql://ci:ci@db.invalid/ci`
(`.github/workflows/ci.yml`): typecheck exit 0, `vitest run` **385 files, 4,709 tests passed**, `check:rsc` passed,
`next build` exit 0. `npm run lint` is not in the gate (73 errors on `dev`); `eslint` over every
file this branch touches is clean after `92bbd8cb`.

**Static anchors confirmed at the stated line** at `92bbd8cb`: `backend.ts:11`, `:18`, `:19`;
`client.ts:19`, `:32`, `:38`; `freshness.ts:11`, `:20`; `googleads.ts:14`, `:42`, `:50`, `:54`,
`:61`, `:66`, `:71`, `:80`, `:87`, `:89`; `linkedin.ts:62`; `lib/paid-search/base.ts:19`;
`lib/linkedin/base.ts:37`; `lib/date-range.ts:57-90`; `components/layout/date-range-picker.tsx:32-40`.

**Executed for this record:**

- The key leak (Finding 1): Node 26 `JSON.parse` on text containing `"private_key": SECRETVALUE123`
  returns `Unexpected token 'S', ..."ate_key": SECRETVALU"... is not valid JSON`. The new test
  failed with exactly that message before the fix and passes after.
- Every `awQuery` / `linkedinQuery` caller on the merged tree (`git grep`): the nine fetchers the
  shadow compare covers, and no others. `dev` changed nothing under `lib/paid-search`,
  `lib/linkedin` or `lib/supermetrics` since the branch was cut.
- The date presets (Finding 3): `resolveDateRange` ends `this_week`, `this_month`, `this_quarter`
  and `year_to_date` on today (`lib/date-range.ts:70-89`), and the report picker offers all four.

**`bq-shadow-compare`, prod `marts`, 2026-11-16 about 18:50 UTC.** Run unedited from this branch as
`CACHE_DISABLE=1 npx tsx --env-file=<main checkout>/.env.local scripts/bq-shadow-compare.ts
renaissance`, reading BigQuery as `dashboard-reader@` (no grant needed: it already reads `marts`).
It calls each fetcher once against live Supermetrics and once against the marts and diffs the
outputs. Ranges: last 7, 30 and 90 days (ending 11-15), October, and Q2.

`SHADOW DIFFERS: 12892 compared, 68 MISMATCH, 43 TIE, 9 ORDER, 0 NOT RUN`

| Range | Google Ads MISMATCH | What they are |
|---|---:|---|
| October | 4 | `leads.compareValue` (September: 39.97 live, 37.97 marts) and the leads, CPL and conversion-rate deltas built on it. October's own values all match |
| Q2 | 12 | geo only: Missouri's two clicks Google moved between Kansas City and Columbia-Jefferson City, and Florida/Georgia, where live has one click more than every warehouse copy |
| last 7 days | 4 | KPIs' prior-period leads (13.5 live, 13 marts) and the deltas on it |
| last 30 days | 17 | leads 0.5 short in BigQuery (44 vs 43.5), the 11-07 week's 0.5, and every leads, CPL and campaign line built on it; Indiana's 0.5 |
| last 90 days | 26 | leads 2.53 short (106 vs 103.47): September's weeks 37 and 38, one each; the same lines downstream |
| LinkedIn (all ranges) | 5 | a few cents of spend on one ad, and one Q2 ad named differently. Not in C1 |

**Every Google Ads MISMATCH is conversions (leads), except Q2's geo.** Spend, clicks and
impressions agree on every rolling range and October. October and Q2 are line for line A6's
"prod" baseline on 2026-11-12 (data-warehouse `docs/notes/2026-11-12-googleads-dbt-parity.md`):
4 and 12, the same lines. A6 showed that with Renaissance switched to the connector in a dev build,
October's 4 and Q2's 4 Missouri lines clear and the switch adds none. Q2's 8 Florida/Georgia lines
remain in every warehouse copy. The rolling ranges are the same classes plus days still settling.
This run did not repeat A6's dev-build comparison: the connector-backed marts are not in prod yet.

**Flagged rather than asserted:** the 20 s BigQuery job cap and the latency of the fallback that
follows it (Finding 6) were read, not triggered. Nothing here exercised a real BigQuery outage.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE
(code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `lib/bq/client.ts:19` | A malformed `BQ_READER_KEY` put fragments of the key into the runtime log: `getBq` rethrew `JSON.parse`'s error, which quotes the text around the fault, and `logBqFallback` logs that message on every call. **Fixed in `cd0d1c3f`**, with a test. |
| 2 | ● | CONFIRMED | warehouse `connector_switch` (empty); `lib/bq/googleads.ts:14` | Prod's marts are still Supermetrics' stored copy, which stops refreshing after 35 days. Turned on before X1, Renaissance's lead counts drop on any range reaching further back: 90-day leads 103.47 instead of 106, September 37.97 instead of 39.97. **Decide: flip after X1.** |
| 3 | ○ | CONFIRMED | `lib/bq/freshness.ts:20`, `googleads.ts:89` | `bq_fallback` can never stay near 0, so C1's done test cannot be met as written. This Week, This Month, This Quarter and Year to Date end today, which no mart holds, and Year to Date and Last Year start before 2026-04-01: each falls back on every render, one line per `awQuery` call (fourteen per Paid Search render). Rolling ranges also fall back each day from 00:00 UTC until the 08:00 nightly lands (plus up to an hour of freshness cache). All of it serves live, correctly. **Count `reason=error` only.** |
| 4 | ○ | CONFIRMED | `lib/bq/backend.ts:11` | Nothing records a successful BigQuery read, so a week of zero `reason=error` cannot be told apart from the switch never engaging (`DATA_BACKEND_GOOGLEADS=BQ` is not `bq`). **Verify once after the flip** in BigQuery's job history (§5). |
| 5 | ○ | CONFIRMED | `lib/paid-search/base.ts:19`, `lib/linkedin/base.ts:37` | `useBq` read as a React hook, adding two `react-hooks/rules-of-hooks` lint errors. **Fixed in `92bbd8cb`** (renamed `bqEnabled`). |
| 6 | ○ | PLAUSIBLE | `lib/bq/client.ts:38` | A BigQuery job that hangs runs to its 20 s cap, then the Supermetrics fallback starts with its own 15 s cap and retries: one section can take 35 s or more before it renders. |
| 7 | ○ | PLAUSIBLE | `googleads.ts:61`, `linkedin.ts:62` | The account id is compared as text with `ACCOUNT_ID`. A client whose stored id is formatted differently (dashes, say) gets zero rows, served as real zeros rather than a fallback. Renaissance is proven by the shadow compare; a second client is not. |

---

## 4. Detail

### Finding 1: the reader key could reach the log

**Mechanism.** `getBq` decoded `BQ_READER_KEY` and called `JSON.parse` with no guard. V8's parse
errors quote up to about ten characters either side of the fault (`..."ate_key": SECRETVALU"...`).
That error propagates out of `readAwMart`, `awQuery` catches it, and `logBqFallback` writes
`err.message.slice(0, 300)` as `detail`. A key pasted into Vercel unencoded, truncated, or with a
stray character would have logged fragments on every Paid Search render. `getBq` caches nothing on
failure, so the same thing happens on every call. The value in Vercel (H12) has not been read; this
is about any future mis-set value.

**Fix (landed, `cd0d1c3f`).** Catch the parse error and throw a fixed message:
`BQ_READER_KEY is not base64 service-account JSON`. Test `getBq refuses a malformed BQ_READER_KEY
without quoting any of it` asserts the message names the variable and contains none of the key.

### Finding 2: what Renaissance sees if the flag goes on before X1

**Mechanism.** Supermetrics' nightly load into the warehouse refreshes the last 35 days. Google
keeps attributing conversions to a click date for longer than that, so a day older than 35 days in
the marts keeps the count it had then. Live Supermetrics asks Google afresh each time. So on any
range that reaches further back than 35 days, the marts show fewer leads than the dashboard does
today: in the shadow run September has 37.97 against 39.97, and the 90-day total 103.47 against 106.
Within 35 days the gap is days still settling (0.5 on 11-07). A6 showed the connector's own pull
carries the refreshed values: in its dev build, October's prior-period lines match.

**Suggested order.** Land X1 (Renaissance's `connector_switch` row, with the connector running
daily first, per A6), confirm the marts with one more shadow run, then set
`DATA_BACKEND_GOOGLEADS=bq`. If the flip has to come first for the licence date, Renaissance's
leads on 90-day and older ranges read up to about 2.5 lower until X1, and October-style
prior-period deltas shift by a few points. That is a client-visible change, so it is Paul's and
Thomas's call, not the code's.

### Finding 3: the fallback count is not a health signal on its own

**Mechanism.** `assertCovers` (`freshness.ts:17`) refuses any range ending after the mart's newest
day. Marts end at yesterday after the 08:00 UTC nightly, and `resolveDateRange` ends four presets
on today (`date-range.ts:70`, `:76`, `:82`, `:89`), all offered by the report picker
(`date-range-picker.tsx:32-40`). Year to Date and Last Year also start before 2026-04-01. Each
refusal is logged, and Paid Search issues fourteen `awQuery` calls per render (six fetchers), so one viewer
on This Month logs up to fourteen lines per render, all day. The rolling ranges add a daily window:
from 00:00 UTC (when "yesterday" moves) until the nightly lands and the hour-long freshness cache
expires, every range ending yesterday falls back. One more consequence: on This Month the current
period is live and its prior period comes from the marts, so a tile's delta mixes the two sources.

**Suggested fix.** No code change for C1. Define the acceptance count as
`event=bq_fallback AND source=googleads AND reason=error`. Expect steady `stale` and `unsupported`
lines. If the fallback volume itself becomes noise, log `stale` and `unsupported` at most once per
range and hour, as a separate PR.

### Finding 4: no proof the switch engaged

**Mechanism.** `bqEnabled` compares with `=== 'bq'`, and success is silent. A typo, a capital, or
the variable set on Preview instead of Production all produce the same logs as a perfect week.

**Suggested check, no code.** Once, after the flip, as Paul (who can read job history):

```sql
select creation_time, statement_type, total_bytes_processed
from `avenue-z-data-warehouse-prod`.`region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
where user_email = 'dashboard-reader@avenue-z-data-warehouse-prod.iam.gserviceaccount.com'
  and creation_time > timestamp_sub(current_timestamp(), interval 1 day)
order by creation_time desc
limit 20
```

Rows after opening Renaissance's Paid Search page on Last 30 Days mean BigQuery is serving it.

### Finding 6: latency on the failure path

**Mechanism.** `jobTimeoutMs: 20_000` bounds the BigQuery job. If it hits the cap, `awQuery` then
starts the Supermetrics call, with its own 15 s request cap and retries. Read, not triggered.

**Suggested fix.** Lower the BigQuery cap (the marts answer in about a second) or skip BigQuery for
the rest of the hour after an `error`. Separate PR, after a week of real latency.

### Finding 7: an account id in another format reads as zero

**Mechanism.** `where cast(ACCOUNT_ID as string) = @account` with the id from the client row. A
mismatch is not an error, so nothing falls back and nothing is logged: the section renders zeros.

**Suggested fix.** Before adding a second slug to `BQ_CLIENTS`, run the shadow compare for it (which
would show every line as MISMATCH). Optionally treat "no rows at all for the account in the range"
as `unsupported` in code.

---

## 5. Follow-ups

**Decide before the flip (blocks C1's "done", not the merge):**
- Finding 2: flip `DATA_BACKEND_GOOGLEADS=bq` after X1 lands for Renaissance, or accept lower lead
  counts on older ranges until it does. Recommended: after X1, with one more shadow run in between.
- Finding 3: C1's acceptance count is `reason=error` for `googleads`, not every `bq_fallback`.
- Finding 4: run the job-history query once after the flip.

**Before a second client:** Finding 7 (shadow compare per client).

**Cleanup, later:** Finding 6 (latency on the failure path).

**Closed on the branch:** Findings 1 (`cd0d1c3f`) and 5 (`92bbd8cb`).

**LinkedIn:** stays on Supermetrics until `DATA_BACKEND_LINKEDIN=bq`, which waits on E2 and A14 and
on its own shadow run against connector data. Today's LinkedIn marts differ from live by a few
cents on one ad; that run will decide whether it matters.
