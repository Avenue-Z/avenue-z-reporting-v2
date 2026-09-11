# Supermetrics transient-failure retry and total-outage caching — Code Review Record

**Scope.** PR #224, branch `fix/supermetrics-transient-retry`, diff range `e0c6a12^..e0c6a12` (one commit). Five files: `lib/supermetrics/client.ts` and a new spec for it, `lib/salesforce/pipeline.ts` and two tests added to its orchestration spec, and a one-line pin in `vitest.config.ts`. No unrelated code.

**This document changes no code.** Every fix it names is tracked in §5 as a follow-up.

Origin: staging rendered Executive Overview with all four Pipeline Performance tiles dashed on 2026-08-26, while the same code returned complete data locally and on preview. This PR addresses the two defects that turned a transient fault into an hour of wrong page.

---

## 1. How it works

### 1.1 The failure this responds to

Staging's runtime log for the affected deployment carried:

```
[TypeError: fetch failed] { [cause]: Error: write ETIMEDOUT, errno: -110, code: 'ETIMEDOUT', syscall: 'write' }
```

A socket-level timeout on an outbound request: the process could not complete a write to the upstream host. It was observed on the Peec fetch, which is the honest limit of the evidence — the Salesforce lines had aged out of retention by the time it was captured. What makes it the operative explanation is that it is **indiscriminate**: it takes down whatever is in flight. The four pipeline queries include two spanning an 18-year window with a 60s ceiling and two spanning a year or less with a 15s ceiling, and all four failed together. No per-query timeout theory accounts for the fast ones dying alongside the slow ones; a simultaneous transport fault does.

### 1.2 Defect one: only HTTP 429 was retried

`call()` in `lib/supermetrics/client.ts` retried 429 up to three attempts honouring `Retry-After` (`:73`), and converted an abort into `SmTimeoutError` (`:84`). Every other rejection propagated on the first attempt. One blip therefore killed every query in flight.

Transient failures now retry with exponential backoff: `MAX_NETWORK_RETRIES = 2` over three total attempts (`:34`), `RETRY_DELAY_MS = 500` doubling per attempt (`:35`, `:93`). Recognition is by error code against `TRANSIENT_CODES` (`:37`) — `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `EAI_AGAIN`, `UND_ERR_SOCKET`, `UND_ERR_CONNECT_TIMEOUT` — read from `e.code` **or** `e.cause.code`, since Node reports the reason on the cause. Failing both, the wrapper shape itself is the signal: `TypeError` whose message is exactly `fetch failed` (`:51-59`, the check itself at `:58`).

Two exclusions, both deliberate:

- **An abort is never retried** (`:52`). The 60s guard on the wide queries exists to bound them; retrying it would turn it into three minutes and blow the page's function budget.
- **A 4xx or 5xx is never retried.** Those throw `SmQueryError` before reaching the catch, and they are an answer from the API rather than a transport fault.

Each retry re-enters `call()`, which arms a fresh `AbortController` and timer, so an attempt gets the full timeout rather than a shrinking slice of the first one's. The original timer is cleared explicitly before the backoff `await` (`:92`), because `finally` has not yet run while control is still inside the catch block.

### 1.3 Defect two: a total outage was stored as a result

`getSalesforcePipelineImpl` catches each of its four queries individually and returns a `PipelineData` carrying `openUnavailable` / `wonUnavailable` flags. When **every** query failed, that object was still a fulfilled promise, and `cached()` stores fulfilled promises. A fault lasting seconds was therefore written into the data cache and replayed for the full hour of the TTL.

It now throws when all three primary fetches return null (`pipeline.ts:319-320`). `wonPriorRows` is deliberately excluded from the condition: it is the compare fetch, it is null whenever no compare window resolved at all, and its absence costs only a delta.

Degrade-not-fail is unchanged whenever **any** query returns data, which is the case that contract exists to protect. The reader loses nothing in the total case: `index.tsx` already renders a thrown pipeline as "Couldn't load pipeline data." for a configured client, which is the same message four dashed tiles were carrying, stated once instead of four times.

---

## 2. Verification method

Findings were probed, not read.

**The load-bearing cache assumption was checked in Next's source, not assumed.** The fix rests on "a rejected callback stores nothing". In `node_modules/next/dist/server/web/spec-extension/unstable-cache.js`, both cold paths run `const result = await workUnitAsyncStorage.run(innerCacheStore, cb, ...args)` (`:203`, `:245`) and only then call `cacheNewResult(...)` (`:211`, `:249`). `cacheNewResult` is the sole caller of `incrementalCache.set` (`:18`). A rejection at that `await` skips it. Confirmed.

**The stale-while-revalidate path was read in the same file**, and it materially qualifies the fix — see finding 2. `:173-181` runs the callback, and on rejection logs `revalidating cache with key: …` and returns the **stale** cached value. That is the same message observed live on staging, which is how the SWR behaviour was identified rather than inferred.

**The two exclusions were pinned before they were needed.** The abort-not-retried and 4xx-not-retried tests were written alongside the others and passed *before* the retry existed. They pin pre-existing behaviour rather than describe new behaviour, which is the only way to know the retry did not quietly widen its own scope.

**Retry counts are asserted, not implied.** The bounded test counts fetch invocations (`calls` is 3, not "eventually rejects"), so a regression that retried forever or not at all fails distinctly.

**The legacy spec was run.** `lib/supermetrics/client.test.ts` is a `node:assert` script and is *not* in the vitest include list, so a full `vitest run` does not cover it. It exercises the 429 and abort paths this PR touches. Run directly: prints `ok`.

**Live, against the real account:** `getSalesforcePipelineImpl('renaissance')` with `CACHE_DISABLE=1` returned in 44.8s with every degrade flag false, 3,968 open deals, $164.6M pipeline, $31.3M closed won, 36 owners.

**Not verified:** the retry has not been observed firing against a real socket failure. The failure mode is reproduced only in tests, from a synthesised error matching the shape staging logged. Nothing in this diff has run through an actual `ETIMEDOUT` in production.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | Next `unstable-cache.js:173-181` | The self-healing claim holds **only when no cache entry exists**. If a stale entry is present, the throw lands in Next's SWR `.catch`, which logs and returns the stale value. The reader sees the old data, not "Couldn't load", and nothing is cleared. This PR therefore does **not** clear staging's existing poisoned entry. |
| 2 | ● | PLAUSIBLE | `client.ts:34`, `:87-94` | Worst case for a wide query is 3 attempts × 60s = 180s, which exceeds the report route's function ceiling. Socket errors usually fail fast, so this needs a slow-failing transport fault to reach, but nothing in the code bounds total elapsed time. |
| 3 | ○ | CONFIRMED | `client.ts:73-79`, `:87-94` | The 429 retry and the network retry share one `attempt` counter. A request that takes one 429 and then hits a socket error gets fewer network retries than one that did not, for no stated reason. |
| 4 | ○ | CONFIRMED | `client.ts:87-94` | Retrying the submit `POST` starts a **new** Supermetrics query each attempt. Up to three schedules can be created for one logical query, with the first two abandoned rather than cancelled. |
| 5 | ○ | CONFIRMED | `pipeline.ts:320` | The thrown error says only `every Salesforce query failed for ${slug}`. The four underlying causes were logged separately a moment earlier but are not attached, so whatever surfaces the throw cannot say why. |
| 6 | ○ | CONFIRMED | `pipeline.ts:355-356` | Still no cache **tag**. `extractTags: byClient` labels PERF log lines; it is not `options.tags`, so `revalidateTag` cannot reach these entries. This is precisely why there was no lever to clear the bad entry during the incident, and this PR does not add one. |
| 7 | ○ | PLAUSIBLE | `client.ts:58` | Any `TypeError: fetch failed` is treated as transient, including a genuinely unreachable host. A permanently dead endpoint now costs 1.5s of backoff before failing, rather than failing immediately. |

---

## 4. Detail

### Finding 1: throwing does not clear an existing entry

This is the most consequential thing in this document, because it narrows what the PR actually achieves.

Next's SWR path (`unstable-cache.js:173-181`):

```js
.catch((err) => {
  console.error(`revalidating cache with key: ${invocationKey}`, err)
  return cachedResponse   // the stale value
})
```

So with a stale entry present, a background revalidation that throws is swallowed, the message is logged, and the reader receives the **stale** value. Three consequences:

1. **Staging's current dashed tiles are not fixed by this PR.** That entry exists. It will be replaced only when a revalidation *succeeds*, or when it is evicted or purged.
2. The fix's real scope is narrower and still worth having: it stops a *new* bad entry being written on a cold cache, and the retry makes the underlying failure much less likely.
3. It is arguably better than the alternative for readers — during a total outage with a healthy entry present, they keep seeing good data instead of an error. That is a defensible outcome, but it is not what the commit message claims.

**Suggested fix.** Correct the claim in the PR description and commit message. Optionally pair the throw with finding 6's cache tag so there is a lever to clear a poisoned entry deliberately.

### Finding 2: unbounded total retry time

`MAX_NETWORK_RETRIES = 2` bounds attempt *count*, and each attempt re-arms the full `timeoutMs`. For the two wide queries that is 60s each, so 180s plus backoff in the worst case, against a page route that declares no `maxDuration` and therefore runs on the platform default.

Reaching it requires a transport fault that fails slowly rather than immediately — a write that hangs until the guard fires, three times running. `ETIMEDOUT` on write is exactly that shape, which is uncomfortable given that is the error we observed.

**Suggested fix.** Allow only one retry when `timeoutMs` exceeds the default, or track elapsed time across attempts and stop once it passes a ceiling. The first is two lines and covers the case that matters.

### Finding 3: shared retry budget

`attempt` is incremented by both the 429 branch and the network branch, and both compare against their own limit. The budgets are therefore coupled: a 429 consumes network-retry headroom. No behaviour depends on that coupling and no test pins it; it is an artefact of reusing the parameter.

**Suggested fix.** Track the two independently, or state in a comment that a shared budget is intended.

### Finding 4: abandoned schedules on retry

The submit is a `POST` that creates a Supermetrics schedule. A retry creates another. The abandoned ones are not cancelled and, for a large query, may run to completion server-side.

Whether that matters depends on how Supermetrics meters queries, which is not something this codebase can determine. Worth knowing before the retry count is ever raised.

**Suggested fix.** None without vendor information. Do not raise `MAX_NETWORK_RETRIES` until it is understood.

### Finding 5: the thrown error drops the reason

Each of the four `.catch` blocks logs its own cause immediately before, so the information exists in the log stream. It is simply not on the error that propagates, which is the one thing an error boundary or a health probe can see.

**Suggested fix.** Attach the first captured cause via `{ cause }`, which costs one line and makes the throw self-describing.

---

## 5. Follow-ups

Tracked separately; none applied in this PR.

**Blocking accuracy, not the ship**
1. **Finding 1** — correct the self-healing claim in the PR body and commit message. The code is right; the description overstates what it does.

**Correctness, highest value first**
2. **Finding 2** — bound total retry time for the wide queries. This is the one that can take a page down rather than merely render it wrong.
3. **Finding 5** — attach the underlying cause to the thrown error.

**Decide together**
4. **Finding 6** — whether the Salesforce cache entries should carry a real tag, which would give an operational lever the incident showed we lack. Inert without a caller, so it needs a companion admin action or cron to be worth adding.
5. **Finding 4** — confirm how Supermetrics meters abandoned schedules before the retry count is ever raised.

**Cleanup**
6. **Finding 3** — decouple or document the shared retry budget.
7. **Finding 7** — accept the 1.5s cost on a permanently dead endpoint, or match on the cause code only.

**Blocking the ship:** none. Finding 1 blocks the *description* being accurate, which matters because the next person to read it will otherwise believe staging was fixed by this merge.
