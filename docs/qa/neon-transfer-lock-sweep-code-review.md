# Lock sweep window and cached lock reads (Neon network transfer) — Code Review Record

**Scope.** PR #407, branch `fix/neon-transfer-lock-sweep`, diff range `651cd21e^..c6edad3b` (three commits: `651cd21e` the fix, `0c0de4a2` and `c6edad3b` the review fixes). Five files: `lib/organic-social/lock-sweep.ts` and its spec, `lib/organic-social/response-lock-store.ts` and its spec, and the locked-months follow-ups in `CLAUDE.md`. No unrelated code.

**This document changes no code.** Unlike most records, every finding marked fixed below was fixed on the feature branch before this record was written; the commit is named in each. What is still open is in §5.

Reviewer: Thomas (@thomaschang-avez), review on #407, 2026-10-21. Drafted from that review, the automated security review on `651cd21e`, and the implementer's checks, for Thomas to confirm or amend.

Origin: on 2026-10-21 prod's Neon project stopped serving with "You've used all of your monthly network transfer allowance for this project" (Free plan, about 5 GB a month). It had never happened before October.

---

## 1. How it works

### 1.1 Why the transfer ran out

Lock every number (#256) stores each Dash answer of a locked month in `dash_response_locks` as JSONB and serves it from there. Two things combined:

- **The lock sweep never stopped.** `/api/lock-sweep` (cron `0 * * * *`) rendered every Organic Social tab of the two newest locked months on every run, all month, not only around a lock day. `lockSweepUrls` checked only that a month had locked, never whether it was already captured.
- **Every lock read pulled the whole answer from Neon, uncached.** `readLock` was a plain select of `response`, and a locked read also reads the prior month's answer for the compare baseline (`locking-client.ts`, `priorParams`). Neon counts every byte it sends to the app as network transfer.

Measured against prod (`octet_length(response::text)` per `period_end`, which is what goes over the wire; `pg_column_size` understates it because JSONB is stored compressed):

| period_end | locks | sent size | largest |
|---|---|---|---|
| 2026-09-30 | 80 | 3.0 MB | 1.3 MB |
| 2026-08-31 | 80 | 3.0 MB | 1.4 MB |
| 2026-07-31 | 25 | 0.5 MB | 134 kB |

From Oct 5 (September's lock day) a run swept September and August, about 3.0 + 3.0 (Sep, plus Aug as its baseline) + 3.0 + 0.5 (Aug, plus Jul as its baseline) = **about 9.5 MB a run**, 24 runs a day. Oct 1–4 swept July and August at about 4 MB a run. That is about **4.3 GB by Oct 21 from the sweep alone**, before page views, the health sweep and cache warming. The first stored lock is from 2026-09-24, the day after the sweep's cron reached prod, so October was the first full month with it running.

### 1.2 The sweep window

`lockSweepUrls` (`lock-sweep.ts:27-28`) now keeps a month only while `today <= lockOn(month) + SWEEP_DAYS`, with `SWEEP_DAYS = 2` (`:14`). `lockOn` is the same function `settledThrough` uses: the month's lock day, moved to the Friday before a weekend and never after the opening day (`lock-day.ts:20-27`). So a month is swept for three days, from its lock day through two days after; the two extra days retry anything Dash failed to return on the day itself. After that the sweep does nothing for that client until the next month locks.

The route computes `today` with `clockFor` (`/api/lock-sweep/route.ts:33`), the same New York date the lock day is defined in, so the window can't shift at midnight UTC.

In practice only the newest locked month is ever swept: the month before it locked about a month earlier and is always past its window. The `[prevKey(newest), newest]` shape is kept so the filter stays one rule.

A month still missing captures when its window closes is captured on the next view and logged as a late lock, the existing path for any request first made after the lock day.

### 1.3 Cached lock reads

`readLock` (`response-lock-store.ts:24-28`) now does two reads:

1. **An uncached id lookup:** `SELECT id … WHERE client_id = $1 AND request_key = $2 LIMIT 1`. A few bytes. No row means `null`, and nothing is cached.
2. **The answer, cached by that id:** `cachedSelectResponse(id)` (`:22`) goes through the repo's `cached()` wrapper (`lib/cache.ts`) as vendor `neon`, fn `dashResponseLock`, version `v2`, 24 h TTL. `cached()` prepends today's UTC date to the key, so entries also roll at midnight UTC: each answer is read from Neon at most about once a day.

Why keying by id makes a wrong answer from the cache very unlikely:

- `id` is `uuid … defaultRandom()` (`schema.ts:469`) and `(client_id, request_key)` is unique (`:476`), so an id identifies exactly one client's stored answer.
- A row's answer is never updated. An unlock deletes the rows, and the re-capture inserts a new row with a new id, so an old cache entry is never looked up again.
- A miss never reaches the cache, because only a found id is passed to `cachedSelectResponse`.

`writeLock` is unchanged; its read-back of a concurrent winner goes through `readLock`.

---

## 2. Verification method

**Next's cache behaviour was read in source (Next 16.3.8), not assumed.** Two facts shaped the design:

- `unstable-cache.js:193-197`: when a stale entry's background refresh throws, Next logs it and keeps returning the stale value. So "throw on a miss" would have made an unlocked row unremovable.
- `revalidate.js:119`: `revalidateTag` during a render throws. Captures happen during a render (the sweep self-fetches pages), so invalidating from `writeLock` is not possible. That rules out the tag-based fix the security review suggested.

**The cache engages in production** (Thomas). `unstable-cache.js:160` bypasses the cache when nested inside another `unstable_cache` or under `fetchCache: 'force-no-store'`. Every lock reader (`getPlatformHeadlines`, `getEngagementTrend`, `getFollowerGraph`, `getTopContent`, the outline fetchers) is wrapped only in React's `cache`, never in `cached()`, and no route sets `fetchCache`, `dynamic` or `revalidate`. The condition at `:160` was re-read for this record.

**Tests**, with the cache mocked as a never-expiring Map so each one shows which reads it absorbs:

- `lock-sweep.test.ts:14`: on Oct 5 only September is swept, not August.
- `:27`: both edges of the window: lock day minus one out, lock day through +2 in, +3 out.
- `:38`: a Saturday lock day (2026-12-05) starts the window on Friday 12-04 and ends it on 12-06.
- `response-lock-store.test.ts:48`: three reads of one stored answer pull `response` from Neon once.
- `:55`: a miss is not cached, and the answer captured right after it is cached from its first read.
- `:65`: after a delete the read is `null` (asserted at `:68`), and the re-capture under a new id is served fresh.
- `:74`: `CACHE_DISABLE=1` bypasses the cache.

Each behaviour test above failed against the code before its change. Two tests in `651cd21e` (a per-client cache key, and a cached miss re-checked against Neon) passed from the start, because they guarded behaviour that change had to keep; `0c0de4a2` replaced them with `:55` and `:65`, which fail against `651cd21e`.

Full suite at `c6edad3b`: 343 files, 3765 tests passed; `tsc --noEmit`, eslint on the changed files and `check:rsc` clean.

**Not verified:** nothing in this diff has run on a deployment. Two things only show there: that Vercel's data cache absorbs the repeat reads (the real proof is Neon's transfer graph flattening), and that a manually deleted lock is re-captured on the next view.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `response-lock-store.ts` at `651cd21e` | The first version cached a miss as `null` for a day. The first read of every lock is a miss, so the answer captured right after it stayed uncached, re-read from Neon on every render, until the null expired: most of the lock day. **Fixed in `0c0de4a2`** (id lookup, answer cached by id). Raised by the automated security review. |
| 2 | ● | CONFIRMED | `response-lock-store.ts` at `651cd21e`, `CLAUDE.md` | The first version needed a manual Vercel Data Cache purge after an unlock, or the old numbers showed for up to 24 h. **Fixed in `0c0de4a2`**: a deleted row is gone on the next render, and the purge step was removed from CLAUDE.md. Raised by the automated security review. |
| 3 | ○ | CONFIRMED | `response-lock-store.ts:22` at `0c0de4a2` | The answer cache called `unstable_cache` directly, so `CACHE_DISABLE=1`, the documented escape for every cache, did not cover it, and lock reads wrote no PERF line. **Fixed in `c6edad3b`** (through `cached()`). Thomas. |
| 4 | ○ | CONFIRMED | `CLAUDE.md` | The unlock note cited `lib/db/schema.ts:421` for `dash_response_locks`; it is at `:468`. **Fixed in `c6edad3b`.** Thomas. |
| 5 | ○ | CONFIRMED | `response-lock-store.ts:22` | `healthCritical` is left at its default `true`; Thomas suggested `false`. Open: decide together (§4). |
| 6 | ○ | PLAUSIBLE | `response-lock-store.ts:24-27` | The id lookup still reaches Neon on every read, including every page view. A uuid per read against about 35 kB per answer before, so small, but unmeasured. |
| 7 | ● | PLAUSIBLE | `response-lock-store.ts:22` | Vercel's data cache rejects entries over 2 MB. An answer that large is not cached and falls back to a Neon read per render, as before this PR; it is never a wrong number. The largest today is 1.4 MB. |

Not a finding: Thomas's nit on `response-lock-store.test.ts:65` ("the deleted row half isn't asserted"). It is asserted at `:68`, between `row = null` and the re-capture; `:65` is the test's title. Replied on the PR.

---

## 4. Detail

### Finding 5: `healthCritical`

`lib/cache.ts` documents `healthCritical: false` as for "a fetch whose absence costs a garnish rather than a number", such as a compare window that only supplies a delta. It keeps the failure out of the health beacon's failed set, which `deriveStatus` reads as `down`.

A failed lock answer read is not a garnish. The locking client fails closed (`locking-client.ts`: a lock store failure throws, never falls back to live numbers), so on a platform tab the section shows its error card. That is down, and the health sweep should say so. Default kept for that reason.

One wrinkle supports Thomas's side: on Overview, `channelErrorPolicy` (`metrics.ts:66`) swallows the throw and drops the platform, an open CLAUDE.md follow-up. There the page renders with no error card, yet the beacon would still record a failure. The three October clients hide Overview, so nobody is exposed today.

**Suggested resolution.** Keep `true` unless the health sweep should treat a lock store outage as degraded rather than down; that is a call about what pages Slack, not about this code.

### Finding 6: the id lookup per read

Every locked read now costs one indexed select returning a uuid: a few hundred bytes with protocol overhead, against the full answer before. Thomas suggested watching transfer for a day or two after deploy. If it ever matters, the lookup itself could be cached briefly, but a short TTL there brings back finding 1's problem for the window it covers, so measure before changing anything.

### Finding 7: the 2 MB entry limit

The limit fails safe: Next logs that the entry could not be stored and the read goes to Neon, the old behaviour for that one answer. It becomes a cost problem only if many answers cross 2 MB. The largest answers are Top Content's post lists. Re-run the `octet_length` query from §1.1 if a client with heavier posting goes onto locked months.

---

## 5. Follow-ups

Tracked separately; none applied in this record.

**Needs a deployment first**
1. **On staging:** confirm that repeat renders of a locked month stop reading `response` from Neon (PERF lines with `fn: dashResponseLock`, `cached: true`), and that a deleted lock is re-captured on the next view. The second also answers the open question in CLAUDE.md's locked-months unlock entry.
2. **After prod deploy:** watch Neon's network transfer for a day or two (finding 6). The sweep's share should drop to the three days after each lock day.

**Decide together**
3. **Finding 5:** `healthCritical` for lock reads, Thomas and Paul.

**Watch**
4. **Finding 7:** the 2 MB entry limit, if a heavier client goes onto locked months.

**Blocking the ship:** none in this diff. CI's `checks / checks` SCA gate is red on every PR off `dev` because of GHSA-587h-7wmj-h5pm in vite; #408 bumps it, and #407 needs that merged to go green. This does not restore prod's Neon access this month: the allowance resets on the billing date unless the plan is upgraded.
