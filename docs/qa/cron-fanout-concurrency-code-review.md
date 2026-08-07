# Code Review Record — `fix/cron-fanout-concurrency` (PR #202)

**Feature under review:** PR #202 — `fix(cron): bound self-fetch fan-out to stop Function CPU / Neon spikes`
**Diff range reviewed:** `44a10ba^..1584035` (the two feature commits only — the
`origin/dev` merge commit `5d3f9f2` that follows is an integration merge, not
part of the reviewable change). No unrelated code is in scope.
**Reviewers:** Paul (Thomas's review waived for this PR — the change touches cron
scheduling and request-scheduling only, no client-facing site content).
**This document changes no code.** Fixes were applied on the feature branch as
follow-ups (commit `1584035`) and are recorded here with status.

Files in scope:

| File | Change |
|---|---|
| `lib/concurrency.ts` | new — `mapWithConcurrency()` bounded rolling window |
| `lib/concurrency.test.ts` | new — vitest suite for the helper |
| `app/api/cache-warm/route.ts` | swap unbounded `Promise.all` → bounded window |
| `app/api/health/sweep/route.ts` | swap unbounded `Promise.all` → bounded window |
| `vercel.json` | sweep `*/15` → `15,45` (stagger off `:30`, halve cadence) |
| `vitest.config.ts` | add `lib/concurrency.test.ts` to the CI include allowlist |

---

## §1 How it works

**The problem being fixed.** Two Vercel Cron routes self-fetch every
`client × enabledReport × surface` URL to warm the Next data cache
(`/api/cache-warm`) and to probe health (`/api/health/sweep`). Each self-fetched
URL is a *full server-side report render*, and every render fans out several
Neon queries (the `neon-http` driver issues one HTTP request per query). Both
routes previously did this with an **unbounded `Promise.all`**, so a run fired
~40 renders at once; at `:30` — the only minute both crons overlapped — that
doubled to ~80 concurrent renders, producing a burst of concurrent Neon HTTP
requests that spiked Vercel Function CPU Duration and tripped Neon errors. The
`*/15` sweep cadence is why the anomaly recurred.

**The mechanism of the fix.**

1. **`mapWithConcurrency(items, limit, fn)`** (`lib/concurrency.ts:16`) is a
   capped `Promise.all`: it starts `workers = max(1, min(limit, items.length))`
   rolling workers, each pulling the next index off a shared `let next` counter
   (`lib/concurrency.ts:23-30`) and writing its result to `results[i]`, so peak
   in-flight never exceeds `limit` and output stays in **input order**
   regardless of completion order. `limit` is clamped to ≥1 so a zero/negative
   value can't produce zero workers and deadlock. Empty input returns `[]`
   immediately (the lone worker's `while` exits at once). Because JS is
   single-threaded, `const i = next++` is race-free.

2. Both routes build their URL/unit list exactly as before, then schedule it
   through the window at `CONCURRENCY = 8`
   (`app/api/cache-warm/route.ts:121`, `app/api/health/sweep/route.ts:84`)
   instead of `Promise.all`. Peak concurrent renders drop from ~40/run (~80 at
   the collision) to 8. No metric or output changes — only the *scheduling* of
   the same self-fetches. `cache-warm` returns the same `{total, ok, failed,
   durationMs, results}`; `sweep` derives the same per-unit statuses and posts
   the same transitions to Slack.

3. **`vercel.json`** moves the sweep from `*/15 * * * *` to `15,45 * * * *`,
   which both staggers it off cache-warm's `30 * * * *` (killing the `:30`
   collision outright) and halves the sweep cadence.

**Where the numbers come from (client-facing answerability).** Nothing in this
change computes a client-visible metric. `CONCURRENCY = 8` is an operational
tuning constant: wall time ≈ `ceil(units / 8) × render`, which at ~40 units and
a pessimistic ~10s cold render is ~50s, under the 60s `maxDuration`. The
detection-latency figure quoted to stakeholders (down transitions now surface in
up to ~30 min vs ~15) is a direct consequence of the halved sweep cadence in
`vercel.json`.

---

## §2 Verification method

- **Ordering / peak / clamp / empty / rejection / index** of
  `mapWithConcurrency` — executed as assertions in `lib/concurrency.test.ts`
  (7 cases), run under `npx vitest run` **and** confirmed to now be gated by CI
  (see finding #2). Peak-≤-limit is proven by an active-counter probe, not read.
- **The load-bearing safety property** (the `Promise.all`-style rejection path
  is never triggered by the current callers) — verified statically by reading
  both callers: `warmOne` (`app/api/cache-warm/route.ts:53-75`) and `probe`
  (`app/api/health/sweep/route.ts:41-49`) each wrap their body in `try/catch`
  and **return a result object** rather than throwing, so `fn` passed to
  `mapWithConcurrency` cannot reject. Confirmed at the stated lines, not assumed.
- **Type + full suite** — `npx tsc --noEmit` clean; `npx vitest run` 567/567
  pass on the integrated branch (includes the 7 new concurrency cases).
- **Cron cadence** — `vercel.json` confirmed to hold `cache-warm 30 * * * *` and
  `health/sweep 15,45 * * * *`; the two no longer share a minute.
- **Not verified in-tree (flagged, not asserted):** the actual post-deploy
  Vercel p95 duration and Neon error-rate flattening — these need a live deploy
  and are the open validation item for `CONCURRENCY = 8` (see §5).

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `vercel.json` | Halving the sweep cadence doubles worst-case health-down detection latency (~15→~30 min) — a product tradeoff not originally called out. |
| 2 | ○ | CONFIRMED | `vitest.config.ts` | `lib/concurrency.test.ts` was a manual `tsx` script outside the CI include allowlist, so a future regression in this load-bearing util would not be caught by the CI gate. |
| 3 | ○ | CONFIRMED | `lib/concurrency.ts:13` | Docstring documented rejection propagation but not that in-flight siblings are **not** cancelled on rejection (a surprise for a future caller). |
| 4 | ○ | CONFIRMED | `route.ts` ×2 | `CONCURRENCY = 8` is duplicated in both routes and must stay conceptually in sync. |
| 5 | ● | CONFIRMED | `route.ts` ×2 | Safety property: neither caller can reject, so the helper's rejection path is never exercised by current callers — the whole swap rests on this. Verified, not assumed. |

---

## §4 Detail

**#1 — Detection-latency tradeoff (`vercel.json`).**
Mechanism: sweep moved `*/15` → `15,45`, so a down transition is observed at most
once per 30 min instead of once per 15. *Resolution:* accepted as a conscious
product call — the halved cadence also halves sweep load, and a stagger-only
schedule (`5,20,35,50`) was considered and rejected. Documented in the PR body
with an explicit stakeholder flag; reversible in one line if detection latency
later outweighs the load saving.

**#2 — Test not gated by CI (`vitest.config.ts`).**
Mechanism: `vitest.config.ts` uses an explicit `include` allowlist; the util's
test file was not in it, matching the pre-existing `tsx`-script precedent but
leaving this safety util ungated. *Fix applied (`1584035`):* converted the file
to a vitest `describe/test/expect` suite and added `'lib/concurrency.test.ts'`
to the allowlist. `npx vitest run` now covers the 7 cases (488→495 pre-merge;
567 on the integrated branch).

**#3 — Non-cancellation caveat (`lib/concurrency.ts`).**
Mechanism: on rejection the outer `Promise.all` settles but sibling workers keep
pulling and running (no cancellation), and a second rejection would surface as an
unhandled rejection — identical to raw `Promise.all`. *Fix applied (`1584035`):*
added a docstring note stating siblings are not cancelled on rejection and that
current callers can't reject.

**#4 — Duplicated constant (`route.ts` ×2).**
Mechanism: each route declares its own `const CONCURRENCY = 8` with its own
tradeoff comment. *Resolution:* left as-is per review — each route documents its
own ceiling; flagged in the PR body that the two must stay in sync. Not worth a
shared export for two call sites.

**#5 — Safety property (`route.ts` ×2).**
Mechanism: `warmOne`/`probe` each `try/catch` internally and return a result
object, so `fn` never rejects and `mapWithConcurrency`'s `Promise.all`-style
rejection path is dead code for current callers — meaning the swap introduces no
change to failure handling. *Resolution:* verified at
`app/api/cache-warm/route.ts:53-75` and `app/api/health/sweep/route.ts:41-49`;
stated in the PR body as verified rather than assumed.

---

## §5 Follow-ups

**Needs a live call first (highest-value, blocks locking the constant):**
- Validate `CONCURRENCY = 8` against real post-deploy metrics — Vercel Functions
  p95 duration for both routes (should sit well under 60s; watch for timeouts at
  `:15`/`:45`) and Neon error/connection-limit rate around `:15`/`:30`/`:45`
  (should flatten). Raise the constant if duration creeps up as the client list
  grows; lower it if Neon still strains. One-line change per route.

**Decide together (deferred, not blocking):**
- Whether to keep the halved sweep cadence or revert to 15-min detection with a
  stagger-only schedule, once the load reduction is observed in production.

**Cleanup (optional, low value):**
- If a third caller of `mapWithConcurrency` appears, extract `CONCURRENCY` to a
  shared constant rather than a third copy.

**Applied in the feature branch, not this doc:** findings #2 and #3 (commit
`1584035`).
