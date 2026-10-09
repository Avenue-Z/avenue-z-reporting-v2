# AEO Outbound Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Ryan-only tool at Tools > New Business that generates a one-page AI Visibility Snapshot from a Peec pitch project in the exact AIVx design, lets him edit the copy on the page, approve it once, and share a frozen, revocable, no-login link.

**Architecture:** Pure library code in `lib/aeo-outbound/` (Peec client and pull, metrics, slots, rendering, Glean copy, grounding, storage). Thin route handlers in `app/api/aeo-outbound/` and `app/snapshot/[token]/`, server actions in `app/actions/aeo-outbound.ts`, and two staff pages under `app/tools/new-business/` with client components in `components/aeo-outbound/`. One new table. The report is a standalone HTML string, served by route handlers so the dashboard's root layout and CSS never touch it.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19.2.3, TypeScript strict, Drizzle 0.45 on Neon (`neon-http`), Vitest 3 (jsdom), Plotly.js 3.5.0 from CDN (inside the report only), Glean chat via `lib/glean.ts` exports, Peec Customer API v1.

**Spec:** `docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md` (branch `docs/aeo-outbound-audit-spec`). Read §3, §5, §5a, §6, §7, §7a, §8, §9, §9a, §10, §13, §14, §15 before any task.

## Global Constraints

- Every PR targets `aeo-outbound-audit` (the deliverable branch, cut from `dev` at `15b778de`), merges in order PR1 → PR2 → PR3 → PR4, and each one is cut from the deliverable branch **after** the previous PR merged (no stacked PRs).
- Shared files may only receive the six append-only edits listed in spec §4: `lib/db/schema.ts`, `drizzle/0026_*` (+ meta), `MIGRATIONS-PENDING.md`, `.env.example`, `lib/constants.ts` `TEAMS`, `vitest.config.ts` include list. Nothing else outside new folders.
- Never edit `proxy.ts`, `auth.ts`, `lib/auth/*`, `lib/peec/*`, `lib/glean.ts`, `app/share/**`, `app/globals.css`, `components/layout/sidebar.tsx`, `package.json`.
- AIVx source of truth: `~/code/aivx-reports` at `ff18697` (read-only). CSS SHA-256 `2925c9bd76410aaa8e6ea832a7fd9e20d981efcb65fa68958545cf3b251c833e`; JS SHA-256 `6453e61c22b1b171d3c5f951f901e356087e0dd507e9951808332255183a9bb6` (both hashes are of the evaluated Python string literals, which is what AIVx ships; the evaluated JS appears verbatim in the reference report).
- Env names: `PEEC_AI_CUSTOMER_TOKEN`, `GLEAN_INSTANCE`, `GLEAN_API_TOKEN`, `AEO_OUTBOUND_USERS` (new, comma-separated `@avenuez.com` emails; unset = nobody).
- Peec base `https://api.peec.ai/customer/v1`, header `x-api-key`; every report call sends `project_id`, `start_date`, `end_date`; no model filter.
- The Plotly CDN tag carries `integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L"` (sha384 of `https://cdn.plot.ly/plotly-3.5.0.min.js`, measured 2026-10-08). Verify it in the browser check of Task 2.3 Step 9 (the charts must draw).
- Generation deadline 270 000 ms under `maxDuration = 300`; Peec 429: max 3 attempts, delay clamped 0-20 s; per-call timeout `min(45 s, time left)`; Glean second attempt only with ≥ 60 s left.
- Stale `generating` = older than 6 minutes.
- Slot values: trimmed, control characters removed, whitespace runs collapsed, 1-1000 characters (`lead` ≤ 80).
- No em dashes or en dashes in any user-facing copy or prompt.
- Test fixtures use synthetic data only (public repo).
- Run every slow command bounded: `perl -e 'alarm N; exec @ARGV' -- <cmd>`.

## Review Focus

1. **A Peec name or domain containing `<`, `"`, `&` or `</script>`** must render inert in text and figures (Task 2.3 test `renders hostile Peec names inert`).
2. **Glean returns valid JSON with wrong types or extra keys** (a number where text is expected, 4 bullets): treated as a shape failure, never saved (Task 1.5 test `rejects wrong shapes`).
3. **Two tabs editing the same draft**: the second save gets 409 and the editor stops and offers Reload; nothing is silently overwritten (Task 1.6 store test and Task 4.3 queue test).
4. **A project whose own brand has zero retrievals on its own site**: the strength bullet data says 0, not missing, and the own-retrieved % is `null` with a note (Task 1.4 test `own site with no rows`).
5. **Revoke while the recipient's page is open**: their next load is the 404 page because responses are `no-store` (Task 4.4 route test).

---

## Part 1 (PR1): data and storage

### Task 1.0: Branch and baseline

**Files:** none.

- [ ] **Step 1: Cut the branch**

```bash
cd ~/code/reporting-aeo-outbound-ryan
perl -e 'alarm 60; exec @ARGV' -- git fetch origin
git checkout -b feat/aeo-outbound-data origin/aeo-outbound-audit
```

- [ ] **Step 2: Install exactly the lockfile**

Run: `perl -e 'alarm 590; exec @ARGV' -- npm ci`
Expected: exit 0.

- [ ] **Step 3: Baseline**

Run: `perl -e 'alarm 590; exec @ARGV' -- npm run typecheck && perl -e 'alarm 590; exec @ARGV' -- npm test`
Expected: both pass on the untouched branch. If not, stop and report; do not build on a red baseline.

### Task 1.1: Decisions, permissions, token

**Files:**
- Create: `lib/aeo-outbound/config.ts`, `lib/aeo-outbound/permissions.ts`, `lib/aeo-outbound/token.ts`
- Test: `lib/aeo-outbound/permissions.test.ts`, `lib/aeo-outbound/token.test.ts`
- Modify: `vitest.config.ts` include list (append three globs)

**Interfaces:**
- Produces: `DECISIONS`, `PITCH_STATUSES`, `NEEDS_VALIDATION`, `GENERATION_DEADLINE_MS`, `STALE_GENERATING_MS`; `outboundUsers(env)`, `outboundEmail(user, env?) → string | null`, `originAllowed(origin, host) → boolean`; `newShareToken() → string`, `isShareTokenShape(t) → boolean`.

- [ ] **Step 1: Add the test globs** to `vitest.config.ts` `include` (after `'components/report-sections/**/*.test.{ts,tsx}',`):

```ts
      'lib/aeo-outbound/**/*.test.{ts,tsx}',
      'app/api/aeo-outbound/**/*.test.{ts,tsx}',
      'app/snapshot/**/*.test.{ts,tsx}',
      'components/aeo-outbound/**/*.test.{ts,tsx}',
```

- [ ] **Step 2: Write the failing tests**

`lib/aeo-outbound/permissions.test.ts`:
```ts
import { expect, test } from 'vitest'
import { originAllowed, outboundEmail, outboundUsers } from './permissions'

const LIST = 'ryan@avenuez.com, Other@AvenueZ.com'
test('the list is trimmed, lowercased and empty-safe', () => {
  expect([...outboundUsers(LIST)]).toEqual(['ryan@avenuez.com', 'other@avenuez.com'])
  expect(outboundUsers(undefined).size).toBe(0)
  expect(outboundUsers('').size).toBe(0)
})
test('only allowlisted staff get through', () => {
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: 'Ryan@avenuez.com' }, LIST)).toBe('ryan@avenuez.com')
  expect(outboundEmail({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, LIST)).toBeNull()
  expect(outboundEmail({ role: 'CLIENT_ADMIN', email: 'ryan@avenuez.com' }, LIST)).toBeNull()
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: 'ryan@gmail.com' }, 'ryan@gmail.com')).toBeNull()
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: null }, LIST)).toBeNull()
  expect(outboundEmail(null, LIST)).toBeNull()
})
test('unset list means nobody', () => {
  expect(outboundEmail({ role: 'INTERNAL_ADMIN', email: 'ryan@avenuez.com' }, undefined)).toBeNull()
})
test('origin check: absent passes, same host passes, anything else fails', () => {
  expect(originAllowed(null, 'app.example')).toBe(true)
  expect(originAllowed('https://app.example', 'app.example')).toBe(true)
  expect(originAllowed('https://evil.example', 'app.example')).toBe(false)
  expect(originAllowed('null', 'app.example')).toBe(false)
  expect(originAllowed('https://app.example', null)).toBe(false)
})
```

`lib/aeo-outbound/token.test.ts`:
```ts
import { expect, test } from 'vitest'
import { isShareTokenShape, newShareToken } from './token'

test('tokens are 24 url-safe characters and differ', () => {
  const a = newShareToken(), b = newShareToken()
  expect(isShareTokenShape(a)).toBe(true)
  expect(a).not.toBe(b)
})
test('shape check rejects anything else', () => {
  for (const t of ['', 'short', 'a'.repeat(25), 'abc/def'.padEnd(24, 'x'), '../'.padEnd(24, 'x')]) expect(isShareTokenShape(t)).toBe(false)
})
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run lib/aeo-outbound`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`lib/aeo-outbound/config.ts`:
```ts
// Ryan's answers to the spec's §13 questions (docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md).
// Each default is the spec's assumption. When he answers, change the value here and nowhere else.
export const DECISIONS = {
  /** Q1: titles of the two data sections, first (strengths) then second (gaps). */
  sectionTitles: ['Category data', 'Competitive visibility'] as readonly [string, string],
  /** Q3: Glean writes a more specific category instead of using Peec's `industry`. */
  writeSpecificCategory: false as boolean,
  /** Q5: how many of the three opportunities come from Peec actions when any exist. */
  peecOpportunityRows: 1 as number,
  /** Q6: the methodology states the prompt count and the models covered. */
  methodologyStatesPromptsAndModels: true as boolean,
  /** Q7: one fixed next-step sentence for every report, or null for one written per brand. */
  fixedNextStep: null as string | null,
  /** Q8: Approve stays disabled while any slot still says "Needs validation". */
  needsValidationBlocksApprove: true as boolean,
  /** Q9: only PITCH and PITCH_ENDED projects can be used. */
  pitchOnly: true as boolean,
  /** Q10: the sidebar wordmark reads "AIVx", as on AIVx reports. */
  showAivxName: true as boolean,
}
export const PITCH_STATUSES: readonly string[] = ['PITCH', 'PITCH_ENDED']
export const NEEDS_VALIDATION = 'Needs validation'
export const GENERATION_DEADLINE_MS = 270_000
export const STALE_GENERATING_MS = 6 * 60_000
```

`lib/aeo-outbound/permissions.ts`:
```ts
import { isAvenueZEmail } from '@/lib/commentary/permissions'
import { isStaff } from '@/lib/auth/route-access'

/** AEO_OUTBOUND_USERS parsed: trimmed, lowercased, blanks dropped. Unset or empty means nobody. */
export function outboundUsers(env: string | undefined): Set<string> {
  return new Set((env ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/** The caller's email when they are staff, @avenuez.com and on AEO_OUTBOUND_USERS; otherwise null. */
export function outboundEmail(
  user: { role?: string | null; email?: string | null } | null | undefined,
  env: string | undefined = process.env.AEO_OUTBOUND_USERS,
): string | null {
  if (!user || !isStaff({ role: user.role ?? null })) return null
  const email = user.email?.trim().toLowerCase()
  if (!email || !isAvenueZEmail(email)) return null
  return outboundUsers(env).has(email) ? email : null
}

/** Browser writes must come from this same host. No Origin header (server-to-server, curl) passes;
 *  the session check still applies. */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (origin === null) return true
  if (!host) return false
  try { return new URL(origin).host === host } catch { return false }
}
```

`lib/aeo-outbound/token.ts`:
```ts
import { randomBytes } from 'node:crypto'

/** 144 random bits, URL-safe: the same recipe as dashboard share links (app/actions/dashboard.ts:258). */
export const newShareToken = (): string => randomBytes(18).toString('base64url')
export const isShareTokenShape = (t: string): boolean => /^[A-Za-z0-9_-]{24}$/.test(t)
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run lib/aeo-outbound`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/aeo-outbound/config.ts lib/aeo-outbound/permissions.ts lib/aeo-outbound/permissions.test.ts lib/aeo-outbound/token.ts lib/aeo-outbound/token.test.ts
git commit -m "feat(aeo-outbound): decisions, allowlist, origin check and share token"
git push -u origin feat/aeo-outbound-data
```

### Task 1.2: Peec client

**Files:**
- Create: `lib/aeo-outbound/peec.ts`
- Test: `lib/aeo-outbound/peec.test.ts`

**Interfaces:**
- Produces: `class PeecClient(key, opts?: { fetch?, sleep?, now?, deadline? })` with `call(method, path, { params?, body? }) → Promise<unknown>` and `all<T>(method, path, base, naturalKey, limit) → Promise<T[]>`; `PeecError`; `retryDelayMs(header) → ms`; `rowsOf<T>(payload) → T[]`; `peecFromEnv(opts?)`; `MAX_ENDPOINT_ROWS = 250_000`.

- [ ] **Step 1: Write the failing tests** `lib/aeo-outbound/peec.test.ts`:

```ts
import { expect, test, vi } from 'vitest'
import { PeecClient, PeecError, retryDelayMs, rowsOf } from './peec'

const KEY = 'skc-test-key-123'
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

test('sends the key as x-api-key, never in the URL', async () => {
  const fetch = vi.fn(async () => json({ data: [] }))
  await new PeecClient(KEY, { fetch }).call('GET', '/projects', { params: { limit: 1 } })
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.peec.ai/customer/v1/projects?limit=1')
  expect(url).not.toContain(KEY)
  expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
})

test('retries a 429 up to 3 attempts, waiting the clamped reset', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': '999' }))
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': 'soon' }))
    .mockResolvedValueOnce(json({ data: [1] }))
  const sleep = vi.fn(async (_ms: number) => {})
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [1] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([20_000, 20_000])
})

test('a third 429 fails', async () => {
  const fetch = vi.fn(async () => json({}, 429, { 'X-RateLimit-Reset': '1' }))
  await expect(new PeecClient(KEY, { fetch, sleep: async () => {} }).call('GET', '/x')).rejects.toThrow('rate limited after 3 attempts')
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('a wait that would pass the deadline fails instead of sleeping', async () => {
  const fetch = vi.fn(async () => json({}, 429, { 'X-RateLimit-Reset': '20' }))
  const sleep = vi.fn(async (_ms: number) => {})
  const c = new PeecClient(KEY, { fetch, sleep, now: () => 0, deadline: 10_000 })
  await expect(c.call('GET', '/x')).rejects.toThrow('waiting would pass the deadline')
  expect(sleep).not.toHaveBeenCalled()
})

test('no call starts after the deadline', async () => {
  const fetch = vi.fn()
  await expect(new PeecClient(KEY, { fetch, now: () => 5, deadline: 5 }).call('GET', '/x')).rejects.toThrow('deadline reached')
  expect(fetch).not.toHaveBeenCalled()
})

test('errors never carry the key', async () => {
  const fetch = vi.fn(async () => new Response(`bad key ${KEY} and again ${KEY}`, { status: 401 }))
  const err = await new PeecClient(KEY, { fetch }).call('GET', '/x').catch((e) => e)
  expect(err).toBeInstanceOf(PeecError)
  expect(String(err.message)).toContain('HTTP 401')
  expect(String(err.message)).not.toContain(KEY)
})

test('non-JSON body is a named error', async () => {
  const fetch = vi.fn(async () => new Response('<html>', { status: 200 }))
  await expect(new PeecClient(KEY, { fetch }).call('GET', '/x')).rejects.toThrow('response was not JSON')
})

test('paging stops on the first empty page, not a short one', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []]
  const fetch = vi.fn(async () => json({ data: pages.shift() }))
  const rows = await new PeecClient(KEY, { fetch }).all<{ id: string }>('POST', '/reports/brands', { project_id: 'p' }, (r) => r.id, 2)
  expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  expect(fetch).toHaveBeenCalledTimes(3)
  const bodies = fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))
  expect(bodies.map((b) => b.offset)).toEqual([0, 2, 3])
})

test('a row repeated on a later page aborts the pull', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]]
  const fetch = vi.fn(async () => json({ data: pages.shift() ?? [] }))
  await expect(new PeecClient(KEY, { fetch }).all<{ id: string }>('GET', '/brands', {}, (r) => r.id, 2)).rejects.toThrow('repeats a row')
})

test('helpers', () => {
  expect(retryDelayMs(null)).toBe(20_000)
  expect(retryDelayMs('-5')).toBe(0)
  expect(retryDelayMs('7')).toBe(7_000)
  expect(rowsOf({ data: [1] })).toEqual([1])
  expect(rowsOf([2])).toEqual([2])
  expect(rowsOf({ nope: 1 })).toEqual([])
})

test('a call that hits its timeout is a named error', async () => {
  const fetch = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
  await expect(new PeecClient(KEY, { fetch }).call('GET', '/x')).rejects.toThrow('timed out after 45000ms')
})

test('paging past the row cap aborts', async () => {
  let n = 0
  const fetch = vi.fn(async () => json({ data: [{ id: `r${n++}` }, { id: `r${n++}` }] }))
  await expect(new PeecClient(KEY, { fetch, maxRows: 3 }).all<{ id: string }>('GET', '/x', {}, (r) => r.id, 2)).rejects.toThrow('more than 3 rows')
})

test('an empty key is refused up front', () => {
  expect(() => new PeecClient('')).toThrow('PEEC_AI_CUSTOMER_TOKEN is not set')
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/peec.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/aeo-outbound/peec.ts`:

```ts
// Peec Customer API client for the AEO Outbound Snapshot. Ported from AIVx (aivx-reports@ff18697
// lib/peec-client.ts:17-139 and agent/peec_api_export.py:106-198) with the retry numbers tightened
// to fit the 270s generation deadline (spec §7a). The key never reaches a message.
const BASE = 'https://api.peec.ai/customer/v1'
const MAX_ATTEMPTS = 3
const RETRY_MAX_SECONDS = 20
const CALL_TIMEOUT_MS = 45_000
export const MAX_ENDPOINT_ROWS = 250_000

export class PeecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PeecError'
  }
}

export interface PeecClientOptions {
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Epoch ms after which no call may start and no retry may wait. */
  deadline?: number
  /** Row cap per endpoint; tests lower it. */
  maxRows?: number
}
type Params = Record<string, string | number>

export function retryDelayMs(header: string | null): number {
  const raw = Number.parseInt(header ?? '', 10)
  const seconds = Number.isFinite(raw) ? raw : RETRY_MAX_SECONDS
  return Math.min(Math.max(seconds, 0), RETRY_MAX_SECONDS) * 1000
}

/** The API returns {data: [...]} or a bare array. */
export function rowsOf<T>(payload: unknown): T[] {
  const d = (payload as { data?: unknown } | null)?.data ?? payload
  return Array.isArray(d) ? (d as T[]) : []
}

export class PeecClient {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly deadline: number
  private readonly maxRows: number

  constructor(private readonly key: string, opts: PeecClientOptions = {}) {
    if (!key) throw new PeecError('PEEC_AI_CUSTOMER_TOKEN is not set')
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.now = opts.now ?? Date.now
    this.deadline = opts.deadline ?? Number.POSITIVE_INFINITY
    this.maxRows = opts.maxRows ?? MAX_ENDPOINT_ROWS
  }

  /** split/join so every occurrence goes (aivx lib/peec-client.ts:91-93). */
  private scrub(text: string): string {
    return (text ?? '').split(this.key).join('<redacted>')
  }

  async call(method: 'GET' | 'POST', path: string, opts: { params?: Params; body?: unknown } = {}): Promise<unknown> {
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, String(v))
    for (let attempt = 1; ; attempt++) {
      const left = this.deadline - this.now()
      if (left <= 0) throw new PeecError(`[PEEC API] ${path}: deadline reached`)
      const timeoutMs = Math.min(CALL_TIMEOUT_MS, left)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await this.fetchImpl(url.toString(), {
          method,
          headers: { 'x-api-key': this.key, 'Content-Type': 'application/json' },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
          cache: 'no-store',
        })
      } catch (e) {
        const err = e as Error
        if (err?.name === 'AbortError') throw new PeecError(`[PEEC API] ${path}: timed out after ${timeoutMs}ms`)
        throw new PeecError(`[PEEC API] ${path}: request failed (${this.scrub(err?.message ?? String(e)).slice(0, 200)})`)
      } finally {
        clearTimeout(timer)
      }
      if (res.status === 429) {
        if (attempt >= MAX_ATTEMPTS) throw new PeecError(`[PEEC API] ${path}: rate limited after ${MAX_ATTEMPTS} attempts`)
        const wait = retryDelayMs(res.headers.get('X-RateLimit-Reset'))
        if (wait >= this.deadline - this.now()) throw new PeecError(`[PEEC API] ${path}: rate limited, and waiting would pass the deadline`)
        await this.sleep(wait)
        continue
      }
      if (res.status >= 400) {
        const body = await res.text().catch(() => '')
        throw new PeecError(`[PEEC API] ${path}: HTTP ${res.status} (${this.scrub(body).slice(0, 200)})`)
      }
      try {
        return await res.json()
      } catch {
        throw new PeecError(`[PEEC API] ${path}: response was not JSON`)
      }
    }
  }

  /** Every row of a list (GET) or report (POST): limit/offset, stop on the first EMPTY page, abort when a
   *  later page repeats a natural key, abort past MAX_ENDPOINT_ROWS (aivx peec_api_export.py:106-198). */
  async all<T>(method: 'GET' | 'POST', path: string, base: Record<string, unknown>, naturalKey: (row: T) => string, limit: number): Promise<T[]> {
    const rows: T[] = []
    const seen = new Set<string>()
    for (;;) {
      const payload = method === 'GET'
        ? await this.call('GET', path, { params: { ...(base as Params), limit, offset: rows.length } })
        : await this.call('POST', path, { body: { ...base, limit, offset: rows.length } })
      const page = rowsOf<T>(payload)
      if (page.length === 0) return rows
      const keys = page.map(naturalKey)
      const repeated = keys.find((k) => seen.has(k))
      if (repeated !== undefined) {
        throw new PeecError(`[PEEC API] ${path}: the page at offset ${rows.length} repeats a row an earlier page returned (${repeated}), so rows may be missing`)
      }
      keys.forEach((k) => seen.add(k))
      rows.push(...page)
      if (rows.length > this.maxRows) throw new PeecError(`[PEEC API] ${path}: more than ${this.maxRows} rows, stopping`)
    }
  }
}

export function peecFromEnv(opts: PeecClientOptions = {}): PeecClient {
  return new PeecClient(process.env.PEEC_AI_CUSTOMER_TOKEN ?? '', opts)
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run lib/aeo-outbound/peec.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit and push**

```bash
git add lib/aeo-outbound/peec.ts lib/aeo-outbound/peec.test.ts
git commit -m "feat(aeo-outbound): Peec client ported from AIVx with the 270s budget"
git push
```

### Task 1.3: Peec pull (spec §7 steps 1-8)

**Files:**
- Create: `lib/aeo-outbound/pull.ts`
- Test: `lib/aeo-outbound/pull.test.ts`

**Interfaces:**
- Consumes: `PeecClient`, `PeecError` (Task 1.2); `DECISIONS`, `PITCH_STATUSES` (Task 1.1).
- Produces: types `PeecProject`, `RosterBrand`, `BrandReportRow`, `DomainRow`, `ActionRow`, `PeecPull`; `isUsableProject(p)`; `listProjects(client) → PeecProject[]` (usable only, sorted by name); `pullSnapshot(client, projectId, nowMs, onStep?) → PeecPull`.

- [ ] **Step 1: Write the failing test** `lib/aeo-outbound/pull.test.ts` with a fake Peec that routes by path:

```ts
import { expect, test } from 'vitest'
import { PeecClient } from './peec'
import { listProjects, pullSnapshot } from './pull'

type Route = (url: URL, body: Record<string, unknown> | null) => unknown
function fakePeec(routes: Record<string, Route>) {
  const seen: { path: string; body: Record<string, unknown> | null }[] = []
  const fetch = async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u)); const path = url.pathname.replace('/customer/v1', '')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    seen.push({ path, body })
    const offset = Number(body?.offset ?? url.searchParams.get('offset') ?? 0)
    const all = routes[path]?.(url, body)
    const data = Array.isArray(all) ? (offset === 0 ? all : []) : all
    return new Response(JSON.stringify(Array.isArray(all) ? { data } : data), { status: 200 })
  }
  return { client: new PeecClient('skc-x', { fetch: fetch as typeof globalThis.fetch }), seen }
}
const PROJECTS = [
  { id: 'or_b', name: 'Beta', status: 'PITCH_ENDED' },
  { id: 'or_a', name: 'Alpha', status: 'PITCH' },
  { id: 'or_c', name: 'Customer', status: 'CUSTOMER' },
]
const ROSTER = [
  { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  { id: 'kw_c1', name: 'Rival', is_own: false, domains: ['rival.com'] },
]
const base: Record<string, Route> = {
  '/projects': () => PROJECTS,
  '/brands': () => ROSTER,
  '/project-profile': () => ({ profile: { industry: 'Fintech', target_markets: [{ location: 'United States', market_size: 'National' }] } }),
  '/reports/domains': (_u, b) => (b?.dimensions
    ? [{ domain: 'example.com', date: '2026-10-05', retrieved_chat_count: 3 }, { domain: 'rival.com', date: '2026-10-07', retrieved_chat_count: 0 }, { domain: 'rival.com', date: '2026-10-06', retrieved_chat_count: 2 }]
    : [{ domain: 'example.com', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 9, retrieved_percentage: 0.2, mentioned_brands: [{ id: 'kw_own' }] }]),
  '/reports/brands': (_u, b) => (b?.dimensions
    ? [{ brand: { id: 'kw_own' }, model_channel: { id: 'openai-0' }, visibility_total: 10 }, { brand: { id: 'kw_own' }, model_channel: { id: 'google-0' }, visibility_total: 0 }]
    : [{ brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.15, share_of_voice: 0.2, position: 3.1 }, { brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]),
  '/model-channels': () => [{ id: 'openai-0', description: 'ChatGPT UI' }, { id: 'google-0', description: 'Google AI Overview' }],
  '/actions/list': () => [{ id: 'a1', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }, { id: 'a2', title: 'Done thing', impact: 'LOW', type: 'SEO_ISSUE', status: 'COMPLETED' }],
  '/prompts': () => ({ data: [{ id: 'p1' }], total_count: 100 }),
}
const NOW = Date.parse('2026-10-08T12:00:00Z')

test('lists only pitch projects, sorted by name', async () => {
  const { client } = fakePeec(base)
  expect((await listProjects(client)).map((p) => p.id)).toEqual(['or_a', 'or_b'])
})

test('pulls every step over one window from the days that carry data', async () => {
  const { client, seen } = fakePeec(base)
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.window).toEqual({ start: '2026-10-05', end: '2026-10-06' })
  expect(pull.ownBrand.id).toBe('kw_own')
  expect(pull.profile).toEqual({ industry: 'Fintech', markets: ['United States'] })
  expect(pull.models).toEqual(['ChatGPT UI'])
  expect(pull.actions.map((a) => a.title)).toEqual(['Give this page an H1 heading'])
  expect(pull.promptCount).toBe(100)
  const discovery = seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!
  expect(discovery.body).toMatchObject({ start_date: '2025-09-03', end_date: '2026-10-08' })
  for (const s of seen.filter((s) => s.path.startsWith('/reports/') && !(s.body?.dimensions as string[] | undefined)?.includes('date'))) {
    expect(s.body).toMatchObject({ project_id: 'or_a', start_date: '2026-10-05', end_date: '2026-10-06' })
    expect(s.body).not.toHaveProperty('filters')
  }
})

test('refuses a customer project, an unknown project, and a roster without exactly one own brand', async () => {
  await expect(pullSnapshot(fakePeec(base).client, 'or_c', NOW)).rejects.toThrow('not available to this tool')
  await expect(pullSnapshot(fakePeec(base).client, 'or_zzz', NOW)).rejects.toThrow('not available to this tool')
  const two = fakePeec({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) })
  await expect(pullSnapshot(two.client, 'or_a', NOW)).rejects.toThrow('exactly one own brand (found 2)')
})

test('fails loud when no day carries data or retrievals are zero', async () => {
  const noDays = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [] : []) })
  await expect(pullSnapshot(noDays.client, 'or_a', NOW)).rejects.toThrow('has any Peec data')
  const zero = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', retrieved_chat_count: 0 }]) })
  await expect(pullSnapshot(zero.client, 'or_a', NOW)).rejects.toThrow('zero retrievals')
})

test('a missing profile is null, not an error', async () => {
  const { client } = fakePeec({ ...base, '/project-profile': () => ({ profile: null }) })
  expect((await pullSnapshot(client, 'or_a', NOW)).profile).toBeNull()
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/pull.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/aeo-outbound/pull.ts`:

```ts
// Spec §7 steps 1-8 over one window. Every report call sends project_id, start_date and end_date and no
// model filter (all models; T3 confirmed). Guards fail with a reason Ryan can act on.
import { DECISIONS, PITCH_STATUSES } from './config'
import { PeecClient, PeecError, rowsOf } from './peec'

export interface PeecProject { id: string; name: string; status: string }
export interface RosterBrand { id: string; name: string; is_own: boolean; domains?: string[] | null }
export interface BrandReportRow {
  brand: { id: string; name: string }
  visibility: number
  share_of_voice?: number | null
  position?: number | null
}
export interface DomainRow {
  domain: string
  classification?: string | null
  retrieved_chat_count?: number | null
  retrieval_count?: number | null
  retrieved_percentage?: number | null
  mentioned_brands?: { id: string }[] | null
}
export interface ActionRow { id: string; title?: string | null; impact?: string | null; type?: string | null; status?: string | null }
export interface PeecPull {
  project: PeecProject
  roster: RosterBrand[]
  ownBrand: RosterBrand
  profile: { industry: string | null; markets: string[] } | null
  window: { start: string; end: string }
  brands: BrandReportRow[]
  domains: DomainRow[]
  actions: ActionRow[]
  promptCount: number | null
  models: string[]
  /** Non-fatal problems for the notes panel. */
  warnings: string[]
}

const DISCOVERY_DAYS = 400
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const isUsableProject = (p: PeecProject): boolean => !DECISIONS.pitchOnly || PITCH_STATUSES.includes(p.status)

export async function listProjects(client: PeecClient): Promise<PeecProject[]> {
  const rows = await client.all<{ id: string; name?: string; status?: string }>('GET', '/projects', {}, (r) => String(r.id), 1000)
  return rows
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), status: String(r.status ?? '') }))
    .filter(isUsableProject)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function pullSnapshot(client: PeecClient, projectId: string, nowMs: number, onStep?: (step: number) => void): Promise<PeecPull> {
  onStep?.(1)
  const project = (await listProjects(client)).find((p) => p.id === projectId)
  if (!project) throw new PeecError(`Peec project ${projectId} is not available to this tool`)

  onStep?.(2)
  const roster = await client.all<RosterBrand>('GET', '/brands', { project_id: projectId }, (r) => r.id, 1000)
  const owned = roster.filter((b) => b.is_own)
  if (owned.length !== 1) throw new PeecError(`Peec project needs exactly one own brand (found ${owned.length})`)

  onStep?.(3)
  const prof = (await client.call('GET', '/project-profile', { params: { project_id: projectId } })) as
    { profile?: { industry?: string | null; target_markets?: { location?: string | null }[] | null } | null } | null
  const p = prof?.profile ?? null
  const profile = p
    ? { industry: p.industry?.trim() || null, markets: (p.target_markets ?? []).map((m) => m.location?.trim() ?? '').filter(Boolean) }
    : null

  onStep?.(4)
  const end = day(nowMs)
  const start = day(nowMs - DISCOVERY_DAYS * 86_400_000)
  const dated = await client.all<{ domain: string; date?: string; retrieved_chat_count?: number | null }>(
    'POST', '/reports/domains', { project_id: projectId, start_date: start, end_date: end, dimensions: ['date'] },
    (r) => `${r.domain}|${r.date}`, 10_000)
  const days = dated.filter((r) => (r.retrieved_chat_count ?? 0) > 0).map((r) => String(r.date ?? '').slice(0, 10)).filter(Boolean).sort()
  if (!days.length) throw new PeecError(`No day between ${start} and ${end} has any Peec data for this project`)
  const window = { start: days[0], end: days[days.length - 1] }
  const W = { project_id: projectId, start_date: window.start, end_date: window.end }

  onStep?.(5)
  const brands = await client.all<BrandReportRow>('POST', '/reports/brands', W, (r) => r.brand.id, 10_000)
  if (!brands.some((r) => r.brand.id === owned[0].id)) throw new PeecError('The own brand has no row in the Peec brands report for this window')
  const byModel = await client.all<{ brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }>(
    'POST', '/reports/brands', { ...W, dimensions: ['model_channel_id'] }, (r) => `${r.brand.id}|${r.model_channel?.id}`, 10_000)
  const channelIds = [...new Set(byModel.filter((r) => (r.visibility_total ?? 0) > 0).map((r) => r.model_channel?.id).filter((x): x is string => !!x))].sort()
  const warnings: string[] = []
  // One unpaged, non-fatal call, as AIVx does (aivx agent/agent.py:1125-1138); names fall back to the ids.
  const channels = rowsOf<{ id: string; description?: string | null; current_model?: { id?: string } | null }>(
    await client.call('GET', '/model-channels', { params: { project_id: projectId, limit: 100 } }).catch(() => null))
  const models = channelIds.map((id) => { const c = channels.find((x) => x.id === id); return c?.description || c?.current_model?.id || id })

  onStep?.(6)
  const domains = await client.all<DomainRow>('POST', '/reports/domains', W, (r) => r.domain, 10_000)
  if (domains.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0) <= 0) throw new PeecError('Peec returned zero retrievals across every domain for this window')

  onStep?.(8)
  // One unpaged call (spec §7 step 8), default order impact desc; non-fatal, since actions are optional.
  let actions: ActionRow[] = []
  try {
    actions = rowsOf<ActionRow>(await client.call('POST', '/actions/list', { body: { project_id: projectId, limit: 50 } })).filter((a) => a.status === 'PENDING').slice(0, 10)
  } catch {
    warnings.push('Peec actions could not be loaded, so opportunities come from the data only.')
  }
  const prompts = (await client.call('GET', '/prompts', { params: { project_id: projectId, limit: 1 } })) as { total_count?: number } | null

  return {
    project, roster, ownBrand: owned[0], profile, window, brands, domains, actions,
    promptCount: typeof prompts?.total_count === 'number' ? prompts.total_count : null,
    models,
    warnings,
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run lib/aeo-outbound/pull.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit and push**

```bash
git add lib/aeo-outbound/pull.ts lib/aeo-outbound/pull.test.ts
git commit -m "feat(aeo-outbound): Peec pull over one discovered window, with guards"
git push
```

### Task 1.4: Metrics and the snapshot data model

**Files:**
- Create: `lib/aeo-outbound/metrics.ts`
- Modify: `lib/aeo-outbound/config.ts` (append three keys to `DECISIONS`, Step 0)
- Test: `lib/aeo-outbound/metrics.test.ts`, `lib/aeo-outbound/round.vectors.json` (generated in Step 1)

**Interfaces:**
- Consumes: `PeecPull` (Task 1.3); `DECISIONS` (Task 1.1, plus the three keys added in Step 0).
- Produces: `pyRound(x, dp)`, `fmtDay(iso)`, `fmtEasternDay(date)`, `titleClassification(c)`, types `BrandMetric`, `Kpi`, `SourceSlice`, `SnapshotData`, `MetricDecisions`, `buildSnapshotData(pull, generatedAtIso, decisions = DECISIONS) → SnapshotData`. Task 3.3 calls it with two arguments, so it reads `DECISIONS`.

Amendment 2026-10-09 (my call, before Ryan answers): Q2, Q4 and the source-mix weighting each get a switch, so every answer is a value change in `config.ts`, never a code change. Both settings of each switch are tested.

- [ ] **Step 0: Add the three switches** to `DECISIONS` in `lib/aeo-outbound/config.ts`. Insert these lines directly after the Q1 `sectionTitles` line, leaving every other line unchanged:

```ts
  /** Q2: null ranks the brand among every brand tracked in Peec. A number N (2 or more) ranks it among itself and
   *  the N - 1 competitors with the highest visibility, like the 7 brands Peec's dashboard shows. */
  rankAmong: null as number | null,
  /** Q4: list the sites where competitors appear and the brand does not, ranked by AI answers that used them. */
  competitorSiteGaps: true as boolean,
  /** The source-mix weighting (my call, not Ryan's): retrieval_count matches Peec's dashboard within 1 point;
   *  retrieved_chat_count is AIVx's method. */
  sourceMixWeight: 'retrieval_count' as 'retrieval_count' | 'retrieved_chat_count',
```

- [ ] **Step 1: Generate Python rounding vectors** (Python's `round` is the AIVx rule, `aivx:agent/agent.py:1312-1314`):

```bash
python3 -I - > lib/aeo-outbound/round.vectors.json <<'PY'
import json
xs=[0.125,0.375,2.5,3.5,15.45,15.55,15.65,22.4659,0.151*100,0.159*100,0.0,99.95,1.005,12.345,-0.125,-2.5,-15.65,-6.6000000000000014]
print(json.dumps([{"x":x,"dp":dp,"py":round(x,dp)} for x in xs for dp in (0,1,2)]))
PY
```

- [ ] **Step 2: Write the failing test** `lib/aeo-outbound/metrics.test.ts`:

```ts
import { expect, test } from 'vitest'
import vectors from './round.vectors.json'
import { buildSnapshotData, fmtDay, fmtEasternDay, pyRound, titleClassification } from './metrics'
import type { MetricDecisions } from './metrics'
import type { PeecPull } from './pull'

test('pyRound matches Python round on every vector', () => {
  for (const v of vectors as { x: number; dp: number; py: number }[]) expect(pyRound(v.x, v.dp)).toBe(v.py)
})
test('day and classification formatting', () => {
  expect(fmtDay('2026-10-01')).toBe('Oct 1, 2026')
  expect(fmtEasternDay(new Date('2026-10-09T02:30:00Z'))).toBe('Oct 8, 2026')
  expect(fmtEasternDay(new Date('2026-10-09T05:30:00Z'))).toBe('Oct 9, 2026')
  expect(titleClassification('OWN')).toBe('You')
  expect(titleClassification('UGC')).toBe('UGC')
  expect(titleClassification('Retailers')).toBe('Retailers')
})

const PULL: PeecPull = {
  project: { id: 'or_a', name: 'Example pitch', status: 'PITCH' },
  roster: [
    { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
    { id: 'kw_a', name: 'Alpha', is_own: false, domains: ['alpha.com'] },
    { id: 'kw_b', name: 'Beta', is_own: false, domains: ['beta.com'] },
  ],
  ownBrand: { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  profile: { industry: 'Fintech', markets: ['United States'] },
  window: { start: '2026-10-01', end: '2026-10-08' },
  brands: [
    { brand: { id: 'kw_b', name: 'Beta' }, visibility: 0.185, share_of_voice: 0.169, position: 3.1 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.06 },
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.261, share_of_voice: 0.225, position: 2.4 },
  ],
  domains: [
    { domain: 'example.com', classification: 'OWN', retrieved_chat_count: 1989, retrieval_count: 3698, retrieved_percentage: 0.2236 },
    { domain: 'alpha.com', classification: 'COMPETITOR', retrieved_chat_count: 1250, retrieval_count: 5902, mentioned_brands: [{ id: 'kw_a' }] },
    { domain: 'news.com', classification: 'EDITORIAL', retrieved_chat_count: 900, retrieval_count: 1000, mentioned_brands: [{ id: 'kw_own' }, { id: 'kw_a' }] },
    { domain: 'forum.com', classification: 'UGC', retrieved_chat_count: 300, retrieval_count: 400, mentioned_brands: [{ id: 'kw_b' }] },
    { domain: 'blank.com', classification: null, retrieved_chat_count: 5, retrieval_count: 0 },
  ],
  actions: [{ id: 'x', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }],
  promptCount: 100,
  models: ['ChatGPT UI', 'Google AI Overview'],
  warnings: [],
}

test('ranks by visibility then id, and builds the KPIs his way', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Beta', 2], ['Example Co', 3]])
  expect(d.kpis).toEqual([
    { label: 'AI visibility', value: '15.1%' },
    { label: 'AI share of voice', value: '15.9%' },
    { label: 'Average answer position', value: '#3.1' },
    { label: 'Competitive rank', value: '#3 of 3' },
  ])
  expect(d.windowLabel).toBe('Oct 1, 2026 to Oct 8, 2026')
  expect(d.category).toBe('Fintech')
  expect(d.market).toBe('United States')
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }, { name: 'Beta', visibilityPoints: 3.4, sovPoints: 1 }])
})

test('source mix weights by retrieval_count, drops zero weights, sorts by weight then label', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['Competitor', 5902], ['You', 3698], ['Editorial', 1000], ['UGC', 400]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(11000)
})

test('competitor gap domains: own brand absent, a competitor present, ranked by retrieved chats', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'alpha.com', retrievedChats: 1250 }, { domain: 'forum.com', retrievedChats: 300 }])
})

test('own site with no rows: zero chats, null percent, and a note', () => {
  const d = buildSnapshotData({ ...PULL, domains: PULL.domains.filter((r) => r.domain !== 'example.com') }, '2026-10-08T15:00:00Z')
  expect(d.ownRetrievedChats).toBe(0)
  expect(d.ownRetrievedPct).toBeNull()
  expect(d.notes.join(' ')).toContain('No retrievals of the brand\'s own site')
})

test('missing SOV or position drops that card (his three-card rule) and adds a note', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null, position: null } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  expect(d.kpis.map((k) => k.label)).toEqual(['AI visibility', 'Competitive rank'])
  expect(d.notes.join(' ')).toContain('share of voice')
})

test('only the own brand tracked: no rank card, a note, no competitor gaps', () => {
  const solo: PeecPull = { ...PULL, roster: [PULL.ownBrand], brands: [PULL.brands[1]] }
  const d = buildSnapshotData(solo, '2026-10-08T15:00:00Z')
  expect(d.competitorsTracked).toBe(0)
  expect(d.kpis.map((k) => k.label)).not.toContain('Competitive rank')
  expect(d.notes).toContain('No competitors tracked in this Peec project')
})

test('no profile: category and market are null with a note', () => {
  const d = buildSnapshotData({ ...PULL, profile: null }, '2026-10-08T15:00:00Z')
  expect([d.category, d.market]).toEqual([null, null])
  expect(d.notes.join(' ')).toContain('no project profile')
})

const DEFAULTS: MetricDecisions = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' }

test('two arguments read DECISIONS, whose defaults are every brand, site gaps on, retrieval_count', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z')).toEqual(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS))
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes).toContain('Rank is by visibility among the 3 brands tracked in Peec.')
})

test('Q2: rankAmong N keeps the brand and its N - 1 most visible competitors', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 2 })
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Example Co', 2]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 2' })
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }])
  expect(d.notes).toContain('Rank is by visibility among 2 of the 3 brands tracked in Peec: the brand and the competitors with the highest visibility.')
})

test('Q2: rankAmong at or above the tracked count changes nothing', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 3 })).toEqual(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS))
})

test('Q2: a brand ranked below the cut is still shown, last', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, visibility: 0.05 } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 2 })
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Example Co', 2]])
})

test('Q4: competitorSiteGaps off leaves no gap sites', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, competitorSiteGaps: false }).gapDomains).toEqual([])
})

test('source mix weighted by retrieved_chat_count (AIVx method)', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, sourceMixWeight: 'retrieved_chat_count' })
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['You', 1989], ['Competitor', 1250], ['Editorial', 900], ['UGC', 300], ['Uncategorized', 5]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(4444)
})
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/metrics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement** `lib/aeo-outbound/metrics.ts`:

```ts
// Turns a Peec pull into the numbers the page shows and Glean writes from (spec §5a, §7).
import { DECISIONS } from './config'
import type { PeecPull } from './pull'

/** The three DECISIONS this file reads; a parameter so tests can cover both settings of each. */
export type MetricDecisions = Pick<typeof DECISIONS, 'rankAmong' | 'competitorSiteGaps' | 'sourceMixWeight'>

export interface BrandMetric { id: string; name: string; isOwn: boolean; visibilityPct: number; sovPct: number | null; position: number | null; rank: number }
export interface Kpi { label: string; value: string }
export interface SourceSlice { label: string; weight: number; pct: number }
export interface SnapshotData {
  projectId: string
  projectName: string
  brand: string
  generatedAt: string
  window: { start: string; end: string }
  windowLabel: string
  category: string | null
  market: string | null
  brands: BrandMetric[]
  own: BrandMetric
  kpis: Kpi[]
  competitorsTracked: number
  leaderGaps: { name: string; visibilityPoints: number; sovPoints: number | null }[]
  ownDomains: string[]
  ownRetrievedChats: number
  ownRetrievedPct: number | null
  sourceMix: SourceSlice[]
  gapDomains: { domain: string; retrievedChats: number }[]
  actions: { title: string; impact: string; type: string }[]
  promptCount: number | null
  models: string[]
  notes: string[]
}

/** Python's round(x, dp): correctly rounded from the exact binary value, ties to even (symmetric for negatives). */
export function pyRound(x: number, dp: number): number {
  if (x < 0) return -pyRound(-x, dp)
  const exact = x.toFixed(100)
  const [int, frac = ''] = exact.split('.')
  const tail = frac.slice(dp)
  if (/^50*$/.test(tail)) {
    const kept = frac.slice(0, dp)
    const last = Number((kept || int).slice(-1))
    const down = Number(dp ? `${int}.${kept}` : int)
    return last % 2 === 0 ? down : Number((down + 10 ** -dp).toFixed(dp))
  }
  return Number(x.toFixed(dp))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM-DD' (a UTC calendar day from Peec) to 'Oct 1, 2026'. */
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** The US Eastern calendar day of an instant, formatted like fmtDay (spec §5 row 10). */
export function fmtEasternDay(d: Date): string {
  return fmtDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d))
}

const TITLE: Record<string, string> = {
  CORPORATE: 'Corporate', EDITORIAL: 'Editorial', INSTITUTIONAL: 'Institutional', OTHER: 'Other',
  REFERENCE: 'Reference', UGC: 'UGC', COMPETITOR: 'Competitor', OWN: 'You', RELATED: 'Related',
}
/** aivx agent/peec_api_transform.py:21-32: built-ins to their display form, OWN to You, custom names verbatim. */
export const titleClassification = (c: string): string => TITLE[c] ?? c

const pct1 = (ratio: number) => pyRound(ratio * 100, 1)
const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, '')

export function buildSnapshotData(pull: PeecPull, generatedAt: string, decisions: MetricDecisions = DECISIONS): SnapshotData {
  const notes: string[] = []
  const sorted = [...pull.brands].sort((a, b) => (b.visibility - a.visibility) || (a.brand.id < b.brand.id ? -1 : a.brand.id > b.brand.id ? 1 : 0))
  // Q2: keep the brand and its rankAmong - 1 most visible competitors, in visibility order.
  const cut = decisions.rankAmong !== null && decisions.rankAmong < sorted.length
  const keptIds = new Set(sorted.filter((r) => r.brand.id !== pull.ownBrand.id).slice(0, cut ? decisions.rankAmong! - 1 : sorted.length).map((r) => r.brand.id))
  const kept = sorted.filter((r) => r.brand.id === pull.ownBrand.id || keptIds.has(r.brand.id))
  const brands: BrandMetric[] = kept.map((r, i) => ({
    id: r.brand.id,
    name: r.brand.name,
    isOwn: r.brand.id === pull.ownBrand.id,
    visibilityPct: pct1(r.visibility),
    sovPct: typeof r.share_of_voice === 'number' ? pct1(r.share_of_voice) : null,
    position: typeof r.position === 'number' ? pyRound(r.position, 1) : null,
    rank: i + 1,
  }))
  const own = brands.find((b) => b.isOwn)!
  const competitorsTracked = pull.roster.filter((b) => !b.is_own).length

  const kpis: Kpi[] = [{ label: 'AI visibility', value: `${own.visibilityPct.toFixed(1)}%` }]
  if (own.sovPct !== null) kpis.push({ label: 'AI share of voice', value: `${own.sovPct.toFixed(1)}%` })
  else notes.push('Peec has no share of voice for the brand in this window, so that card is left out.')
  if (own.position !== null) kpis.push({ label: 'Average answer position', value: `#${own.position.toFixed(1)}` })
  else notes.push('Peec has no answer position for the brand in this window, so that card is left out.')
  if (competitorsTracked > 0) {
    kpis.push({ label: 'Competitive rank', value: `#${own.rank} of ${brands.length}` })
    notes.push(cut
      ? `Rank is by visibility among ${brands.length} of the ${sorted.length} brands tracked in Peec: the brand and the competitors with the highest visibility.`
      : `Rank is by visibility among the ${brands.length} brands tracked in Peec.`)
  } else {
    notes.push('No competitors tracked in this Peec project')
  }

  const leaderGaps = brands.filter((b) => b.rank < own.rank).map((b) => ({
    name: b.name,
    visibilityPoints: pyRound(b.visibilityPct - own.visibilityPct, 1),
    sovPoints: b.sovPct !== null && own.sovPct !== null ? pyRound(b.sovPct - own.sovPct, 1) : null,
  }))

  const ownDomains = (pull.ownBrand.domains ?? []).map(bare)
  const ownRows = pull.domains.filter((r) => ownDomains.includes(bare(r.domain)))
  const ownRetrievedChats = ownRows.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0)
  const topOwn = [...ownRows].sort((a, b) => (b.retrieved_chat_count ?? 0) - (a.retrieved_chat_count ?? 0))[0]
  const ownRetrievedPct = typeof topOwn?.retrieved_percentage === 'number' ? pct1(topOwn.retrieved_percentage) : null
  if (!ownRows.length) notes.push("No retrievals of the brand's own site in this window.")

  const weights = new Map<string, number>()
  for (const r of pull.domains) {
    const w = r[decisions.sourceMixWeight] ?? 0
    if (w <= 0) continue
    const label = r.classification ? titleClassification(r.classification) : 'Uncategorized'
    weights.set(label, (weights.get(label) ?? 0) + w)
  }
  const total = [...weights.values()].reduce((s, w) => s + w, 0)
  const sourceMix = [...weights.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([label, weight]) => ({ label, weight, pct: total ? pyRound((weight / total) * 100, 1) : 0 }))

  const competitorIds = new Set(pull.roster.filter((b) => !b.is_own).map((b) => b.id))
  const gapDomains = !decisions.competitorSiteGaps ? [] : pull.domains
    .filter((r) => {
      const ids = new Set((r.mentioned_brands ?? []).map((m) => m.id))
      return !ids.has(pull.ownBrand.id) && [...ids].some((id) => competitorIds.has(id))
    })
    .sort((a, b) => ((b.retrieved_chat_count ?? 0) - (a.retrieved_chat_count ?? 0)) || (a.domain < b.domain ? -1 : 1))
    .slice(0, 4)
    .map((r) => ({ domain: r.domain, retrievedChats: r.retrieved_chat_count ?? 0 }))

  if (!pull.profile) notes.push('Peec has no project profile, so category and market need validation.')
  notes.push(...pull.warnings)
  notes.push(`Peec project ${pull.project.id} (${pull.project.status}). Window ${pull.window.start} to ${pull.window.end}, all models: ${pull.models.join(', ') || 'none reported'}.`)

  return {
    projectId: pull.project.id,
    projectName: pull.project.name,
    brand: pull.ownBrand.name,
    generatedAt,
    window: pull.window,
    windowLabel: `${fmtDay(pull.window.start)} to ${fmtDay(pull.window.end)}`,
    category: pull.profile?.industry ?? null,
    market: pull.profile?.markets.length ? pull.profile.markets.join(', ') : null,
    brands,
    own,
    kpis,
    competitorsTracked,
    leaderGaps,
    ownDomains,
    ownRetrievedChats,
    ownRetrievedPct,
    sourceMix,
    gapDomains,
    actions: pull.actions.map((a) => ({ title: String(a.title ?? ''), impact: String(a.impact ?? ''), type: String(a.type ?? '') })).filter((a) => a.title).slice(0, 10),
    promptCount: pull.promptCount,
    models: pull.models,
    notes,
  }
}
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run lib/aeo-outbound/metrics.test.ts`
Expected: PASS. If a `pyRound` vector fails, fix `pyRound` (the vectors are Python's truth), never the vector file.

- [ ] **Step 6: Commit and push**

```bash
git add lib/aeo-outbound/config.ts lib/aeo-outbound/metrics.ts lib/aeo-outbound/metrics.test.ts lib/aeo-outbound/round.vectors.json
git commit -m "feat(aeo-outbound): snapshot metrics, ranking, source mix and gap domains"
git push
```

### Task 1.5: Slots (the editable copy)

**Files:**
- Create: `lib/aeo-outbound/slots.ts`
- Test: `lib/aeo-outbound/slots.test.ts`

**Interfaces:**
- Produces: types `Bullet`, `Opportunity`, `Slots`; `MAX_VALUE = 1000`, `MAX_LEAD = 80`; `cleanValue(v)`; `applySlotPatch(slots, path, value) → { ok: true; slots } | { ok: false; error }`; `needsValidationPaths(slots) → string[]`; `validateGeneratedSlots(raw, fixed: { category: string; market: string; next_step?: string }) → { ok: true; slots } | { ok: false; errors: string[] }`; `slotEntries(slots) → [path, value][]`.

- [ ] **Step 1: Write the failing test** `lib/aeo-outbound/slots.test.ts`:

```ts
import { expect, test } from 'vitest'
import { applySlotPatch, cleanValue, needsValidationPaths, slotEntries, validateGeneratedSlots, type Slots } from './slots'

const S: Slots = {
  category: 'Fintech', market: 'United States', headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L1', text: 'T1' }, { lead: 'L2', text: 'T2' }],
  sources_bullets: [{ lead: 'G1', text: 'U1' }, { lead: 'G2', text: 'U2' }],
  why: 'W', opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'M', next_step: 'N',
}

test('cleanValue trims, strips control characters and collapses whitespace', () => {
  expect(cleanValue('  a \n\t b  ')).toBe('a b')
  expect(cleanValue('brands  today')).toBe('brands today')
  expect(cleanValue('x' + String.fromCharCode(0) + 'y')).toBe('x y')
})

test('every closed path form saves; nothing else does', () => {
  for (const [path] of slotEntries(S)) expect(applySlotPatch(S, path, 'new value').ok).toBe(true)
  for (const bad of ['', 'brand', 'headline.0', 'competitive_bullets.2.lead', 'opportunities.3.signal', 'opportunities.0.title', '__proto__', 'constructor']) {
    expect(applySlotPatch(S, bad, 'v')).toEqual({ ok: false, error: 'unknown field' })
  }
})

test('values: text only, not empty, within limits; the input is never mutated', () => {
  expect(applySlotPatch(S, 'headline', 5 as unknown as string)).toEqual({ ok: false, error: 'value must be text' })
  expect(applySlotPatch(S, 'headline', '   ').ok).toBe(false)
  expect(applySlotPatch(S, 'competitive_bullets.0.lead', 'x'.repeat(81)).ok).toBe(false)
  expect(applySlotPatch(S, 'why', 'x'.repeat(1001)).ok).toBe(false)
  const r = applySlotPatch(S, 'opportunities.1.workstream', ' PR / earned media ')
  expect(r.ok && r.slots.opportunities[1].workstream).toBe('PR / earned media')
  expect(S.opportunities[1].workstream).toBe('Content / AEO')
})

test('needsValidationPaths finds every slot still marked', () => {
  const r = applySlotPatch(S, 'market', 'Needs validation')
  expect(r.ok && needsValidationPaths(r.slots)).toEqual(['market'])
})

const MODEL = {
  headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })),
  methodology: 'M', next_step: 'N',
}
test('accepts a well-formed model reply and merges the fixed fields', () => {
  const r = validateGeneratedSlots(MODEL, { category: 'Fintech', market: 'Needs validation' })
  expect(r.ok && r.slots.category).toBe('Fintech')
  expect(r.ok && r.slots.next_step).toBe('N')
  const f = validateGeneratedSlots(MODEL, { category: 'X', market: 'Y', next_step: 'Fixed sentence.' })
  expect(f.ok && f.slots.next_step).toBe('Fixed sentence.')
})
test('rejects wrong shapes', () => {
  const cases: unknown[] = [
    null, 'text', { ...MODEL, headline: 5 }, { ...MODEL, why: '' },
    { ...MODEL, competitive_bullets: [MODEL.competitive_bullets[0]] },
    { ...MODEL, sources_bullets: [...MODEL.sources_bullets, MODEL.sources_bullets[0]] },
    { ...MODEL, opportunities: MODEL.opportunities.slice(0, 2) },
    { ...MODEL, competitive_bullets: [{ lead: 'x'.repeat(81), text: 't' }, { lead: 'l', text: 't' }] },
  ]
  for (const c of cases) expect(validateGeneratedSlots(c, { category: 'a', market: 'b' }).ok).toBe(false)
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/slots.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/aeo-outbound/slots.ts`:

```ts
// The editable copy (spec §6, §9a). competitive_bullets holds the first data section (strengths) and
// sources_bullets the second (gaps), as spec §5 row 5-6 says.
import { NEEDS_VALIDATION } from './config'

export interface Bullet { lead: string; text: string }
export interface Opportunity { signal: string; opportunity: string; workstream: string }
export interface Slots {
  category: string
  market: string
  headline: string
  summary: string
  context: string
  competitive_bullets: Bullet[]
  sources_bullets: Bullet[]
  why: string
  opportunities: Opportunity[]
  methodology: string
  next_step: string
}
export const MAX_VALUE = 1000
export const MAX_LEAD = 80
const SCALARS = ['category', 'market', 'headline', 'summary', 'context', 'why', 'methodology', 'next_step'] as const
type Scalar = (typeof SCALARS)[number]
const PATH = /^(?:(category|market|headline|summary|context|why|methodology|next_step)|(competitive_bullets|sources_bullets)\.(\d)\.(lead|text)|opportunities\.(\d)\.(signal|opportunity|workstream))$/

export function cleanValue(v: string): string {
  return v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function checkValue(raw: unknown, limit: number): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'value must be text' }
  const value = cleanValue(raw)
  if (!value) return { ok: false, error: "This field can't be empty." }
  if (value.length > limit) return { ok: false, error: `Keep this under ${limit} characters.` }
  return { ok: true, value }
}

export function applySlotPatch(slots: Slots, path: string, raw: unknown): { ok: true; slots: Slots } | { ok: false; error: string } {
  const m = PATH.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, m[4] === 'lead' ? MAX_LEAD : MAX_VALUE)
  if (!checked.ok) return checked
  const next: Slots = structuredClone(slots)
  if (m[1]) {
    next[m[1] as Scalar] = checked.value
  } else if (m[2]) {
    const item = next[m[2] as 'competitive_bullets' | 'sources_bullets'][Number(m[3])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[4] as keyof Bullet] = checked.value
  } else {
    const item = next.opportunities[Number(m[5])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[6] as keyof Opportunity] = checked.value
  }
  return { ok: true, slots: next }
}

/** Every [path, value] in page order. */
export function slotEntries(s: Slots): [string, string][] {
  const out: [string, string][] = SCALARS.map((k) => [k, s[k]])
  for (const list of ['competitive_bullets', 'sources_bullets'] as const) s[list].forEach((b, i) => { out.push([`${list}.${i}.lead`, b.lead], [`${list}.${i}.text`, b.text]) })
  s.opportunities.forEach((o, i) => { out.push([`opportunities.${i}.signal`, o.signal], [`opportunities.${i}.opportunity`, o.opportunity], [`opportunities.${i}.workstream`, o.workstream]) })
  return out
}

export const needsValidationPaths = (s: Slots): string[] => slotEntries(s).filter(([, v]) => v.includes(NEEDS_VALIDATION)).map(([p]) => p)

/** Shape and limits for a model reply (spec §6). category, market and an optional fixed next_step come from code. */
export function validateGeneratedSlots(raw: unknown, fixed: { category: string; market: string; next_step?: string }): { ok: true; slots: Slots } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!o) return { ok: false, errors: ['reply is not a JSON object'] }
  const text = (key: string, v: unknown, limit = MAX_VALUE): string => {
    const c = checkValue(v, limit)
    if (!c.ok) { errors.push(`${key}: ${c.error}`); return '' }
    return c.value
  }
  const bullets = (key: 'competitive_bullets' | 'sources_bullets'): Bullet[] => {
    const v = o[key]
    if (!Array.isArray(v) || v.length < 2 || v.length > 3) { errors.push(`${key}: needs 2 or 3 bullets`); return [] }
    return v.map((b, i) => ({ lead: text(`${key}.${i}.lead`, (b as Bullet)?.lead, MAX_LEAD), text: text(`${key}.${i}.text`, (b as Bullet)?.text) }))
  }
  const opps = Array.isArray(o.opportunities) && o.opportunities.length === 3
    ? o.opportunities.map((x, i) => ({
        signal: text(`opportunities.${i}.signal`, (x as Opportunity)?.signal),
        opportunity: text(`opportunities.${i}.opportunity`, (x as Opportunity)?.opportunity),
        workstream: text(`opportunities.${i}.workstream`, (x as Opportunity)?.workstream),
      }))
    : (errors.push('opportunities: needs exactly 3'), [])
  const slots: Slots = {
    category: fixed.category,
    market: fixed.market,
    headline: text('headline', o.headline),
    summary: text('summary', o.summary),
    context: text('context', o.context),
    competitive_bullets: bullets('competitive_bullets'),
    sources_bullets: bullets('sources_bullets'),
    why: text('why', o.why),
    opportunities: opps,
    methodology: text('methodology', o.methodology),
    next_step: fixed.next_step ?? text('next_step', o.next_step),
  }
  return errors.length ? { ok: false, errors } : { ok: true, slots }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run lib/aeo-outbound/slots.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit and push**

```bash
git add lib/aeo-outbound/slots.ts lib/aeo-outbound/slots.test.ts
git commit -m "feat(aeo-outbound): slots, closed edit paths and model-reply validation"
git push
```

### Task 1.6: Table, migration and store

**Files:**
- Modify: `lib/db/schema.ts` (append at the end of the file)
- Create: `drizzle/0026_aeo_outbound_reports.sql`, `drizzle/meta/0026_snapshot.json`, `drizzle/meta/_journal.json` entry (all generated)
- Create: `lib/aeo-outbound/store.ts`
- Test: `lib/aeo-outbound/store.test.ts`
- Modify: `MIGRATIONS-PENDING.md` (append), `.env.example` (append one line)

**Interfaces:**
- Consumes: `SnapshotData` (Task 1.4), `Slots` (Task 1.5), `STALE_GENERATING_MS` (Task 1.1).
- Produces: `aeoOutboundReports`, `aeoOutboundStatusEnum`, type `AeoOutboundRow`; in `store.ts` type `ReportRow` (JSON columns typed) and `isReportId(id)`; `markStaleGeneratingQuery(projectId, now)`, `insertGeneratingQuery(v)`, `finishDraftQuery(id, v)`, `finishFailedQuery(id, error, brandName)`, `saveSlotsQuery(id, shownRevision, slots, notes)`, `approveQuery(id, shownRevision, v)`, `revokeQuery(id, by, now)`, `discardQuery(id, by, now)`, `getReport(id)`, `listReports()`, `getLiveByToken(token)`, `findGeneratingFor(projectId)`, `isUniqueViolation(e)`, `failureReason(row, nowMs)`, `displayStatus(row, nowMs) → 'generating' | 'draft' | 'live' | 'revoked' | 'failed'`.

- [ ] **Step 1: Append the table** to the end of `lib/db/schema.ts`. Append-only: no new imports (`pgEnum`, `pgTable`, `uuid`, `text`, `jsonb`, `integer`, `timestamp`, `check`, `index`, `uniqueIndex` and `sql` are already imported, `lib/db/schema.ts:1-3`), and the schema never imports from `lib/aeo-outbound` (spec §4: nothing else imports it). `store.ts` gives the JSON columns their types.

```ts
// AEO Outbound Snapshot (spec docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md §9). Read and written
// only by lib/aeo-outbound/store.ts. Standalone: references no other table.
export const aeoOutboundStatusEnum = pgEnum('aeo_outbound_status', ['generating', 'draft', 'approved', 'failed'])

export const aeoOutboundReports = pgTable('aeo_outbound_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  peecProjectId: text('peec_project_id').notNull(),
  peecProjectName: text('peec_project_name').notNull(),
  brandName: text('brand_name'),
  status: aeoOutboundStatusEnum('status').notNull().default('generating'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  slots: jsonb('slots').$type<Record<string, unknown>>(),
  notes: jsonb('notes').$type<string[]>(),
  revision: integer('revision').notNull().default(0),
  error: text('error'),
  html: text('html'),
  shareToken: text('share_token').unique(),
  rerunOf: uuid('rerun_of'),
  createdBy: text('created_by').notNull(),
  approvedBy: text('approved_by'),
  revokedBy: text('revoked_by'),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  shareRevokedAt: timestamp('share_revoked_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  createdIdx: index('aeo_outbound_created_idx').on(table.createdAt),
  oneGenerating: uniqueIndex('aeo_outbound_one_generating').on(table.peecProjectId).where(sql`status = 'generating'`),
  approvedComplete: check('aeo_outbound_approved_complete',
    sql`(${table.status} = 'approved') = (${table.html} IS NOT NULL AND ${table.shareToken} IS NOT NULL AND ${table.approvedAt} IS NOT NULL)`),
  revokeOnlyApproved: check('aeo_outbound_revoke_only_approved', sql`${table.shareRevokedAt} IS NULL OR ${table.status} = 'approved'`),
  deleteOnlyDraftOrFailed: check('aeo_outbound_delete_only_draft_failed', sql`${table.deletedAt} IS NULL OR ${table.status} IN ('draft', 'failed')`),
}))

export type AeoOutboundRow = typeof aeoOutboundReports.$inferSelect
```

- [ ] **Step 2: Generate the migration** (no database connection is made by `generate`; the URL only satisfies the config):

Run: `DATABASE_URL_UNPOOLED=postgresql://x:x@localhost:5432/x perl -e 'alarm 120; exec @ARGV' -- npx drizzle-kit generate --name aeo_outbound_reports`
Expected: creates `drizzle/0026_aeo_outbound_reports.sql`, `drizzle/meta/0026_snapshot.json`, and a `_journal.json` entry. Read the SQL: it must contain only `CREATE TYPE "public"."aeo_outbound_status"`, `CREATE TABLE "aeo_outbound_reports"`, the three CHECKs, the unique `share_token`, `aeo_outbound_created_idx`, and `aeo_outbound_one_generating ... WHERE status = 'generating'`. Any statement touching another table means the snapshot drifted: stop and report.

- [ ] **Step 3: Write the failing store test** `lib/aeo-outbound/store.test.ts` (built offline with `.toSQL()`, the pattern at `lib/organic-social/chart-notes/mutations.test.ts:32-44`):

```ts
import { expect, test } from 'vitest'
import { approveQuery, discardQuery, displayStatus, failureReason, isReportId, isUniqueViolation, markStaleGeneratingQuery, revokeQuery, saveSlotsQuery } from './store'
import type { AeoOutboundRow } from '@/lib/db/schema'
import type { Slots } from './slots'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-08T15:00:00Z')
const where = (q: { sql: string }) => q.sql.slice(q.sql.indexOf(' where '))
const SLOTS = {} as Slots

test('save matches a live draft at the shown revision and bumps it', () => {
  const q = saveSlotsQuery(ID, 4, SLOTS, ['n']).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."status" = $')
  expect(where(q)).toContain('"aeo_outbound_reports"."revision" = $')
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.params).toContain('draft')
  expect(q.params).toContain(4)
  expect(q.sql).toContain('"revision" = "aeo_outbound_reports"."revision" + 1')
})

test('approve matches a live draft at the shown revision', () => {
  const q = approveQuery(ID, 7, { html: '<html>', token: 'a'.repeat(24), by: 'ryan@avenuez.com', now: NOW }).toSQL()
  expect(q.params).toEqual(expect.arrayContaining(['approved', 'draft', 7, '<html>', 'a'.repeat(24), 'ryan@avenuez.com']))
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
})

test('revoke only touches a live approved link', () => {
  const q = revokeQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."share_revoked_at" is null')
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.params).toContain('approved')
})

test('discard matches draft, failed, or generating older than 6 minutes, and turns generating into failed', () => {
  const q = discardQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.sql).toContain('case when')
  expect(q.params).toContain(new Date(NOW.getTime() - 6 * 60_000).toISOString())
})

test('stale generating rows for a project are failed before a new insert', () => {
  const q = markStaleGeneratingQuery('or_a', NOW).toSQL()
  expect(q.params).toEqual(expect.arrayContaining(['failed', 'or_a', 'generating']))
})

const row = (p: Partial<AeoOutboundRow>) => ({ status: 'draft', createdAt: NOW, shareRevokedAt: null, deletedAt: null, error: null, ...p }) as AeoOutboundRow
test('failure reason: stored error, else Timed out for a stale generating row', () => {
  const t = NOW.getTime()
  expect(failureReason(row({ status: 'failed', error: 'Copy generation failed. Rerun.' }), t)).toBe('Copy generation failed. Rerun.')
  expect(failureReason(row({ status: 'generating', error: null }), t + 6 * 60_000 + 1)).toBe('Timed out')
  expect(failureReason(row({ status: 'generating', error: null }), t + 60_000)).toBeNull()
})

test('display status', () => {
  const t = NOW.getTime()
  expect(displayStatus(row({ status: 'generating' }), t + 60_000)).toBe('generating')
  expect(displayStatus(row({ status: 'generating' }), t + 6 * 60_000 + 1)).toBe('failed')
  expect(displayStatus(row({ status: 'draft' }), t)).toBe('draft')
  expect(displayStatus(row({ status: 'approved' }), t)).toBe('live')
  expect(displayStatus(row({ status: 'approved', shareRevokedAt: NOW }), t)).toBe('revoked')
  expect(displayStatus(row({ status: 'failed' }), t)).toBe('failed')
})

test('report ids must be UUIDs before anything reaches Postgres', () => {
  expect(isReportId('c7d8e0a1-1111-4111-8111-111111111111')).toBe(true)
  for (const bad of ['', 'abc', "1' or '1'='1", 'c7d8e0a1-1111-4111-8111-11111111111Z', 5]) expect(isReportId(bad)).toBe(false)
})

test('unique violation detection', () => {
  expect(isUniqueViolation({ code: '23505' })).toBe(true)
  expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
  expect(isUniqueViolation(new Error('x'))).toBe(false)
})
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement** `lib/aeo-outbound/store.ts`:

```ts
// The only reader and writer of aeo_outbound_reports (spec §9). Every write is one conditional UPDATE with
// .returning(), so a lost race matches nothing instead of reporting success (app/actions/commentary.ts:17-37).
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundReports as t, type AeoOutboundRow } from '@/lib/db/schema'
import { STALE_GENERATING_MS } from './config'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const staleBefore = (now: Date) => new Date(now.getTime() - STALE_GENERATING_MS)

/** A row with its JSON columns typed. The schema keeps them untyped so it never imports this folder. */
export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots'> & { data: SnapshotData | null; slots: Slots | null }
const typed = (r: AeoOutboundRow): ReportRow => r as unknown as ReportRow

export function markStaleGeneratingQuery(projectId: string, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: 'Timed out', updatedAt: now })
    .where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'), lt(t.createdAt, staleBefore(now))))
}

export function insertGeneratingQuery(v: { projectId: string; projectName: string; createdBy: string; rerunOf: string | null }) {
  return db.insert(t)
    .values({ peecProjectId: v.projectId, peecProjectName: v.projectName, createdBy: v.createdBy, rerunOf: v.rerunOf })
    .returning({ id: t.id })
}

export function finishDraftQuery(id: string, v: { brandName: string; data: SnapshotData; slots: Slots; notes: string[]; now: Date }) {
  return db.update(t)
    .set({ status: 'draft', brandName: v.brandName, data: v.data as unknown as Record<string, unknown>, slots: v.slots as unknown as Record<string, unknown>, notes: v.notes, updatedAt: v.now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

export function finishFailedQuery(id: string, error: string, brandName: string | null, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: error.slice(0, 500), brandName, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

export function saveSlotsQuery(id: string, shownRevision: number, slots: Slots, notes: string[]) {
  return db.update(t)
    .set({ slots: slots as unknown as Record<string, unknown>, notes, revision: sql`${t.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, 'draft'), eq(t.revision, shownRevision), isNull(t.deletedAt)))
    .returning({ revision: t.revision })
}

export function approveQuery(id: string, shownRevision: number, v: { html: string; token: string; by: string; now: Date }) {
  return db.update(t)
    .set({ status: 'approved', html: v.html, shareToken: v.token, approvedBy: v.by, approvedAt: v.now, updatedAt: v.now })
    .where(and(eq(t.id, id), eq(t.status, 'draft'), eq(t.revision, shownRevision), isNull(t.deletedAt)))
    .returning({ id: t.id, shareToken: t.shareToken })
}

export function revokeQuery(id: string, by: string, now: Date) {
  return db.update(t)
    .set({ shareRevokedAt: now, revokedBy: by, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt)))
    .returning({ id: t.id })
}

export function discardQuery(id: string, by: string, now: Date) {
  const stale = staleBefore(now)
  return db.update(t)
    .set({
      status: sql`case when ${t.status} = 'generating' then 'failed'::aeo_outbound_status else ${t.status} end`,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
    })
    .where(and(
      eq(t.id, id),
      isNull(t.deletedAt),
      or(inArray(t.status, ['draft', 'failed']), and(eq(t.status, 'generating'), lt(t.createdAt, stale))),
    ))
    .returning({ id: t.id })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const isReportId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)

/** undefined for a malformed id, an unknown id or a discarded row (a malformed id never reaches Postgres). */
export async function getReport(id: string): Promise<ReportRow | undefined> {
  if (!isReportId(id)) return undefined
  const r = (await db.select().from(t).where(and(eq(t.id, id), isNull(t.deletedAt))).limit(1))[0]
  return r ? typed(r) : undefined
}

export async function listReports(): Promise<ReportRow[]> {
  return (await db.select().from(t).where(isNull(t.deletedAt)).orderBy(desc(t.createdAt)).limit(200)).map(typed)
}

export async function findGeneratingFor(projectId: string): Promise<string | undefined> {
  return (await db.select({ id: t.id }).from(t).where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'))).limit(1))[0]?.id
}

/** The frozen HTML for a live link, or undefined for unknown, revoked or discarded tokens. */
export async function getLiveByToken(token: string): Promise<string | undefined> {
  const r = (await db.select({ html: t.html }).from(t)
    .where(and(eq(t.shareToken, token), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt))).limit(1))[0]
  return r?.html ?? undefined
}

export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (x as { code?: string } | null)?.code
  return code(e) === '23505' || code((e as { cause?: unknown } | null)?.cause) === '23505'
}

/** The reason shown for a failed row; a generating row past the stale limit reads "Timed out" (spec §9). */
export function failureReason(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'error'>, nowMs: number): string | null {
  if (row.error) return row.error
  return row.status === 'generating' && nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'Timed out' : null
}

export type DisplayStatus = 'generating' | 'draft' | 'live' | 'revoked' | 'failed'
export function displayStatus(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'shareRevokedAt'>, nowMs: number): DisplayStatus {
  if (row.status === 'generating') return nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'failed' : 'generating'
  if (row.status === 'approved') return row.shareRevokedAt ? 'revoked' : 'live'
  return row.status
}
```

- [ ] **Step 6: Run to see it pass, then typecheck**

Run: `npx vitest run lib/aeo-outbound/store.test.ts && perl -e 'alarm 590; exec @ARGV' -- npm run typecheck`
Expected: PASS and no type errors. If a `toSQL()` string assertion differs only in quoting or casing from what Drizzle 0.45 emits, read the actual `q.sql` and fix the assertion to match the real output while keeping the same meaning (the column and operator must still be asserted).

- [ ] **Step 7: Env and migration log**

Append to `.env.example` after `CHART_NOTES_APPROVERS=...` (line 88):
```
AEO_OUTBOUND_USERS=                 # [optional] comma-separated @avenuez.com emails allowed to use Tools > New Business (AEO Outbound Snapshot). Unset means nobody.
```
Append to `MIGRATIONS-PENDING.md`:
```markdown

## Add aeo_outbound_reports (delivered, awaiting apply)

`drizzle/0026_aeo_outbound_reports.sql` creates the `aeo_outbound_status` enum and the standalone
`aeo_outbound_reports` table (AEO Outbound Snapshot). Additive: no existing table, column or row
changes, and only `lib/aeo-outbound/store.ts` reads it, so the `clients` 42703 risk above does not
apply. Apply with the hash-checked `scripts/migrate-http.ts`, dev first, then staging and production
each on my written go, before the code reaches that environment.
```

- [ ] **Step 8: Full check, commit, push, open PR1**

Run: `perl -e 'alarm 590; exec @ARGV' -- make check`
Expected: typecheck, tests, check:rsc and build all pass.

```bash
git add lib/db/schema.ts drizzle/0026_aeo_outbound_reports.sql drizzle/meta/0026_snapshot.json drizzle/meta/_journal.json lib/aeo-outbound/store.ts lib/aeo-outbound/store.test.ts .env.example MIGRATIONS-PENDING.md
git commit -m "feat(aeo-outbound): aeo_outbound_reports table, migration and store"
git push
gh pr create --base aeo-outbound-audit --draft --title "feat(aeo-outbound): data and storage → aeo-outbound-audit" --body-file /tmp/pr1.md
```
(`/tmp/pr1.md` is written at execution time: what it does, what was verified with the raw `make check` output, and the edge-case list per my CLAUDE.md if any code crosses a boundary. It crosses the Peec network boundary, so the list is required.)

---

## Part 2 (PR2): the report page

Cut from `aeo-outbound-audit` after PR1 merges: `git checkout -b feat/aeo-outbound-render origin/aeo-outbound-audit`.

### Task 2.1: AIVx assets, copied verbatim

**Files:**
- Create: `lib/aeo-outbound/aivx/css.ts`, `lib/aeo-outbound/aivx/js.ts`, `lib/aeo-outbound/aivx/favicon.ts`, `lib/aeo-outbound/aivx/share.ts`
- Test: `lib/aeo-outbound/aivx/assets.test.ts`

**Interfaces:**
- Produces: `AIVX_CSS`, `AIVX_JS`, `AIVX_FAVICON_TAG`, `AIVX_SHARE_BLOCK` (the toast element plus script, `aivx:renderer.py:2557-2614`, braces unescaped).

- [ ] **Step 1: Generate the files from AIVx at `ff18697`** (read-only):

```bash
mkdir -p lib/aeo-outbound/aivx
test "$(git -C ~/code/aivx-reports rev-parse HEAD)" = "$(git -C ~/code/aivx-reports rev-parse ff18697)" || { echo "AIVx clone is not at ff18697"; exit 1; }
python3 -I - ~/code/aivx-reports/agent/renderer.py lib/aeo-outbound/aivx <<'PY'
import ast, json, re, sys
src = open(sys.argv[1], encoding="utf-8").read(); out = sys.argv[2]
head = "// Copied verbatim from Avenue-Z/aivx-reports@ff18697 agent/renderer.py. Do not edit; a test pins the hash.\n"
lit = {n.targets[0].id: ast.literal_eval(n.value) for n in ast.parse(src).body if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id in ("CSS", "JS")}
css, js = lit["CSS"], lit["JS"]  # evaluated strings: what AIVx actually ships
fav = re.search(r'(<link rel="icon" type="image/png" href="data:image/png;base64,[^"]+">)', src).group(1)
i = src.index('  <div class="share-toast"'); j = src.index('</body>', i)
share = src[i:j].replace("{{", "{").replace("}}", "}")
bad = "Copy failed " + chr(0x2014) + " please copy: "
assert share.count(bad) == 1
share = share.replace(bad, "Copy failed. Please copy: ")  # my no-dash rule; the only change to AIVx's block
for name, const, val in [("css.ts","AIVX_CSS",css),("js.ts","AIVX_JS",js),("favicon.ts","AIVX_FAVICON_TAG",fav),("share.ts","AIVX_SHARE_BLOCK",share)]:
    open(f"{out}/{name}", "w", encoding="utf-8").write(head + f"export const {const}: string = " + json.dumps(val, ensure_ascii=False) + "\n")
print("ok")
PY
```

- [ ] **Step 2: Write the test** `lib/aeo-outbound/aivx/assets.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { AIVX_CSS } from './css'
import { AIVX_JS } from './js'
import { AIVX_FAVICON_TAG } from './favicon'
import { AIVX_SHARE_BLOCK } from './share'

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
test('the AIVx stylesheet and page script are byte-identical to ff18697', () => {
  expect(sha(AIVX_CSS)).toBe('2925c9bd76410aaa8e6ea832a7fd9e20d981efcb65fa68958545cf3b251c833e')
  expect(sha(AIVX_JS)).toBe('6453e61c22b1b171d3c5f951f901e356087e0dd507e9951808332255183a9bb6')
})
test('favicon and share block have the expected shape', () => {
  expect(AIVX_FAVICON_TAG.startsWith('<link rel="icon" type="image/png" href="data:image/png;base64,')).toBe(true)
  expect(AIVX_SHARE_BLOCK).toContain('class="share-toast"')
  expect(AIVX_SHARE_BLOCK).toContain("document.querySelector('.share-btn')")
  expect(AIVX_SHARE_BLOCK).not.toContain('{{')
  expect(AIVX_SHARE_BLOCK).toContain('Copy failed. Please copy: ')
  expect(AIVX_SHARE_BLOCK).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
})
```

- [ ] **Step 3: Run**

Run: `npx vitest run lib/aeo-outbound/aivx`
Expected: PASS (2 tests). A hash mismatch means the copy is not verbatim: regenerate, never edit the hash.

- [ ] **Step 4: Commit and push**

```bash
git add lib/aeo-outbound/aivx
git commit -m "feat(aeo-outbound): AIVx stylesheet, script, favicon and share block, verbatim"
git push -u origin feat/aeo-outbound-render
```

### Task 2.2: Golden chart fixtures from AIVx's own builders

**Files:**
- Create: `lib/aeo-outbound/__fixtures__/aivx-goldens.json` (generated, synthetic data)

**Interfaces:**
- Produces: `{ plotly_py_version, cases: { visibility_bar_12, visibility_bar_4, sources_8_types, sources_3_types }: { input, figure: { data, layout, config }, wrapperHeight } }`.

- [ ] **Step 1: Generate** with plotly 6.9.0 in a throwaway venv (scratchpad), running AIVx's own functions extracted verbatim (the T2 method, `aeo-outbound-audit-notes/findings/t2-goldens/gen_goldens.py`):

```bash
mkdir -p lib/aeo-outbound/__fixtures__
V=/private/tmp/aeo-goldens-venv
python3 -m venv $V && perl -e 'alarm 240; exec @ARGV' -- $V/bin/pip install -q "plotly==6.9.0"
$V/bin/python -I - ~/code/aivx-reports/agent/agent.py lib/aeo-outbound/__fixtures__/aivx-goldens.json <<'PY'
import ast, json, re, sys, plotly, plotly.graph_objects as go, plotly.io as pio
AGENT, OUT = sys.argv[1], sys.argv[2]
src = open(AGENT, encoding="utf-8").read(); tree = ast.parse(src)
WANT = {"BRAND_COLORS","CITATION_BAR_COLORS","PLOTLY_BASE","AIVX_CHART_META_KEY","_donut_legend","_contrast_text_colors","_chart_meta","_cycled_donut_palette","build_leaderboard_chart","build_earned_breakdown_chart"}
ns = {"go": go, "pio": pio}; got = set()
for node in tree.body:
    names = {node.name} if isinstance(node, ast.FunctionDef) else ({t.id for t in node.targets if isinstance(t, ast.Name)} if isinstance(node, ast.Assign) else set())
    if names & WANT:
        exec(compile(ast.Module(body=[node], type_ignores=[]), AGENT, "exec"), ns); got |= names & WANT
assert got == WANT, WANT - got
def parse(html):
    m = re.search(r'Plotly\.newPlot\(\s*"[^"]+",\s*', html); dec = json.JSONDecoder(); k = m.end()
    data, e = dec.raw_decode(html, k); k = e
    while html[k] in " \n,": k += 1
    layout, e = dec.raw_decode(html, k); k = e
    while html[k] in " \n,": k += 1
    config, _ = dec.raw_decode(html, k)
    h = int(re.match(r'<div style="height:(\d+)px', html).group(1))
    return {"data": data, "layout": layout, "config": config}, h
vis12 = [("Alpha",26.1),("Beta",18.5),("Example Co",15.1),("Gamma",12.3),("Delta",8.1),("Epsilon",8.1),("Zeta",8.0),("Eta",7.8),("Theta",4.7),("Iota",3.5),("Kappa",1.9),("Lambda",1.3)]
vis4 = vis12[:4]
cases = {
 "visibility_bar_12": ("build_leaderboard_chart", {"leaderboard": [{"brand": b, "citation_count": v} for b, v in vis12]}),
 "visibility_bar_4": ("build_leaderboard_chart", {"leaderboard": [{"brand": b, "citation_count": v} for b, v in vis4]}),
 "sources_8_types": ("build_earned_breakdown_chart", {"source_is_granular": False, "earned_breakdown": {k: {"count": c, "pct": 0} for k, c in [("Corporate",3595),("Institutional",1758),("Competitor",1118),("Editorial",479),("Reference",399),("UGC",240),("Other",240),("You",160)]}}),
 "sources_3_types": ("build_earned_breakdown_chart", {"source_is_granular": False, "earned_breakdown": {k: {"count": c, "pct": 0} for k, c in [("Corporate",50),("Editorial",30),("UGC",20)]}}),
}
out = {"plotly_py_version": plotly.__version__, "cases": {}}
for name, (fn, arg) in cases.items():
    fig, h = parse(ns[fn](arg)); out["cases"][name] = {"input": arg, "figure": fig, "wrapperHeight": h}
json.dump(out, open(OUT, "w"), indent=1); print("ok", plotly.__version__)
PY
```

Expected: `ok 6.9.0` and the file written. It contains only the synthetic names above.

- [ ] **Step 2: Commit**

```bash
git add lib/aeo-outbound/__fixtures__/aivx-goldens.json
git commit -m "test(aeo-outbound): golden figures from AIVx's own chart builders (synthetic)"
git push
```

### Task 2.3: Escaping, figures and the page renderer

**Files:**
- Create: `lib/aeo-outbound/html.ts`, `lib/aeo-outbound/charts.ts`, `lib/aeo-outbound/aivx/plotly-template.ts` (generated from the golden), `lib/aeo-outbound/render.ts`
- Test: `lib/aeo-outbound/charts.test.ts`, `lib/aeo-outbound/render.test.ts`

**Interfaces:**
- Consumes: `SnapshotData`, `BrandMetric`, `SourceSlice` (Task 1.4); `Slots` (Task 1.5); `DECISIONS` (Task 1.1); AIVx assets (Task 2.1).
- Produces: `esc(s)`, `jsonForScript(x)`, `stripTags(s)`; `type Figure = { data: unknown[]; layout: Record<string, unknown>; config: Record<string, unknown> }`; `visibilityBarFigure(brands: { name: string; visibilityPct: number }[]) → Figure`; `sourceDonutFigure(mix: { label: string; weight: number }[]) → Figure`; `embedFigure(id, figure) → string`; `type RenderMode = 'draft' | 'preview' | 'final'`; `renderSnapshotHtml(data, slots, mode, preparedOn: string) → string`.

- [ ] **Step 1: Generate the Plotly template** from the golden (the `template` Python embeds, spec §3):

```bash
python3 -I - <<'PY'
import json
g = json.load(open("lib/aeo-outbound/__fixtures__/aivx-goldens.json"))
t = g["cases"]["sources_8_types"]["figure"]["layout"]["template"]
assert t == g["cases"]["visibility_bar_12"]["figure"]["layout"]["template"]
open("lib/aeo-outbound/aivx/plotly-template.ts","w").write("// The default template plotly 6.9.0 embeds in every AIVx figure (from the golden fixtures). Do not edit.\nexport const AIVX_PLOTLY_TEMPLATE: Record<string, unknown> = " + json.dumps(t) + "\n")
print("ok")
PY
```

- [ ] **Step 2: Write the failing chart test** `lib/aeo-outbound/charts.test.ts`:

```ts
import { expect, test } from 'vitest'
import goldens from './__fixtures__/aivx-goldens.json'
import { embedFigure, sourceDonutFigure, visibilityBarFigure, type Figure } from './charts'

type Case = { input: Record<string, unknown>; figure: Figure; wrapperHeight: number }
const C = goldens.cases as unknown as Record<string, Case>
const plain = (x: unknown) => JSON.parse(JSON.stringify(x))

for (const name of ['visibility_bar_12', 'visibility_bar_4']) {
  test(`${name}: identical to AIVx's bar except the visibility hover and % labels`, () => {
    const lb = (C[name].input.leaderboard as { brand: string; citation_count: number }[])
    const ours = plain(visibilityBarFigure(lb.map((b) => ({ name: b.brand, visibilityPct: b.citation_count }))))
    const gold = plain(C[name].figure)
    expect(ours.data[0].hovertemplate).toBe('<b>%{y}</b><br>Visibility: %{x}%<extra></extra>')
    expect(ours.data[0].text).toEqual(ours.data[0].x.map((v: number) => `${v.toFixed(1)}%`))
    for (const f of [ours, gold]) { delete f.data[0].hovertemplate; delete f.data[0].text }
    expect(ours).toEqual(gold)
  })
}
for (const name of ['sources_8_types', 'sources_3_types']) {
  test(`${name}: identical to AIVx's content-source donut`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const ours = sourceDonutFigure(Object.entries(eb).map(([label, v]) => ({ label, weight: v.count })))
    expect(plain(ours)).toEqual(plain(C[name].figure))
  })
}
test('the embed is the AIVx wrapper, with the figure height on the outer div', () => {
  const html = embedFigure('aeo-chart-sources', sourceDonutFigure([{ label: 'A', weight: 1 }]))
  expect(html.startsWith('<div style="height:420px; width:100%;">')).toBe(true)
  expect(html).toContain('<div id="aeo-chart-sources" class="plotly-graph-div" style="height:100%; width:100%;"></div>')
  expect(html).toContain('Plotly.newPlot("aeo-chart-sources", ')
})
test('figure JSON cannot close the script and labels carry no tags', () => {
  const html = embedFigure('x', visibilityBarFigure([{ name: '</script><b>Evil</b> & "Co"', visibilityPct: 5 }]))
  expect(html).not.toContain('</script><b>')
  expect(html.match(/<\/script>/g)?.length).toBe(1)
  const fig = visibilityBarFigure([{ name: '<b>Bold</b>', visibilityPct: 5 }])
  expect((fig.data[0] as { y: string[] }).y).toEqual(['bBold/b'])
})
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run lib/aeo-outbound/charts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement** `lib/aeo-outbound/html.ts` and `lib/aeo-outbound/charts.ts`:

`lib/aeo-outbound/html.ts`:
```ts
const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
/** HTML-escape text and attribute values (the same five characters as aivx renderer.py:15 esc). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ENT[c])
/** Plotly reads its own tags inside labels (T2 finding), so Peec text in figures loses < and >. */
export const stripTags = (s: string): string => s.replace(/[<>]/g, '')
const BS = String.fromCharCode(92)
/** JSON safe inside an inline <script>: <, >, & and the two line separators become escapes. */
export const jsonForScript = (x: unknown): string =>
  JSON.stringify(x)
    .replace(/</g, BS + 'u003c').replace(/>/g, BS + 'u003e').replace(/&/g, BS + 'u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), BS + 'u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), BS + 'u2029')
```

`lib/aeo-outbound/charts.ts`:
```ts
// Plotly figures built exactly like AIVx's builders (aivx-reports@ff18697 agent/agent.py): the brand
// visibility bars use build_leaderboard_chart's styling (:2634-2694) and the source mix uses
// build_earned_breakdown_chart (:2721-2763). Golden fixtures prove the JSON matches.
import { AIVX_PLOTLY_TEMPLATE } from './aivx/plotly-template'
import { jsonForScript, stripTags } from './html'

export interface Figure { data: unknown[]; layout: Record<string, unknown>; config: Record<string, unknown> }

const BRAND_COLORS = ['#6034FF', '#39A0FF', '#60FFEA', '#60FF80', '#FFFC60', '#808080'] // agent.py:32
const CITATION_BAR_COLORS = ['#6034FF', '#39A0FF', '#60FFEA', '#60FF80', '#FFFC60', '#D14BFF', '#12D9A8', '#BFFF3D', '#FF9A3D', '#FF5C9D', '#808080'] // agent.py:39-44
const PLOTLY_BASE = { // agent.py:46-55
  paper_bgcolor: '#000000',
  plot_bgcolor: '#1a1a1a',
  font: { family: 'Avenir, sans-serif', color: '#FFFFFF', size: 13 },
  hoverlabel: { bgcolor: '#272727', bordercolor: 'rgba(255,255,255,0.1)', font: { family: 'Avenir', color: '#FFFFFF', size: 13 } },
}
const CONFIG = { displayModeBar: false, responsive: true }

/** agent.py:2490-2500 */
function contrastTextColors(hex: string[]): string[] {
  return hex.map((h) => {
    const s = h.replace('#', '')
    const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#FFFFFF'
  })
}
/** agent.py:2696-2718 */
function cycledDonutPalette(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const base = BRAND_COLORS[i % BRAND_COLORS.length]
    const cycle = Math.floor(i / BRAND_COLORS.length)
    if (cycle === 0) { out.push(base); continue }
    const f = Math.min(0.3 * cycle, 0.9)
    const ch = [1, 3, 5].map((k) => parseInt(base.slice(k, k + 2), 16))
    out.push('#' + ch.map((c) => Math.round(c + (255 - c) * f).toString(16).toUpperCase().padStart(2, '0')).join(''))
  }
  return out
}
/** agent.py:2477-2487 */
const donutLegend = () => ({ orientation: 'h', font: { family: 'Avenir', color: '#FFFFFF', size: 12 }, bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, x: 0.5, y: -0.06, xanchor: 'center', yanchor: 'top' })

export function visibilityBarFigure(brands: { name: string; visibilityPct: number }[]): Figure {
  const top10 = [...brands.slice(0, 20)].sort((a, b) => b.visibilityPct - a.visibilityPct).slice(0, 10)
  const rev = [...top10].reverse()
  const n = rev.length
  const x = rev.map((b) => b.visibilityPct)
  return {
    data: [{
      type: 'bar', orientation: 'h', x, y: rev.map((b) => stripTags(b.name)),
      marker: { color: rev.map((_, i) => CITATION_BAR_COLORS[Math.min(n - 1 - i, CITATION_BAR_COLORS.length - 1)]), line: { color: 'rgba(0,0,0,0)', width: 0 } },
      hovertemplate: '<b>%{y}</b><br>Visibility: %{x}%<extra></extra>',
      text: x.map((v) => `${v.toFixed(1)}%`),
      textposition: 'outside',
      textfont: { color: '#A6A6A6', size: 11 },
    }],
    layout: {
      template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE,
      height: Math.max(420, top10.length * 38),
      xaxis: { title: { text: '' }, gridcolor: 'rgba(255,255,255,0.06)', showgrid: true, zeroline: false, tickfont: { color: '#A6A6A6', size: 11 } },
      yaxis: { title: { text: '' }, showgrid: false, tickfont: { color: '#FFFFFF', size: 12, family: 'Avenir' } },
      bargap: 0.38,
    },
    config: CONFIG,
  }
}

export function sourceDonutFigure(mix: { label: string; weight: number }[]): Figure {
  const colors = cycledDonutPalette(mix.length)
  return {
    data: [{
      type: 'pie', labels: mix.map((m) => stripTags(m.label)), values: mix.map((m) => m.weight), hole: 0.6,
      marker: { colors, line: { color: '#000000', width: 3 } },
      textinfo: 'percent', textposition: 'auto', insidetextorientation: 'horizontal',
      insidetextfont: { family: 'Avenir', size: 14, color: contrastTextColors(colors) },
      outsidetextfont: { family: 'Avenir', size: 14, color: '#FFFFFF' },
      hovertemplate: '<b>%{label}</b><br>Citations: %{value}<extra></extra>',
    }],
    layout: { template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE, showlegend: true, legend: donutLegend(), height: 420, margin: { l: 90, r: 90, t: 28, b: 64 } },
    config: CONFIG,
  }
}

/** The wrapper plotly 6.8+ emits (golden html), with the figure height on the outer div. */
export function embedFigure(id: string, fig: Figure): string {
  const h = Number(fig.layout.height ?? 420)
  return `<div style="height:${h}px; width:100%;"><div id="${id}" class="plotly-graph-div" style="height:100%; width:100%;"></div><script>window.PLOTLYENV=window.PLOTLYENV || {};if (document.getElementById("${id}")) {Plotly.newPlot("${id}", ${jsonForScript(fig.data)}, ${jsonForScript(fig.layout)}, ${jsonForScript(fig.config)})};</script></div>`
}
```

- [ ] **Step 5: Run the chart test; reconcile against the goldens**

Run: `npx vitest run lib/aeo-outbound/charts.test.ts`
Expected: PASS. If a deep-equal fails, the diff shows the exact key Python emits differently (for example key presence or a nested `title` shape). Change `charts.ts` to emit what the golden holds. Never edit the golden. Note any such change in the commit body.

- [ ] **Step 6: Write the failing render test** `lib/aeo-outbound/render.test.ts`:

```ts
import { expect, test } from 'vitest'
import { AIVX_CSS } from './aivx/css'
import { renderSnapshotHtml } from './render'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const BRANDS = [
  { id: 'a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 },
  { id: 'o', name: 'Example <Co> & "Sons"', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 2 },
]
const DATA = {
  projectId: 'or_a', projectName: 'p', brand: 'Example <Co> & "Sons"', generatedAt: '2026-10-08T15:00:00Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States', brands: BRANDS, own: BRANDS[1],
  kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#2 of 2' }],
  competitorsTracked: 1, leaderGaps: [], ownDomains: ['example.com'], ownRetrievedChats: 10, ownRetrievedPct: 22.4,
  sourceMix: [{ label: 'Corporate', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }], gapDomains: [], actions: [],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as SnapshotData
const SLOTS: Slots = {
  category: 'Fintech', market: 'United States', headline: 'Headline <script>alert(1)</script>', summary: 'Summary.',
  context: 'Alpha leads Example <Co> & "Sons".', competitive_bullets: [{ lead: 'Lead:', text: 'Text.' }, { lead: 'L2:', text: 'T2.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'G.' }, { lead: 'G2:', text: 'G2.' }], why: 'Why.',
  opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'Method.', next_step: 'Next.',
}

test('final: AIVx head and stylesheet verbatim, no editing hooks, share button present', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
  expect(h.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(h).toContain(`<style>${AIVX_CSS}</style>`)
  // AIVx's tag (renderer.py:2537) plus Subresource Integrity for the CDN file (sha384 of plotly-3.5.0.min.js, measured 2026-10-08).
  expect(h).toContain('<script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>')
  expect(h).toContain('<meta name="robots" content="noindex,nofollow">')
  expect(h).toContain('<title>AI Visibility Snapshot: Example &lt;Co&gt; &amp; &quot;Sons&quot; | Avenue Z</title>')
  expect(h).not.toContain('<link rel="canonical"')
  expect(h).not.toContain('report-editor')
  expect(h).not.toContain('data-slot')
  expect(h).not.toContain('contenteditable')
  expect(h).toContain('class="share-btn"')
  expect(h).toContain('Prepared Oct 9, 2026')
})

test('renders hostile Peec names inert', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
  expect(h).not.toContain('<script>alert(1)</script>')
  expect(h).toContain('Headline &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(h).not.toContain('Example <Co>')
})

test('draft: every slot editable, editor script present, share hidden', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026')
  for (const p of ['headline', 'summary', 'context', 'category', 'market', 'why', 'methodology', 'next_step', 'competitive_bullets.0.lead', 'sources_bullets.1.text', 'opportunities.2.workstream']) {
    expect(h).toContain(`data-slot="${p}" contenteditable="plaintext-only"`)
  }
  expect(h).toContain("parent.postMessage({type:'dirty',path:p}")
  expect(h).toContain("e.data.type==='flush'")
  expect(h).not.toContain('class="share-btn"')
})

test('preview: no hooks and no share button', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'preview', 'Oct 8, 2026')
  expect(h).not.toContain('data-slot')
  expect(h).not.toContain('class="share-btn"')
})

test('three KPI cards switch the strip to three columns', () => {
  const h4 = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  expect(h4).toContain('<div class="kpi-strip">')
  const h3 = renderSnapshotHtml({ ...DATA, kpis: DATA.kpis.slice(0, 3) }, SLOTS, 'final', 'x')
  expect(h3).toContain('<div class="kpi-strip" style="grid-template-columns:repeat(3, 1fr)">')
})

test('sections, nav ids and roster bolding', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  for (const id of ['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology']) expect(h).toContain(`href="#${id}"`)
  expect(h).toContain('<section id="category-data" class="section">')
  expect(h).toContain('<section id="competitive-visibility" class="section">')
  expect(h).toContain('<strong>Alpha</strong> leads <strong>Example &lt;Co&gt; &amp; &quot;Sons&quot;</strong>.')
  expect(h).toContain('These are opportunity hypotheses for discussion, not a full roadmap.')
})

test('a short brand name is bolded only as a whole word', () => {
  const brands = [...BRANDS, { id: 's', name: 'amp', isOwn: false, visibilityPct: 1, sovPct: 1, position: 5, rank: 3 }]
  const h = renderSnapshotHtml({ ...DATA, brands }, { ...SLOTS, context: 'Tom & Jerry vs amp and camping.' }, 'final', 'x')
  expect(h).toContain('Tom &amp; Jerry vs <strong>amp</strong> and camping.')
})

test('a long brand name gets the AIVx 72px hero rule', () => {
  const h = renderSnapshotHtml({ ...DATA, brand: 'A Very Long Brand Name Incorporated' }, SLOTS, 'final', 'x')
  expect(h).toContain('<h1 class="hero-industry" style="font-size:72px">')
})
```

- [ ] **Step 7: Implement** `lib/aeo-outbound/render.ts`:

```ts
// The snapshot page in the AIVx design (spec §5). Head and body structure follow aivx-reports@ff18697
// agent/renderer.py:2530-2556; blocks follow its builders. Every string is escaped; Peec text in figures
// is stripped of < and >.
import { DECISIONS } from './config'
import { AIVX_CSS } from './aivx/css'
import { AIVX_JS } from './aivx/js'
import { AIVX_FAVICON_TAG } from './aivx/favicon'
import { AIVX_SHARE_BLOCK } from './aivx/share'
import { embedFigure, sourceDonutFigure, visibilityBarFigure } from './charts'
import { esc } from './html'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

export type RenderMode = 'draft' | 'preview' | 'final'
const UL = '<ul style="margin-top:10px;padding-left:20px;display:flex;flex-direction:column;gap:4px">' // renderer.py:2313

const EDITOR_STYLE = '<style>[data-slot]{outline:1px dashed transparent;outline-offset:2px;cursor:text}[data-slot]:hover,[data-slot]:focus{outline-color:rgba(255,255,255,0.35)}</style>'
const EDITOR_SCRIPT = "<script>(function(){var t={},els={};function send(p){clearTimeout(t[p]);delete t[p];parent.postMessage({type:'edit',path:p,value:els[p].textContent||''},'*')}window.addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.type==='flush'){Object.keys(t).forEach(send)}});document.querySelectorAll('[data-slot]').forEach(function(el){var p=el.getAttribute('data-slot');els[p]=el;el.addEventListener('input',function(){parent.postMessage({type:'dirty',path:p},'*');clearTimeout(t[p]);t[p]=setTimeout(function(){send(p)},800)});el.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();el.blur()}});el.addEventListener('paste',function(e){e.preventDefault();var s=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,s)})})})();</script>"

export function renderSnapshotHtml(data: SnapshotData, slots: Slots, mode: RenderMode, preparedOn: string): string {
  const draft = mode === 'draft'
  /** A slot's text, escaped, inside its element; editable only in draft. */
  const slot = (tag: string, path: string, value: string, cls = '', html?: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${draft ? ` data-slot="${path}" contenteditable="plaintext-only"` : ''}>${html ?? esc(value)}</${tag}>`
  const bullets = (key: 'competitive_bullets' | 'sources_bullets') =>
    UL + slots[key].map((b, i) => `<li><strong>${slot('span', `${key}.${i}.lead`, b.lead)}</strong> ${slot('span', `${key}.${i}.text`, b.text)}</li>`).join('') + '</ul>'

  const names = data.brands.map((b) => b.name).filter(Boolean).sort((a, b) => b.length - a.length)
  /** Bold exact roster names in the raw text (whole words only), escaping every piece. */
  const bolded = (text: string) => {
    if (!names.length) return esc(text)
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const re = new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, 'g')
    let out = ''
    let last = 0
    for (const m of text.matchAll(re)) {
      out += esc(text.slice(last, m.index)) + `<strong>${esc(m[0])}</strong>`
      last = m.index! + m[0].length
    }
    return out + esc(text.slice(last))
  }

  const isLong = data.brand.length > 24 // renderer.py:1439-1458
  const kpiCards = data.kpis.map((k) => `<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`).join('')
  const kpiStrip = data.kpis.length === 4 ? '<div class="kpi-strip">' : `<div class="kpi-strip" style="grid-template-columns:repeat(${data.kpis.length}, 1fr)">`
  const [t1, t2] = DECISIONS.sectionTitles
  const brand = esc(data.brand)

  const sidebar = `
<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="aivx-brand">${DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z'}</div>
    <div class="powered">Powered by Avenue Z</div>
  </div>
  <div class="sidebar-industry">
    AI Visibility Snapshot
    <span>${brand}</span>
  </div>
  <nav class="sidebar-nav">
    <a href="#headline"><span class="nav-num">01</span> Headline signal</a>
    <a href="#category-data"><span class="nav-num">02</span> ${esc(t1)}</a>
    <a href="#competitive-visibility"><span class="nav-num">03</span> ${esc(t2)}</a>
    <a href="#opportunities"><span class="nav-num">04</span> Opportunities</a>
    <a href="#methodology"><span class="nav-num">05</span> Methodology</a>
  </nav>
  <div class="sidebar-footer">${mode === 'final' ? `
    <button class="share-btn" type="button" aria-label="Copy shareable link to this report">
      <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      <span class="share-btn-label">Share Report</span>
    </button>` : ''}
    <a href="https://avenuez.com" target="_blank" rel="noopener">avenuez.com ↗</a>
  </div>
</nav>`

  const main = `
<header class="hero">
  <div class="hero-series">AI Visibility Snapshot</div>
  <h1 class="hero-industry"${isLong ? ' style="font-size:72px"' : ''}><span class="grad-text">${brand}</span></h1>
  <div class="hero-subtitle">Category: ${slot('span', 'category', slots.category)} &nbsp;·&nbsp; Market: ${slot('span', 'market', slots.market)} &nbsp;·&nbsp; Data window: ${esc(data.windowLabel)}</div>
  <div class="hero-meta">
  </div>
</header>
<section id="headline" class="exec-summary">
  <div class="exec-label">Headline signal</div>
  ${slot('div', 'headline', slots.headline, 'exec-headline')}
  ${slot('div', 'summary', slots.summary, 'exec-subheadline')}
</section>
<section class="section">
  ${kpiStrip}${kpiCards}</div>
  ${data.competitorsTracked > 0 ? slot('div', 'context', slots.context, 'insight-box', bolded(slots.context)) : ''}
</section>
<section id="category-data" class="section">
  <div class="section-label">02 / ${esc(t1)}</div>
  <h2 class="section-title">${esc(t1)}</h2>
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('competitive_bullets')}</div></div>
    <div><div class="chart-wrap"><div class="chart-title">Domain Types</div>${embedFigure('aeo-chart-sources', sourceDonutFigure(data.sourceMix))}</div></div>
  </div>
</section>
<section id="competitive-visibility" class="section">
  <div class="section-label">03 / ${esc(t2)}</div>
  <h2 class="section-title">${esc(t2)}</h2>
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('sources_bullets')}</div></div>
    <div><div class="chart-wrap"><div class="chart-title">Competitive Visibility</div>${embedFigure('aeo-chart-visibility', visibilityBarFigure(data.brands))}</div></div>
  </div>
</section>
<section class="section">
  <div class="rec-global-bottom-line">
    <div style="font-size:18px;font-weight:900;color:var(--white);margin-bottom:12px">Why it matters</div>
    ${slot('p', 'why', slots.why).replace('<p', '<p style="font-size:15px;color:rgba(255,255,255,0.75);line-height:1.75;margin:0"')}
  </div>
</section>
<section id="opportunities" class="section">
  <div class="section-label">04 / Opportunities</div>
  <h2 class="section-title">Three opportunities to explore</h2>
  <div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr><th>Signal</th><th>Opportunity to explore</th><th>Likely workstream</th></tr></thead>
      <tbody>${slots.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal)}${slot('td', `opportunities.${i}.opportunity`, o.opportunity)}${slot('td', `opportunities.${i}.workstream`, o.workstream)}</tr>`).join('')}</tbody>
    </table>
  </div>
  <p class="chart-takeaway">These are opportunity hypotheses for discussion, not a full roadmap.</p>
</section>
<section id="methodology" class="section">
  <div class="method-note"><strong>Methodology:</strong> ${slot('span', 'methodology', slots.methodology)} <strong>Next step:</strong> ${slot('span', 'next_step', slots.next_step)}</div>
</section>
<footer class="footer">
  <div class="footer-grad-line"></div>
  <div class="footer-content">
    <div class="footer-brand">
      <div class="avz-name">Avenue Z</div>
      <p class="footer-desc">
        Avenue Z is a digital marketing and PR agency specializing in AI visibility
        and Answer Engine Optimization (AEO). We help brands earn citation authority
        with AI models through earned media, content strategy, and technical optimization.
      </p>
      <a class="footer-link" href="https://avenuez.com" target="_blank" rel="noopener">
        avenuez.com ↗
      </a>
    </div>
    <div>
      <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">
        AI VISIBILITY SNAPSHOT
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.5)">
        ${brand}<br>Prepared ${esc(preparedOn)}
      </p>
    </div>
  </div>
  <p class="footer-disclaimer">
    Data reflects a Peec AI visibility snapshot for the stated window and is directional.
    Avenue Z makes no representations about future AI visibility outcomes.
  </p>
</footer>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${AIVX_FAVICON_TAG}
  <title>AI Visibility Snapshot: ${brand} | Avenue Z</title>
  <script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>
  <meta name="description" content="AI Visibility Snapshot for ${brand}. Powered by Avenue Z AEO Intelligence.">
  <meta name="robots" content="noindex,nofollow">
  <style>${AIVX_CSS}</style>${draft ? EDITOR_STYLE : ''}
</head>
<body>
  ${sidebar}
  <div class="main">
    ${main}
  </div>
  <script>${AIVX_JS}</script>${mode === 'final' ? `\n${AIVX_SHARE_BLOCK}` : ''}${draft ? EDITOR_SCRIPT : ''}
</body>
</html>`
}
```

Note: `slot('p', 'why', ...)` adds the inline style by string replace on the first `<p`; the test asserts the `why` slot carries `data-slot="why"`. In the draft view, bolded `context` keeps its `<strong>` children inside the contenteditable element; its `textContent` is still the plain slot value, which is what the editor posts.

- [ ] **Step 8: Run all render and chart tests**

Run: `npx vitest run lib/aeo-outbound`
Expected: PASS.

- [ ] **Step 9: Visual check against AIVx (my eyes, not a test)**

Write the final, draft and preview HTML for the synthetic `DATA` to the scratchpad and open them in the built-in browser at 1440px three ways: directly, inside `<iframe sandbox="allow-scripts" srcdoc>` and served with `Content-Security-Policy: sandbox allow-scripts` (the T2 harness). In both sandboxed modes the origin is opaque, so the SRI-checked Plotly fetch is a CORS request with `Origin: null`; cdn.plot.ly answered that with `Access-Control-Allow-Origin: *` on 2026-10-08, and the charts must draw in all three modes, next to `~/code/aivx-reports/reports/aivx-digital-banks-2026-05.html`. Check fonts load, both charts draw, the sidebar shows, the KPI strip, insight box, tables and footer look like AIVx. Screenshot for the PR.

- [ ] **Step 10: Full check, commit, push, open PR2**

Run: `perl -e 'alarm 590; exec @ARGV' -- make check`
```bash
git add lib/aeo-outbound/html.ts lib/aeo-outbound/charts.ts lib/aeo-outbound/charts.test.ts lib/aeo-outbound/render.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/aivx/plotly-template.ts
git commit -m "feat(aeo-outbound): AIVx-design snapshot renderer with golden-checked charts"
git push
gh pr create --base aeo-outbound-audit --draft --title "feat(aeo-outbound): snapshot page in the AIVx design → aeo-outbound-audit" --body-file /tmp/pr2.md
```

---

## Part 3 (PR3): generation

Cut from `aeo-outbound-audit` after PR2 merges: `git checkout -b feat/aeo-outbound-generate origin/aeo-outbound-audit`.

### Task 3.1: Glean call with the search guard

**Files:**
- Create: `lib/aeo-outbound/glean.ts`
- Test: `lib/aeo-outbound/glean.test.ts`

**Interfaces:**
- Produces: `type GleanReply = { text: string; searched: boolean }`; `gleanOnce(prompt, signal, fetchImpl?) → Promise<GleanReply>`; `readGleanReply(payload) → GleanReply` (pure).

- [ ] **Step 1: Write the failing test** `lib/aeo-outbound/glean.test.ts`:

```ts
import { expect, test } from 'vitest'
import { readGleanReply } from './glean'

const ai = (messageType: string, fragments: Record<string, unknown>[]) => ({ author: 'GLEAN_AI', messageType, fragments })
test('takes the last CONTENT message, not the longest one (T3 probe B)', () => {
  const r = readGleanReply({ messages: [ai('UPDATE', [{ text: '**Clarifying data constraints** with a long heading' }]), ai('CONTENT', [{ text: 'NOT IN DATA' }])] })
  expect(r).toEqual({ text: 'NOT IN DATA', searched: false })
})
test('any search fragment or citation marks the reply as searched (T3 probe A)', () => {
  for (const f of [{ querySuggestion: {} }, { structuredResults: [] }, { action: {} }, { citation: {} }]) {
    expect(readGleanReply({ messages: [ai('UPDATE', [f]), ai('CONTENT', [{ text: '{}' }])] }).searched).toBe(true)
  }
  expect(readGleanReply({ messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: 'x' }], citations: [{}] }] }).searched).toBe(true)
})
test('no answer is an error', () => {
  expect(() => readGleanReply({ messages: [ai('UPDATE', [{ text: 'x' }])] })).toThrow('no answer')
  expect(() => readGleanReply({})).toThrow('no answer')
})
```

- [ ] **Step 2: Run to see it fail**, then **implement** `lib/aeo-outbound/glean.ts`:

```ts
// This tool's own Glean chat call (spec §6). Same request body as gleanChat (lib/glean.ts:54-65) but it keeps
// the raw messages so the search guard can see whether Glean searched company documents. lib/glean.ts is
// imported, not changed.
import { GLEAN_BASE_URL, getGleanHeaders } from '@/lib/glean'

export interface GleanReply { text: string; searched: boolean }
type Msg = { author?: string; messageType?: string; fragments?: Record<string, unknown>[]; citations?: unknown[] }
const SEARCH_KEYS = ['querySuggestion', 'structuredResults', 'action', 'citation'] as const

export function readGleanReply(payload: unknown): GleanReply {
  const msgs = ((payload as { messages?: Msg[] } | null)?.messages ?? [])
  const searched = msgs.some((m) => (m.citations?.length ?? 0) > 0 || (m.fragments ?? []).some((f) => SEARCH_KEYS.some((k) => f[k] != null)))
  const content = msgs.filter((m) => m.author === 'GLEAN_AI' && m.messageType === 'CONTENT')
  const last = content[content.length - 1]
  const text = (last?.fragments ?? []).map((f) => (typeof f.text === 'string' ? f.text : '')).join('').trim()
  if (!text) throw new Error('Glean chat returned no answer')
  return { text, searched }
}

export async function gleanOnce(prompt: string, signal: AbortSignal, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<GleanReply> {
  if (!process.env.GLEAN_API_TOKEN || !process.env.GLEAN_INSTANCE) throw new Error('Glean is not configured')
  const res = await fetchImpl(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(),
    body: JSON.stringify({ messages: [{ author: 'USER', fragments: [{ text: prompt }] }], saveChat: false }),
    signal,
  })
  if (!res.ok) throw new Error(`Glean chat error ${res.status}`)
  return readGleanReply(await res.json())
}
```

Run: `npx vitest run lib/aeo-outbound/glean.test.ts` → PASS (3 tests). Commit:

```bash
git add lib/aeo-outbound/glean.ts lib/aeo-outbound/glean.test.ts
git commit -m "feat(aeo-outbound): Glean call that exposes whether it searched"
git push -u origin feat/aeo-outbound-generate
```

### Task 3.2: Prompt and grounding

**Files:**
- Create: `lib/aeo-outbound/prompt.ts`, `lib/aeo-outbound/grounding.ts`
- Test: `lib/aeo-outbound/prompt.test.ts`, `lib/aeo-outbound/grounding.test.ts`

**Interfaces:**
- Consumes: `SnapshotData` (1.4), `Slots`, `slotEntries` (1.5), `DECISIONS` (1.1).
- Produces: `dataBlock(data) → string`; `buildPrompt(data, violations: string[]) → string`; `parseModelJson(raw) → unknown | null`; `groundingFlags(slots, data) → string[]`.

- [ ] **Step 1: Write the failing tests.**

`lib/aeo-outbound/prompt.test.ts`:
```ts
import { expect, test } from 'vitest'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import type { SnapshotData } from './metrics'

const D = {
  brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', category: null, market: 'United States',
  own: { name: 'Example Co', visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 3, id: 'o', isOwn: true },
  brands: [], kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }], competitorsTracked: 11,
  leaderGaps: [{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }], ownDomains: ['example.com'],
  ownRetrievedChats: 1989, ownRetrievedPct: 22.4, sourceMix: [{ label: 'Corporate', weight: 9, pct: 45 }],
  gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], actions: [{ title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE' }],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as unknown as SnapshotData

test('the data block holds exactly the computed values, already formatted', () => {
  const b = dataBlock(D)
  for (const s of ['15.1%', '15.9%', '#3.1', '1,989', '22.4%', 'alpha.com', 'Give this page an H1 heading', 'Oct 1, 2026 to Oct 8, 2026', '100', 'ChatGPT UI', '11 points', '6.6 points']) expect(b).toContain(s)
})
test('the prompt carries the rules, the sections, the source rule and no em or en dashes', () => {
  const p = buildPrompt(D, [])
  expect(p).toContain('Use ONLY the Data section')
  expect(p).toContain('competitive_bullets')
  expect(p).toContain('strengths')
  expect(p).toContain('Peec recommends')
  expect(p).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
  expect(buildPrompt(D, ['why: 12% is not in the data'])).toContain('12% is not in the data')
})
test('parses direct, fenced and wrapped JSON', () => {
  expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
  expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  expect(parseModelJson('Here you go: {"a":3} done')).toEqual({ a: 3 })
  expect(parseModelJson('no json')).toBeNull()
})
```


`lib/aeo-outbound/grounding.test.ts`:
```ts
import { expect, test } from 'vitest'
import { groundingFlags } from './grounding'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const D = { brands: [{ name: '7-Eleven' }], ownDomains: ['example.com'], gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], window: { start: '2026-10-01', end: '2026-10-08' } } as unknown as SnapshotData
const base: Slots = { category: 'c', market: 'm', headline: 'Ranks #3 of 12 with 15.1% visibility', summary: 's', context: '7-Eleven leads.', competitive_bullets: [{ lead: 'a', text: '1,989 chats on example.com in 2026' }, { lead: 'b', text: 'c' }], sources_bullets: [{ lead: 'a', text: 'alpha.com' }, { lead: 'b', text: 'c' }], why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n' }
const allowed = 'AI visibility 15.1% | rank #3 of 12 | own site 1,989 chats'

test('numbers in the data and exempt numbers pass', () => {
  expect(groundingFlags(base, D, allowed)).toEqual([])
})
test('a number not in the data is flagged with its field', () => {
  const s = { ...base, why: 'Visibility rose 12.5% this month' }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: "12.5%" is not in the Peec data'])
})
test('a long dash is flagged', () => {
  const s = { ...base, why: `Strong ${String.fromCharCode(0x2014)} for now` }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: contains a long dash; use a period or comma'])
})
test('a dash in a code-set field or a roster brand name is not flagged', () => {
  const dash = String.fromCharCode(0x2013)
  const d = { ...D, brands: [{ name: `Alpha${dash}Beta` }] } as unknown as SnapshotData
  const s = { ...base, category: `Fin${dash}tech`, context: `Alpha${dash}Beta leads.` }
  expect(groundingFlags(s, d, allowed)).toEqual([])
})
test('an unknown domain is flagged', () => {
  const s = { ...base, why: 'See competitor.io for more' }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: "competitor.io" is not a domain in the Peec data'])
})
```

- [ ] **Step 2: Run to see them fail**, then **implement**:

`lib/aeo-outbound/prompt.ts`:
```ts
// The prompt that replaces Ryan's Glean skill (spec §6). Rules restated from his skill's Writing rules and
// Fixed document format, plus the strict number rules of lib/peec/content-impact-synopsis.ts:225-227.
import { DECISIONS } from './config'
import type { SnapshotData } from './metrics'

const n = (x: number) => x.toLocaleString('en-US')
const p1 = (x: number) => `${x.toFixed(1)}%`

export function dataBlock(d: SnapshotData): string {
  const lines = [
    `Brand: ${d.brand}`,
    `Category: ${d.category ?? 'not in Peec'}`,
    `Market: ${d.market ?? 'not in Peec'}`,
    `Data window: ${d.windowLabel}`,
    `Key metrics: ${d.kpis.map((k) => `${k.label} ${k.value}`).join('; ')}`,
    `Competitors tracked in Peec: ${d.competitorsTracked}`,
    `Brands by AI visibility (rank, name, visibility, share of voice): ${d.brands.slice(0, 10).map((b) => `#${b.rank} ${b.name} ${p1(b.visibilityPct)}${b.sovPct !== null ? ` / ${p1(b.sovPct)}` : ''}`).join('; ') || 'none'}`,
    `Gap to each brand ranked above (visibility points, share of voice points): ${d.leaderGaps.map((g) => `${g.name} ${g.visibilityPoints} points${g.sovPoints !== null ? `, ${g.sovPoints} points` : ''}`).join('; ') || 'none'}`,
    `Own site retrievals (answers that retrieved the brand's own site): ${n(d.ownRetrievedChats)}${d.ownRetrievedPct !== null ? `, which is ${p1(d.ownRetrievedPct)} of answers` : ''}`,
    `Source types by share of retrievals: ${d.sourceMix.map((s) => `${s.label} ${p1(s.pct)}`).join('; ') || 'none'}`,
    `Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): ${d.gapDomains.map((g) => `${g.domain} ${n(g.retrievedChats)}`).join('; ') || 'none'}`,
    `Peec recommended actions (title, impact): ${d.actions.map((a) => `${a.title} (${a.impact})`).join('; ') || 'none'}`,
  ]
  if (DECISIONS.methodologyStatesPromptsAndModels) lines.push(`Prompts tracked: ${d.promptCount ?? 'not reported'}`, `AI models covered: ${d.models.join(', ') || 'not reported'}`)
  return lines.join('\n')
}

export function buildPrompt(d: SnapshotData, violations: string[]): string {
  const peecRows = DECISIONS.peecOpportunityRows
  return `You write a client-facing one-page AI Visibility Snapshot for a prospect brand.

Use ONLY the Data section below. Do not search company documents, Slack, email or any other source. If something is not in the Data section, leave it out.

Writing rules:
- Concise, polished, neutral and client-facing. Plain English. No em dashes or en dashes; use periods and commas.
- Keep findings, hypotheses and recommendations distinct. Use explore, investigate and test. Do not present a full roadmap.
- Use Peec terms where possible: visibility, share of voice, position, retrievals.
- Every number you write must appear exactly in the Data section. Do not calculate new numbers. Do not round.
- Do not infer prompt count, model coverage, timeframe, market, sentiment or causality beyond the Data section.
- Never mention a discovery call, an internal brief or how the data was gathered. No pricing, no agency comparisons, no criticism of prior partners.
- Keep strengths and gaps distinct; never repeat a strength as a gap.

Write these fields:
- headline: one short headline about the most decision-relevant signal.
- summary: one sentence stating that signal, with competitive context when the data supports it.
- context: one sentence naming the leading competitors with their visibility and share of voice, then the brand's rank. If no competitors are tracked, write one sentence about the brand alone.
- competitive_bullets: 2 or 3 bullets of validated strengths (category position, own-site presence, source use). Each has a short "lead" ending in a colon (at most 80 characters) and a "text".
- sources_bullets: 2 or 3 bullets of gaps (visibility gaps to leaders, competitor domain gaps, source mix). Same lead and text shape.
- why: one compact paragraph connecting the pattern to consideration and category discovery, without claiming causality.
- opportunities: exactly 3 items, each { "signal", "opportunity", "workstream" }. Each connects a data signal to something to explore. Workstreams such as Content / AEO, PR / earned media, Technical AEO / SEO.${peecRows > 0 ? ` If the Peec recommended actions list is not "none", exactly ${peecRows} of the 3 must be based on those actions and its signal must start with "Peec recommends".` : ''}
- methodology: one sentence naming the data window, the comparison set${DECISIONS.methodologyStatesPromptsAndModels ? ', the prompt count and the AI models covered' : ''}. Say results are directional.
${DECISIONS.fixedNextStep === null ? '- next_step: one sentence on a next step, such as a full AEO audit.\n' : ''}${DECISIONS.writeSpecificCategory ? '- category: a short, specific category for the brand based on the data.\n' : ''}
Output strictly valid JSON with exactly these keys and no markdown fences or commentary.${violations.length ? `\n\nIMPORTANT: A previous attempt had these problems: ${violations.join(' | ')}. Do not repeat them.` : ''}

Data:
${dataBlock(d)}`
}

export function parseModelJson(raw: string): unknown | null {
  const tryParse = (s: string) => { try { return JSON.parse(s) } catch { return null } }
  const direct = tryParse(raw.trim())
  if (direct !== null) return direct
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) { const v = tryParse(fenced[1].trim()); if (v !== null) return v }
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return tryParse(raw.slice(first, last + 1))
  return null
}
```

`lib/aeo-outbound/grounding.ts`:
```ts
// Post-generation checks (spec §6): numbers must appear in the Data block, domains must be Peec's.
// Modeled on lib/peec/content-impact-synopsis.ts:58-100. Runs on every save too, so notes stay current.
import { DECISIONS } from './config'
import type { SnapshotData } from './metrics'
import { slotEntries, type Slots } from './slots'

const NUM = /#?\d[\d,]*(?:\.\d+)?%?/g
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi
const norm = (t: string) => t.replace(/[#%,]/g, '')
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
/** Paths set by code, not by Glean: a dash there comes from Peec or a fixed sentence and Glean can't fix it. */
const CODE_SET = new Set(['category', 'market', ...(DECISIONS.fixedNextStep !== null ? ['next_step'] : [])])

export function groundingFlags(slots: Slots, d: SnapshotData, dataText: string): string[] {
  const allowedNums = new Set((dataText.match(NUM) ?? []).map(norm))
  for (const y of [d.window.start, d.window.end]) allowedNums.add(y.slice(0, 4))
  const allowedDomains = new Set([...d.ownDomains, ...d.gapDomains.map((g) => g.domain), ...(dataText.match(DOMAIN) ?? [])].map((x) => x.toLowerCase()))
  const exemptNames = [...d.brands.map((b) => b.name), ...allowedDomains].filter(Boolean).sort((a, b) => b.length - a.length)
  const flags: string[] = []
  for (const [path, value] of slotEntries(slots)) {
    let text = value
    for (const name of exemptNames) text = text.split(name).join(' ')
    for (const m of value.match(DOMAIN) ?? []) if (!allowedDomains.has(m.toLowerCase())) flags.push(`${path.split('.')[0]}: "${m}" is not a domain in the Peec data`)
    for (const m of text.match(NUM) ?? []) if (!allowedNums.has(norm(m))) flags.push(`${path.split('.')[0]}: "${m}" is not in the Peec data`)
    if (!CODE_SET.has(path) && DASHES.test(text)) flags.push(`${path.split('.')[0]}: contains a long dash; use a period or comma`)
  }
  return [...new Set(flags)]
}
```

Run: `npx vitest run lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/grounding.test.ts` → PASS. Commit:

```bash
git add lib/aeo-outbound/prompt.ts lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/grounding.ts lib/aeo-outbound/grounding.test.ts
git commit -m "feat(aeo-outbound): prompt from Ryan's rules and the number and domain checks"
git push
```

### Task 3.3: Generation pipeline and the two routes

**Files:**
- Create: `lib/aeo-outbound/generate.ts`, `app/api/aeo-outbound/generate/route.ts`, `app/api/aeo-outbound/projects/route.ts`
- Test: `lib/aeo-outbound/generate.test.ts`, `app/api/aeo-outbound/generate/route.test.ts`, `app/api/aeo-outbound/projects/route.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `generateSnapshot(projectId, deps: { peec: PeecClient; glean: (prompt, signal) => Promise<GleanReply>; deadline: number; now: () => number }) → Promise<{ ok: true; brandName; data; slots; notes } | { ok: false; error; brandName: string | null }>`; route `POST /api/aeo-outbound/generate` per spec §7a; route `GET /api/aeo-outbound/projects`.

- [ ] **Step 1: Write the failing pipeline test** `lib/aeo-outbound/generate.test.ts`, covering: success → draft with notes; a searched reply retried once then a second searched reply fails with `Copy generation used outside sources. Rerun.`; two shape failures fail with `Copy generation failed. Rerun.`; grounding-only violations save as draft with the violations in `notes`; a grounding-only first answer survives a broken second; a Glean HTTP error is retried then reported as a copy failure; a passed deadline is `Timed out at step N`; a missing profile gives `Needs validation` slots; a second Glean attempt is skipped with under 60 s left; a `PeecError` fails with its message and `brandName` null. Use a fake `PeecClient` built from the Task 1.3 `fakePeec` helper (copy it into this file) and a fake `glean` returning scripted `GleanReply` values.

```ts
import { expect, test, vi } from 'vitest'
import { PeecClient } from './peec'
import { generateSnapshot } from './generate'
import type { GleanReply } from './glean'

// fakePeec and its routes: copy exactly from lib/aeo-outbound/pull.test.ts (Task 1.3 Step 1), including PROJECTS, ROSTER and base.
type Route = (url: URL, body: Record<string, unknown> | null) => unknown
function fakePeec(routes: Record<string, Route>) {
  const fetch = async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u)); const path = url.pathname.replace('/customer/v1', '')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    const offset = Number(body?.offset ?? url.searchParams.get('offset') ?? 0)
    const all = routes[path]?.(url, body)
    const data = Array.isArray(all) ? (offset === 0 ? all : []) : all
    return new Response(JSON.stringify(Array.isArray(all) ? { data } : data), { status: 200 })
  }
  return new PeecClient('skc-x', { fetch: fetch as typeof globalThis.fetch })
}
const base: Record<string, Route> = {
  '/projects': () => [{ id: 'or_a', name: 'Alpha', status: 'PITCH' }],
  '/brands': () => [{ id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] }, { id: 'kw_c1', name: 'Rival', is_own: false, domains: ['rival.com'] }],
  '/project-profile': () => ({ profile: { industry: 'Fintech', target_markets: [{ location: 'United States' }] } }),
  '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'example.com', date: '2026-10-05', retrieved_chat_count: 3 }] : [{ domain: 'example.com', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 9, retrieved_percentage: 0.2 }]),
  '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.1 }, { brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.261, share_of_voice: 0.841, position: 2 }]),
  '/model-channels': () => [],
  '/actions/list': () => [],
  '/prompts': () => ({ data: [], total_count: 100 }),
}
const GOOD = JSON.stringify({
  headline: 'Example Co ranks #2 of 2', summary: 'Example Co has 15.1% visibility.', context: 'Rival leads at 26.1%.',
  competitive_bullets: [{ lead: 'Position:', text: 'Ranks #2.' }, { lead: 'Own site:', text: 'Retrieved in 5 answers.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'Trails Rival by 11 points.' }, { lead: 'Mix:', text: 'You leads the mix.' }],
  why: 'Why.', opportunities: [0, 1, 2].map(() => ({ signal: 'Signal', opportunity: 'Explore', workstream: 'Content / AEO' })),
  methodology: 'Peec data for the window, directional.', next_step: 'A full AEO audit.',
})
const reply = (text: string, searched = false): GleanReply => ({ text, searched })
const deps = (glean: ReturnType<typeof vi.fn>, now = () => 0) => ({ peec: fakePeec(base), glean, deadline: 270_000, now })

test('success: a draft with code-set category and market', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  expect(r.ok && r.slots.category).toBe('Fintech')
  expect(r.ok && r.slots.market).toBe('United States')
  expect(r.ok && r.brandName).toBe('Example Co')
})
test('a searched reply is retried once; a second searched reply fails', async () => {
  const glean = vi.fn(async () => reply(GOOD, true))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r).toMatchObject({ ok: false, error: 'Copy generation used outside sources. Rerun.' })
  expect(glean).toHaveBeenCalledTimes(2)
})
test('two shape failures fail', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply('{"headline":5}'))))
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('grounding-only problems still save as a draft, with notes', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify(bad)))))
  expect(r.ok && r.notes.join(' ')).toContain('"42.0%" is not in the Peec data')
})
test('no second Glean attempt with under 60s left', async () => {
  let t = 0
  const glean = vi.fn(async () => { t = 230_000; return reply('{}') })
  const r = await generateSnapshot('or_a', deps(glean, () => t))
  expect(glean).toHaveBeenCalledTimes(1)
  expect(r.ok).toBe(false)
})
test('a grounding-only first answer survives a broken second answer', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const glean = vi.fn().mockResolvedValueOnce(reply(JSON.stringify(bad))).mockResolvedValueOnce(reply('not json'))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok && r.slots.why).toBe('Visibility rose 42.0% last year.')
})
test('a grounding-only first answer survives a second answer that times out', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const glean = vi.fn()
    .mockResolvedValueOnce(reply(JSON.stringify(bad)))
    .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok && r.slots.why).toBe('Visibility rose 42.0% last year.')
})
test('a Glean HTTP error is retried, then reported as a copy failure', async () => {
  const glean = vi.fn(async () => { throw new Error('Glean chat error 500') })
  const r = await generateSnapshot('or_a', deps(glean))
  expect(glean).toHaveBeenCalledTimes(2)
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('a deadline already passed fails as a timeout at the step it reached', async () => {
  const r = await generateSnapshot('or_a', { peec: new PeecClient('skc-x', { now: () => 10, deadline: 5 }), glean: vi.fn(), deadline: 5, now: () => 10 })
  expect(r).toMatchObject({ ok: false, error: 'Timed out at step 1' })
})
test('no profile: category and market slots say Needs validation', async () => {
  const peec = fakePeec({ ...base, '/project-profile': () => ({ profile: null }) })
  const r = await generateSnapshot('or_a', { peec, glean: vi.fn(async () => reply(GOOD)), deadline: 270_000, now: () => 0 })
  expect(r.ok && [r.slots.category, r.slots.market]).toEqual(['Needs validation', 'Needs validation'])
})
test("an upstream 5xx body that says 'timed out' keeps its scrubbed reason", async () => {
  const peec = new PeecClient('skc-x', { fetch: (async () => new Response('upstream request timed out', { status: 504 })) as typeof globalThis.fetch })
  const r = await generateSnapshot('or_a', { peec, glean: vi.fn(), deadline: 270_000, now: () => 0 })
  expect(!r.ok && r.error).toContain('HTTP 504')
})
test('a Peec failure fails with its reason', async () => {
  const r = await generateSnapshot('or_zzz', deps(vi.fn()))
  expect(r).toMatchObject({ ok: false, brandName: null })
  expect(!r.ok && r.error).toContain('not available to this tool')
})
```

- [ ] **Step 2: Implement** `lib/aeo-outbound/generate.ts`:

```ts
// Spec §6 and §7a: pull, compute, write copy with at most two Glean attempts inside the deadline, enforce the
// search guard and the shape check, keep grounding problems as notes.
import { DECISIONS, NEEDS_VALIDATION } from './config'
import { buildSnapshotData, type SnapshotData } from './metrics'
import { PeecClient, PeecError } from './peec'
import { pullSnapshot } from './pull'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import { groundingFlags } from './grounding'
import { validateGeneratedSlots, type Slots } from './slots'
import type { GleanReply } from './glean'

export type GenerationResult =
  | { ok: true; brandName: string; data: SnapshotData; slots: Slots; notes: string[] }
  | { ok: false; error: string; brandName: string | null }

export async function generateSnapshot(
  projectId: string,
  deps: { peec: PeecClient; glean: (prompt: string, signal: AbortSignal) => Promise<GleanReply>; deadline: number; now: () => number },
): Promise<GenerationResult> {
  let brandName: string | null = null
  let step = 0
  try {
    const pull = await pullSnapshot(deps.peec, projectId, deps.now(), (s) => { step = s })
    brandName = pull.ownBrand.name
    const data = buildSnapshotData(pull, new Date(deps.now()).toISOString())
    const fixed = {
      category: data.category ?? NEEDS_VALIDATION,
      market: data.market ?? NEEDS_VALIDATION,
      ...(DECISIONS.fixedNextStep !== null ? { next_step: DECISIONS.fixedNextStep } : {}),
    }
    const block = dataBlock(data)
    let problems: string[] = []
    let searched = 0
    /** A shape-valid reply whose only problem was grounding: kept so a worse second attempt can't lose it. */
    let groundedFallback: { slots: Slots; flags: string[] } | null = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deps.deadline - deps.now()
      if (attempt === 2 && left < 60_000) break
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(left, 1))
      let replyText: string
      try {
        const r = await deps.glean(buildPrompt(data, problems), controller.signal)
        if (r.searched) { searched++; problems = ['the answer used sources outside the Data section']; continue }
        replyText = r.text
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') { if (groundedFallback) break; throw e }
        problems = [`the previous answer could not be read (${String((e as Error)?.message ?? e).slice(0, 80)})`]
        continue
      } finally {
        clearTimeout(timer)
      }
      const parsed = parseModelJson(replyText) as Record<string, unknown> | null
      const fixedNow = { ...fixed }
      if (parsed && DECISIONS.writeSpecificCategory && typeof parsed.category === 'string') fixedNow.category = parsed.category
      const checked = validateGeneratedSlots(parsed, fixedNow)
      if (!checked.ok) { problems = checked.errors; continue }
      const flags = groundingFlags(checked.slots, data, block)
      if (!flags.length) return { ok: true, brandName, data, slots: checked.slots, notes: data.notes }
      groundedFallback = { slots: checked.slots, flags }
      if (attempt === 1 && deps.deadline - deps.now() >= 60_000) { problems = flags; continue }
      break
    }
    if (groundedFallback) return { ok: true, brandName, data, slots: groundedFallback.slots, notes: [...data.notes, ...groundedFallback.flags] }
    if (searched === 2) return { ok: false, error: 'Copy generation used outside sources. Rerun.', brandName }
    return { ok: false, error: 'Copy generation failed. Rerun.', brandName }
  } catch (e) {
    // Only this client's own timeout messages (peec.ts), never an upstream body that happens to say "timed out".
    const timedOut = (e as Error)?.name === 'AbortError' || (e instanceof PeecError && /: (timed out after \d+ms|deadline reached)$/.test(e.message))
    if (timedOut) return { ok: false, error: `Timed out at step ${step}`, brandName }
    if (e instanceof PeecError) return { ok: false, error: e.message, brandName }
    return { ok: false, error: `Generation failed at step ${step}: ${(e as Error)?.message ?? String(e)}`.slice(0, 300), brandName }
  }
}
```

Note on the grounding-only case: a shape-valid reply with only grounding flags is kept as `groundedFallback`. If time allows, attempt 2 retries with the flags quoted back. If attempt 2 is clean it wins; anything else (flags again, a searched or unreadable reply, no time) returns the kept draft with its flags. A grounding-only result therefore never fails, as spec §6 says.

- [ ] **Step 3: Run the pipeline test** → PASS. Commit.

- [ ] **Step 4: Write the failing route tests.** `app/api/aeo-outbound/generate/route.test.ts`, using the route test pattern at `app/api/export/pdf/route.test.ts:1-30` (hoisted mocks, `NextRequest`, `vi.mocked(auth)`):

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  listProjects: vi.fn(), generateSnapshot: vi.fn(),
  insert: vi.fn(), insertArgs: vi.fn(), stale: vi.fn(), draft: vi.fn(), failed: vi.fn(), findGenerating: vi.fn(),
}))
vi.mock('@/lib/aeo-outbound/pull', async (o) => ({ ...(await o<object>()), listProjects: m.listProjects }))
vi.mock('@/lib/aeo-outbound/generate', () => ({ generateSnapshot: m.generateSnapshot }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({
  ...(await o<object>()),
  markStaleGeneratingQuery: () => ({ then: (r: (v: unknown) => void) => r(m.stale()) }),
  insertGeneratingQuery: (v: unknown) => { m.insertArgs(v); return { then: (r: (v: unknown) => void, j: (e: unknown) => void) => { try { r(m.insert()) } catch (e) { j(e) } } } },
  finishDraftQuery: () => ({ then: (r: (v: unknown) => void) => r(m.draft()) }),
  finishFailedQuery: () => ({ then: (r: (v: unknown) => void) => r(m.failed()) }),
  findGeneratingFor: m.findGenerating,
}))

import { POST } from './route'
import { auth } from '@/auth'
import { PeecError } from '@/lib/aeo-outbound/peec'

const post = (b: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://app.example/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', host: 'app.example', ...headers } }))
const as = (email: string, role = 'INTERNAL_ANALYST') => vi.mocked(auth).mockResolvedValue({ user: { role, email, clientSlug: null } } as never)

beforeEach(() => {
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', 'skc-test')
  m.listProjects.mockResolvedValue([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  m.insert.mockReturnValue([{ id: 'row-1' }])
  m.generateSnapshot.mockResolvedValue({ ok: true, brandName: 'Example Co', data: {}, slots: {}, notes: [] })
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

test('403 for no session, non-allowlisted staff, and a foreign Origin', async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  expect((await post({ projectId: 'or_a' })).status).toBe(403)
  as('other@avenuez.com')
  expect((await post({ projectId: 'or_a' })).status).toBe(403)
  as('ryan@avenuez.com')
  expect((await post({ projectId: 'or_a' }, { origin: 'https://evil.example' })).status).toBe(403)
  expect(m.generateSnapshot).not.toHaveBeenCalled()
})
test('400 for a bad body or an unusable project; 502 when Peec fails at the re-check', async () => {
  as('ryan@avenuez.com')
  expect((await post({})).status).toBe(400)
  expect((await post({ projectId: 'or_customer' })).status).toBe(400)
  m.listProjects.mockRejectedValueOnce(new PeecError('[PEEC API] /projects: HTTP 500 ()'))
  expect((await post({ projectId: 'or_a' })).status).toBe(502)
  expect(m.insert).not.toHaveBeenCalled()
})
test('409 with the existing id when one is already generating', async () => {
  as('ryan@avenuez.com')
  m.insert.mockImplementation(() => { throw Object.assign(new Error('dup'), { code: '23505' }) })
  m.findGenerating.mockResolvedValue('row-0')
  const res = await post({ projectId: 'or_a' })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'already-generating', id: 'row-0' })
})
test('200 draft and 200 failed', async () => {
  as('ryan@avenuez.com')
  expect(await (await post({ projectId: 'or_a' })).json()).toEqual({ id: 'row-1', status: 'draft' })
  m.generateSnapshot.mockResolvedValueOnce({ ok: false, error: 'Copy generation failed. Rerun.', brandName: 'Example Co' })
  expect(await (await post({ projectId: 'or_a', rerunOf: 'c7d8e0a1-1111-4111-8111-111111111111' })).json()).toEqual({ id: 'row-1', status: 'failed', error: 'Copy generation failed. Rerun.' })
  expect(m.insertArgs).toHaveBeenLastCalledWith({ projectId: 'or_a', projectName: 'Alpha', createdBy: 'ryan@avenuez.com', rerunOf: 'c7d8e0a1-1111-4111-8111-111111111111' })
})
test('a throw while finishing still fails the row and answers', async () => {
  as('ryan@avenuez.com')
  m.draft.mockImplementationOnce(() => { throw new Error('db down') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await (await post({ projectId: 'or_a' })).json()).toEqual({ id: 'row-1', status: 'failed', error: 'Generation failed. Rerun.' })
  expect(m.failed).toHaveBeenCalled()
})
```

`app/api/aeo-outbound/projects/route.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const m = vi.hoisted(() => ({ listProjects: vi.fn() }))
vi.mock('@/lib/aeo-outbound/pull', async (o) => ({ ...(await o<object>()), listProjects: m.listProjects }))
import { GET } from './route'
import { auth } from '@/auth'
import { PeecError } from '@/lib/aeo-outbound/peec'

beforeEach(() => { vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com'); vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', 'skc-test') })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

test('403 without the allowlist; 200 list; 502 when Peec fails', async () => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'x@avenuez.com' } } as never)
  expect((await GET()).status).toBe(403)
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email: 'ryan@avenuez.com' } } as never)
  m.listProjects.mockResolvedValue([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  const ok = await GET()
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  m.listProjects.mockRejectedValue(new PeecError('down'))
  expect((await GET()).status).toBe(502)
})
```

- [ ] **Step 5: Implement the routes.**

`app/api/aeo-outbound/projects/route.ts`:
```ts
// GET /api/aeo-outbound/projects: Peec projects for the hub dropdown (spec §4). Outside the proxy matcher,
// so it checks the session itself.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { peecFromEnv, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!outboundEmail(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await listProjects(peecFromEnv({ deadline: Date.now() + 50_000 })), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const msg = e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not load projects.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
```

`app/api/aeo-outbound/generate/route.ts`:
```ts
// POST /api/aeo-outbound/generate (spec §7a): {projectId, rerunOf?} → runs the whole pipeline inside the
// request under a 270s deadline and returns {id, status, error?}.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { GENERATION_DEADLINE_MS } from '@/lib/aeo-outbound/config'
import { generateSnapshot } from '@/lib/aeo-outbound/generate'
import { gleanOnce } from '@/lib/aeo-outbound/glean'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { peecFromEnv, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'
import { finishDraftQuery, finishFailedQuery, findGeneratingFor, insertGeneratingQuery, isUniqueViolation, markStaleGeneratingQuery } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const maxDuration = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function POST(req: NextRequest) {
  const started = Date.now()
  const deadline = started + GENERATION_DEADLINE_MS
  const session = await auth()
  const email = outboundEmail(session?.user)
  if (!email || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown = null
  try { body = await req.json() } catch { /* bad request below */ }
  const projectId = (body as { projectId?: unknown } | null)?.projectId
  const rerunOf = (body as { rerunOf?: unknown } | null)?.rerunOf ?? null
  if (typeof projectId !== 'string' || !projectId || (rerunOf !== null && (typeof rerunOf !== 'string' || !UUID.test(rerunOf)))) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  }

  const peec = peecFromEnv({ deadline })
  let project
  try {
    project = (await listProjects(peec)).find((p) => p.id === projectId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not reach Peec.' }, { status: 502 })
  }
  if (!project) return NextResponse.json({ error: "This Peec project can't be used." }, { status: 400 })

  const now = new Date()
  await markStaleGeneratingQuery(projectId, now)
  let id: string
  try {
    id = (await insertGeneratingQuery({ projectId, projectName: project.name, createdBy: email, rerunOf: rerunOf as string | null }))[0].id
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: 'already-generating', id: (await findGeneratingFor(projectId)) ?? null }, { status: 409 })
    throw e
  }

  try {
    const result = await generateSnapshot(projectId, { peec, glean: gleanOnce, deadline, now: Date.now })
    if (result.ok) {
      await finishDraftQuery(id, { brandName: result.brandName, data: result.data, slots: result.slots, notes: result.notes, now: new Date() })
      console.info(`[aeo-outbound] generate id=${id} outcome=draft ms=${Date.now() - started}`)
      return NextResponse.json({ id, status: 'draft' })
    }
    await finishFailedQuery(id, result.error, result.brandName, new Date())
    console.info(`[aeo-outbound] generate id=${id} outcome=failed ms=${Date.now() - started}`)
    return NextResponse.json({ id, status: 'failed', error: result.error })
  } catch (e) {
    // Never leave the row generating: a failed write or an unexpected throw still fails it.
    console.error(`[aeo-outbound] generate id=${id} outcome=error step=finish ms=${Date.now() - started}`, (e as Error)?.message)
    try { await finishFailedQuery(id, 'Generation failed. Rerun.', null, new Date()) } catch { /* logged above; the stale rule still frees the row */ }
    return NextResponse.json({ id, status: 'failed', error: 'Generation failed. Rerun.' })
  }
}
```

- [ ] **Step 6: Run, check, commit, open PR3**

Run: `npx vitest run lib/aeo-outbound app/api/aeo-outbound && perl -e 'alarm 590; exec @ARGV' -- make check`
Expected: all pass.

```bash
git add lib/aeo-outbound/generate.ts lib/aeo-outbound/generate.test.ts app/api/aeo-outbound
git commit -m "feat(aeo-outbound): generation pipeline and the generate and projects routes"
git push
gh pr create --base aeo-outbound-audit --draft --title "feat(aeo-outbound): generation → aeo-outbound-audit" --body-file /tmp/pr3.md
```

---

## Part 4 (PR4): hub, editor and the public link

Cut from `aeo-outbound-audit` after PR3 merges: `git checkout -b feat/aeo-outbound-ui origin/aeo-outbound-audit`.

### Task 4.1: View and slots routes

**Files:**
- Create: `app/api/aeo-outbound/reports/[id]/view/route.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.ts`
- Test: `app/api/aeo-outbound/reports/[id]/view/route.test.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.test.ts`

**Interfaces:**
- Consumes: `getReport`, `saveSlotsQuery` (1.6), `applySlotPatch` (1.5), `renderSnapshotHtml` (2.3), `groundingFlags`, `dataBlock` (3.2).
- Produces: `GET .../view?mode=preview` → HTML (draft hooks unless `mode=preview`; frozen HTML when approved, or the preview render of an approved row when `mode=preview`), headers `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `Content-Security-Policy: sandbox allow-scripts`; `PATCH .../slots` per spec §9a.

- [ ] **Step 1: Write the failing tests.** View: 403 without the allowlist; 404 for a malformed, unknown or discarded id; 404 for generating or failed; draft HTML contains `data-slot` and the three headers; `?mode=preview` has no `data-slot` and no share button; approved returns `row.html` byte for byte, and approved with `?mode=preview` returns the preview without the share button. Slots: 403 without the allowlist and for an `Origin` of `https://evil.example`; 404; 409 `not-draft` for an approved row; 400 for a bad path, an empty value and an 81-character lead; 409 `stale` with the current revision when `saveSlotsQuery` returns no rows; 200 `{revision, notes, needsValidation}` on success, where `notes` equal `data.notes` plus fresh grounding flags. Mock `@/lib/aeo-outbound/store` the same way as Task 3.3 Step 4.

- [ ] **Step 2: Implement.** The route handler signature for a dynamic segment in this Next version is `(req: NextRequest, ctx: { params: Promise<{ id: string }> })`. Confirm it against `node_modules/next/dist/server/route-modules/app-route/module.d.ts` after `npm ci`, before writing, and use what that file declares.

`app/api/aeo-outbound/reports/[id]/view/route.ts`:
```ts
import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId } from '@/lib/aeo-outbound/store'
import { renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': 'sandbox allow-scripts' }
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user)) return new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  if (!isReportId(id)) return notFound()
  const row = await getReport(id).catch(() => undefined)
  if (!row) return notFound()
  const preview = req.nextUrl.searchParams.get('mode') === 'preview'
  if (row.status === 'approved' && row.html) {
    // The editor shows approved rows as a preview: the frozen page's share button would copy the srcdoc
    // placeholder address there (T2). The public link serves row.html itself.
    if (preview && row.data && row.slots && row.approvedAt) return new Response(renderSnapshotHtml(row.data, row.slots, 'preview', fmtEasternDay(row.approvedAt)), { headers: HEADERS })
    return new Response(row.html, { headers: HEADERS })
  }
  if (row.status !== 'draft' || !row.data || !row.slots) return notFound()
  return new Response(renderSnapshotHtml(row.data, row.slots, preview ? 'preview' : 'draft', fmtEasternDay(new Date(row.data.generatedAt))), { headers: HEADERS })
}
```

`app/api/aeo-outbound/reports/[id]/slots/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery } from '@/lib/aeo-outbound/store'
import { applySlotPatch, needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user) || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: { path?: unknown; value?: unknown; revision?: unknown } | null = null
  try { body = await req.json() } catch { /* below */ }
  if (!body || typeof body.path !== 'string' || !Number.isInteger(body.revision)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  const row = await getReport(id).catch(() => undefined)
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (row.status !== 'draft' || !row.slots || !row.data) return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
  const patched = applySlotPatch(row.slots, body.path, body.value)
  if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
  const notes = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
  const saved = await saveSlotsQuery(id, body.revision as number, patched.slots, notes)
  if (!saved.length) return NextResponse.json({ error: 'stale', revision: (await getReport(id))?.revision ?? null }, { status: 409 })
  return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots) })
}
```

- [ ] **Step 3: Run tests** → PASS. Commit and push with `-u`.

### Task 4.2: Server actions and the public link route

**Files:**
- Create: `app/actions/aeo-outbound.ts`, `app/snapshot/[token]/route.ts`
- Test: `app/actions/aeo-outbound.test.ts`, `app/snapshot/[token]/route.test.ts`

**Interfaces:**
- Produces: `approveSnapshotAction(id, revision) → { ok: true; token } | { ok: false; error }`, `revokeSnapshotAction(id) → { ok } | { ok: false; error }`, `discardSnapshotAction(id) → same`; `GET /snapshot/{token}`.

- [ ] **Step 1: Write the failing tests.** Actions (pattern `app/actions/chart-notes.test.ts:1-40`, plus `vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ host: 'app.example' })) }))` because `caller()` reads the Origin; `vi.mock('next/cache', () => ({ updateTag: vi.fn() }))` as there). Actions return `{ ok: false, error: 'forbidden' }` instead of throwing, the repo's precedent (`app/actions/chart-notes.test.ts` `FORBIDDEN`); spec §8 and §15 are amended to match. Each action returns `forbidden` for no session, a client role, non-allowlisted staff and an `Origin` of `https://evil.example`, with no write called; a malformed id or a non-integer revision returns `not found` with no query; approve refuses `Needs validation` (`{ ok: false, error: 'Fill in every "Needs validation" first.' }`) when `DECISIONS.needsValidationBlocksApprove`; approve with a stale revision (query returns no rows) gives `{ ok: false, error: 'stale' }`; approve success renders `'final'` HTML (contains `class="share-btn"`, no `data-slot`) and returns a 24-character token; revoke and discard call their queries and return `{ ok: true }`; `updateTag('db')` is called after each successful write. Public route: unknown, malformed, revoked and discarded tokens return the identical 404 body; a live token returns the stored HTML byte for byte with `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Content-Security-Policy: sandbox allow-scripts`.

- [ ] **Step 2: Implement.**

`app/actions/aeo-outbound.ts`:
```ts
'use server'

import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { auth } from '@/auth'
import { DECISIONS } from '@/lib/aeo-outbound/config'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { approveQuery, discardQuery, getReport, isReportId, revokeQuery } from '@/lib/aeo-outbound/store'
import { newShareToken } from '@/lib/aeo-outbound/token'

type Fail = { ok: false; error: string }

async function caller(): Promise<string | null> {
  const session = await auth()
  const email = outboundEmail(session?.user)
  if (!email) return null
  const h = await headers()
  return originAllowed(h.get('origin'), h.get('host')) ? email : null
}

export async function approveSnapshotAction(id: string, revision: number): Promise<{ ok: true; token: string } | Fail> {
  const email = await caller()
  if (!email) return { ok: false, error: 'forbidden' }
  if (!isReportId(id) || !Number.isInteger(revision)) return { ok: false, error: 'not found' }
  const row = await getReport(id)
  if (!row || row.status !== 'draft' || !row.data || !row.slots) return { ok: false, error: 'not found' }
  if (DECISIONS.needsValidationBlocksApprove && needsValidationPaths(row.slots).length) return { ok: false, error: 'Fill in every "Needs validation" first.' }
  const now = new Date()
  const html = renderSnapshotHtml(row.data, row.slots, 'final', fmtEasternDay(now))
  const done = await approveQuery(id, revision, { html, token: newShareToken(), by: email, now })
  if (!done.length || !done[0].shareToken) return { ok: false, error: 'stale' }
  updateTag('db')
  return { ok: true, token: done[0].shareToken }
}

export async function revokeSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (!email) return { ok: false, error: 'forbidden' }
  if (!isReportId(id)) return { ok: false, error: 'not found' }
  const done = await revokeQuery(id, email, new Date())
  if (!done.length) return { ok: false, error: 'not found' }
  updateTag('db')
  return { ok: true }
}

export async function discardSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (!email) return { ok: false, error: 'forbidden' }
  if (!isReportId(id)) return { ok: false, error: 'not found' }
  const done = await discardQuery(id, email, new Date())
  if (!done.length) return { ok: false, error: 'not found' }
  updateTag('db')
  return { ok: true }
}
```

`app/snapshot/[token]/route.ts`:
```ts
// The public, no-login link (spec §8). Outside the proxy matcher (proxy.ts:24-26). The token is the credential;
// unknown, revoked and discarded tokens get the same response.
import { isShareTokenShape } from '@/lib/aeo-outbound/token'
import { getLiveByToken } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BASE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }
const GONE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Not available</title></head><body style="background:#000;color:#A6A6A6;font-family:sans-serif;padding:48px">This link is not available.</body></html>'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const html = isShareTokenShape(token) ? await getLiveByToken(token).catch(() => undefined) : undefined
  if (!html) return new Response(GONE, { status: 404, headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8' } })
  return new Response(html, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': 'sandbox allow-scripts' } })
}
```

- [ ] **Step 3: Run tests** → PASS. Confirm `proxy.test.ts` and `lib/auth/protected-pages.test.ts` still pass unchanged. Commit and push.

### Task 4.3: Save queue (pure logic)

**Files:**
- Create: `components/aeo-outbound/save-queue.ts`
- Test: `components/aeo-outbound/save-queue.test.ts`

**Interfaces:**
- Produces: `class SaveQueue(send: (path, value, revision) => Promise<SendResult>, revision: number, onState: (s: SaveState) => void, sleep?)`, with `markDirty(path)`, `edit(path, value)`, `stop(message)`, `state`. `SendResult = { kind: 'ok'; revision } | { kind: 'bad'; error } | { kind: 'stop' } | { kind: 'retry' }`. `SaveState = { dirty: boolean; saving: boolean; revision: number; error: string | null; stopped: boolean }`. A path stays dirty from its first keystroke until an edit sent after its last keystroke is saved, so a save of field A never clears field B.

- [ ] **Step 1: Write the failing test** (spec §9a and §15):

```ts
import { expect, test, vi } from 'vitest'
import { SaveQueue, type SendResult } from './save-queue'

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }
test('one PATCH at a time, the latest value per path, revision carried forward', async () => {
  const calls: [string, string, number][] = []
  let rev = 3
  const send = vi.fn(async (p: string, v: string, r: number): Promise<SendResult> => { calls.push([p, v, r]); return { kind: 'ok', revision: ++rev } })
  const q = new SaveQueue(send, 3, () => {})
  q.markDirty('headline'); q.edit('headline', 'a'); q.edit('headline', 'b'); q.markDirty('why'); q.edit('why', 'c')
  await flush()
  expect(calls.map(([, , r]) => r)).toEqual(calls.map((_, i) => 3 + i))
  expect(calls.at(-1)).toEqual(['why', 'c', 3 + calls.length - 1])
  expect(calls.filter(([p]) => p === 'headline').at(-1)?.[1]).toBe('b')
  expect(q.state).toMatchObject({ dirty: false, saving: false, revision: rev })
})
test('a keystroke marks its field dirty before any edit message', () => {
  const q = new SaveQueue(vi.fn(), 0, () => {})
  q.markDirty('why')
  expect(q.state.dirty).toBe(true)
})
test("saving field A never clears field B that is still being typed", async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'ok', revision: 1 })), 0, () => {})
  q.markDirty('headline'); q.edit('headline', 'a')
  q.markDirty('why')
  await flush()
  expect(q.state.dirty).toBe(true)
  q.edit('why', 'w'); await flush()
  expect(q.state.dirty).toBe(false)
})
test('a keystroke after an edit was sent keeps the field dirty', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'ok', revision: 1 })), 0, () => {})
  q.markDirty('why'); q.edit('why', 'a'); q.markDirty('why')
  await flush()
  expect(q.state.dirty).toBe(true)
})
test('5xx and network errors retry with backoff; 400 shows the reason and keeps the edit dirty', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  const send = vi.fn<(p: string, v: string, r: number) => Promise<SendResult>>()
    .mockResolvedValueOnce({ kind: 'retry' }).mockResolvedValueOnce({ kind: 'ok', revision: 1 })
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  expect(sleep).toHaveBeenCalledWith(1000)
  expect(q.state.revision).toBe(1)
  const bad = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'bad', error: 'Keep this under 80 characters.' })), 0, () => {})
  bad.markDirty('competitive_bullets.0.lead'); bad.edit('competitive_bullets.0.lead', 'x'.repeat(81)); await flush()
  expect(bad.state).toMatchObject({ dirty: true, error: 'Keep this under 80 characters.', stopped: false })
})
test('403, 404 and 409 stop the queue for good', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'stop' })), 0, () => {})
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  expect(q.state.stopped).toBe(true)
  q.edit('why', 'y'); await flush()
  expect(q.state.stopped).toBe(true)
})
```

- [ ] **Step 2: Implement** `components/aeo-outbound/save-queue.ts`:

```ts
// The editor's single save queue (spec §9a): one PATCH at a time, newest value per path, the revision from each
// 200 carried into the next request. A field is dirty from its first keystroke until an edit sent after its last
// keystroke is saved, so Approve (disabled while dirty or saving) can never approve text Ryan is still typing.
export type SendResult = { kind: 'ok'; revision: number } | { kind: 'bad'; error: string } | { kind: 'stop' } | { kind: 'retry' }
export interface SaveState { dirty: boolean; saving: boolean; revision: number; error: string | null; stopped: boolean }
const BACKOFF = [1000, 2000, 4000]

export class SaveQueue {
  private pending = new Map<string, { value: string; stamp: number }>()
  private typed = new Map<string, number>()
  private dirtyPaths = new Set<string>()
  private running = false
  private attempt = 0
  state: SaveState

  constructor(
    private readonly send: (path: string, value: string, revision: number) => Promise<SendResult>,
    revision: number,
    private readonly onState: (s: SaveState) => void,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.state = { dirty: false, saving: false, revision, error: null, stopped: false }
  }

  private set(p: Partial<SaveState>) {
    this.state = { ...this.state, ...p, dirty: this.dirtyPaths.size > 0 || this.pending.size > 0 }
    this.onState(this.state)
  }

  markDirty(path: string) {
    if (this.state.stopped) return
    this.typed.set(path, (this.typed.get(path) ?? 0) + 1)
    this.dirtyPaths.add(path)
    this.set({})
  }

  edit(path: string, value: string) {
    if (this.state.stopped) return
    this.pending.delete(path)
    this.pending.set(path, { value, stamp: this.typed.get(path) ?? 0 })
    this.set({ error: null })
    void this.run()
  }

  stop(message: string) { this.set({ stopped: true, saving: false, error: message }) }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      while (this.pending.size && !this.state.stopped) {
        const [path, item] = this.pending.entries().next().value as [string, { value: string; stamp: number }]
        this.set({ saving: true })
        const r = await this.send(path, item.value, this.state.revision).catch((): SendResult => ({ kind: 'retry' }))
        if (r.kind === 'ok') {
          if (this.pending.get(path) === item) this.pending.delete(path)
          if ((this.typed.get(path) ?? 0) === item.stamp && !this.pending.has(path)) this.dirtyPaths.delete(path)
          this.attempt = 0
          this.set({ revision: r.revision, saving: false, error: null })
        } else if (r.kind === 'bad') {
          if (this.pending.get(path) === item) this.pending.delete(path)
          this.set({ saving: false, error: r.error })
          return
        } else if (r.kind === 'stop') {
          this.stop('This snapshot changed. Reload.')
          return
        } else {
          this.set({ saving: false, error: "Couldn't save, retrying" })
          await this.sleep(BACKOFF[this.attempt] ?? 10_000)
          this.attempt++
        }
      }
    } finally {
      this.running = false
    }
  }
}
```

- [ ] **Step 3: Run tests** → PASS. Commit and push.

### Task 4.4: Hub and editor pages and components, tools entry

**Files:**
- Create: `components/aeo-outbound/status.ts`, `components/aeo-outbound/hub.tsx`, `components/aeo-outbound/editor.tsx`, `components/aeo-outbound/no-access.tsx`, `app/tools/new-business/page.tsx`, `app/tools/new-business/[reportId]/page.tsx`
- Test: `components/aeo-outbound/status.test.ts`, `components/aeo-outbound/editor.test.tsx`
- Modify: `lib/constants.ts` `TEAMS` (append one team)

**Interfaces:**
- Consumes: `displayStatus`, `listReports`, `getReport` (1.6); actions (4.2); `SaveQueue` (4.3).
- Produces: `STATUS_UI: Record<DisplayStatus, { label: string; className: string }>`, `actionsFor(status) → ('open' | 'copy' | 'revoke' | 'rerun' | 'discard')[]`; `type HubRow = { id; brand; projectId; projectName; status: DisplayStatus; createdAt: string; approvedAt: string | null; error: string | null; token: string | null }`.

- [ ] **Step 1: Write the failing tests.** (Both component tests mock `next/navigation` with `vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))`, mock `fetch`, and mock `@/app/actions/aeo-outbound`.) `hub.test.tsx`: `router.refresh()` is called on mount, after each action, and on a 5 s interval only while a row is `generating` (fake timers); each §7a response shows its message (`200 draft` pushes `/tools/new-business/{id}`; `400` "This Peec project can't be used"; `403` the access message; `409` pushes the existing id, or refreshes when `id` is null; `502` "Peec is unavailable. Try again"; network error "Lost connection. Refreshing" then `refresh`); a non-200 from the projects route shows "Peec is unavailable. Retry" while the table still renders; Rerun posts `{ projectId, rerunOf }` and opens the new draft. `status.test.ts`: `actionsFor` returns exactly the spec §10 table (Draft: open, rerun, discard; Live: open, copy, revoke, rerun; Revoked: open, rerun; Failed: rerun, discard; Generating: none). `editor.test.tsx` (React Testing Library): render `<OutboundEditor>` with a draft, then
  - a `message` event whose `source` is not the iframe's `contentWindow` is ignored (no PATCH);
  - a `{type:'dirty', path}` from the iframe disables Approve;
  - Approve is disabled while the `needsValidation` prop is non-empty, and enables after a save whose response returns `needsValidation: []`;
  - a save's response replaces the notes in the drawer;
  - Approve posts `{type:'flush'}` to the iframe first, and shows "Saving. Try again in a moment." if a field is still dirty;
  - approve results `stale` and `not found` show "This snapshot changed. Reload." and "This snapshot no longer exists.";
  - Rerun calls `fetch('/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify({ projectId, rerunOf: id }) })`.

  Mock `fetch` and the actions module.

- [ ] **Step 2: Implement `status.ts`**:

```ts
import type { DisplayStatus } from '@/lib/aeo-outbound/store'
export type HubAction = 'open' | 'copy' | 'revoke' | 'rerun' | 'discard'
export const STATUS_UI: Record<DisplayStatus, { label: string; className: string }> = {
  generating: { label: 'Generating', className: 'bg-white/10 text-white' },
  draft: { label: 'Draft', className: 'bg-[#FFFC60]/15 text-[#FFFC60]' },
  live: { label: 'Live', className: 'bg-[#60FF80]/15 text-[#60FF80]' },
  revoked: { label: 'Revoked', className: 'bg-white/5 text-text-muted' },
  failed: { label: 'Failed', className: 'bg-[#FF6B6B]/15 text-[#FF6B6B]' },
}
export function actionsFor(s: DisplayStatus): HubAction[] {
  return ({ generating: [], draft: ['open', 'rerun', 'discard'], live: ['open', 'copy', 'revoke', 'rerun'], revoked: ['open', 'rerun'], failed: ['rerun', 'discard'] } as const)[s].slice()
}
export const snapshotUrl = (origin: string, token: string) => `${origin}/snapshot/${token}`
```

- [ ] **Step 3: Implement the pages** (the shape `lib/auth/protected-pages.test.ts` enforces: `export default` line ending `) {`, first statement the staff check):

`app/tools/new-business/page.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/page-access'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { displayStatus, failureReason, listReports } from '@/lib/aeo-outbound/store'
import { OutboundHub, type HubRow } from '@/components/aeo-outbound/hub'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessHubPage() {
  const session = await requireStaff()
  if (!outboundEmail(session.user)) return <NoAccess />
  const now = Date.now()
  const rows: HubRow[] = (await listReports()).map((r) => ({
    id: r.id, brand: r.brandName ?? r.peecProjectName, projectId: r.peecProjectId, projectName: r.peecProjectName,
    status: displayStatus(r, now), createdAt: r.createdAt.toISOString(), approvedAt: r.approvedAt?.toISOString() ?? null,
    error: failureReason(r, now),
    token: r.status === 'approved' && !r.shareRevokedAt ? r.shareToken : null,
  }))
  return <OutboundHub rows={rows} />
}
```

`app/tools/new-business/[reportId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth/page-access'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { displayStatus, failureReason, getReport } from '@/lib/aeo-outbound/store'
import { needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { OutboundEditor } from '@/components/aeo-outbound/editor'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessEditorPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const session = await requireStaff()
  if (!outboundEmail(session.user)) return <NoAccess />
  const row = await getReport(reportId).catch(() => undefined)
  if (!row) notFound()
  return (
    <OutboundEditor
      id={row.id}
      brand={row.brandName ?? row.peecProjectName}
      projectId={row.peecProjectId}
      status={displayStatus(row, Date.now())}
      revision={row.revision}
      notes={row.notes ?? []}
      needsValidation={row.slots ? needsValidationPaths(row.slots) : []}
      token={row.status === 'approved' && !row.shareRevokedAt ? row.shareToken : null}
      error={failureReason(row, Date.now())}
    />
  )
}
```

- [ ] **Step 4: Implement the components.** `no-access.tsx` (server component): one card, "This tool is limited to the New Business team." `hub.tsx` (`'use client'`):
  - Header "AEO Outbound Snapshot".
  - A project `<select>` loaded from `fetch('/api/aeo-outbound/projects')`, with an inline "Peec is unavailable. Retry" button on non-200.
  - A **Generate** button that shows a local *Generating…* row, posts `{ projectId }` and maps every §7a response to its message (spec §7a list). On `200 draft`, `router.push(`/tools/new-business/${id}`)`.
  - The table: Brand · Peec project · Status pill (`STATUS_UI`) · Created · Approved · actions from `actionsFor`. Copy link uses `navigator.clipboard.writeText(snapshotUrl(window.location.origin, token))`. Revoke and Discard use `window.confirm` text from spec §2, then the actions. Rerun posts `{ projectId, rerunOf: id }`.
  - `useEffect` calls `router.refresh()` on mount, after each action, and every 5 s while any row is `generating`.

  `editor.tsx` (`'use client'`):
  - A sticky toolbar (Back link to `/tools/new-business`, brand, status pill, save state text, **Approve** for drafts, **Copy link** and **Revoke** for Live, **Rerun**, **Notes** toggle, **Open full size** linking to `/api/aeo-outbound/reports/${id}/view?mode=preview` in a new tab).
  - `<iframe sandbox="allow-scripts" srcDoc={html} className="w-full" style={{ height: 'calc(100vh - 140px)' }} />`, with `html` fetched from the view route on mount.
  - A `message` listener that ignores events whose `source !== iframeRef.current?.contentWindow`, and routes `{type:'dirty', path}` to `queue.markDirty(path)` and `{type:'edit'}` to `queue.edit(path, value)`.
  - A `SaveQueue` whose `send` PATCHes the slots route and maps `200 → ok`, `400 → bad`, `403/404/409 → stop`, everything else and network errors `→ retry`.
  - `notes` and `needsValidation` live in component state, seeded from props and replaced by each 200 from the slots route (`{ revision, notes, needsValidation }`).
  - Approve disabled while `state.dirty || state.saving || needsValidation.length > 0`. On click: post `{type:'flush'}` to the iframe, wait up to 2 s for the queue to be clean, and if still dirty show "Saving. Try again in a moment." Otherwise `window.confirm` (text from spec §2), then `approveSnapshotAction(id, state.revision)`. On `ok`: stop the queue, refetch the iframe as `?mode=preview`, `router.refresh()`. On `stale`: "This snapshot changed. Reload." On `not found`: "This snapshot no longer exists." On the Needs-validation error: show it.
  - Rows that aren't drafts: Live and Revoked load the iframe from `?mode=preview` (no share button inside `srcdoc`) and never attach the save queue; Generating shows "Generating. This takes about a minute." and calls `router.refresh()` every 5 s; Failed shows the error with Rerun and Discard, no iframe.
  - The notes drawer lists `notes`.

  Use the card classes of `app/tools/reporting/page.tsx:7-8` and `lucide-react` icons as the existing tools pages do.

- [ ] **Step 5: Add the Tools entry** to `lib/constants.ts` `TEAMS`, after the `reporting` team object (before the closing `]` at line 318):

```ts
  {
    slug: 'new-business',
    name: 'New Business',
    tools: [
      {
        slug: 'aeo-outbound-snapshot',
        name: 'AEO Outbound Snapshot',
        url: '/tools/new-business',
        description: 'One-page AI visibility snapshots for prospects.',
      },
    ],
  },
```

- [ ] **Step 6: Run everything**

Run: `npx vitest run components/aeo-outbound lib/aeo-outbound app/api/aeo-outbound app/snapshot app/actions/aeo-outbound.test.ts lib/auth/protected-pages.test.ts proxy.test.ts && perl -e 'alarm 590; exec @ARGV' -- make check`
Expected: all pass, `check:rsc` clean (no function props from the server pages to `OutboundHub` or `OutboundEditor`: every prop is plain data).

- [ ] **Step 7: End-to-end on the dev database (on my written go only)**

Steps, in order:
1. After I say go, apply `0026` to the dev database with `scripts/migrate-http.ts`, following the dev procedure in `MIGRATIONS-PENDING.md`.
2. Set `AEO_OUTBOUND_USERS` to my email in `.env.local` and run `npm run dev`.
3. In the built-in browser, sign in. Generate from one pitch project, edit two fields, watch "Saved", approve, and copy the link.
4. Open the link in a fresh tab (no session) and check the frozen page.
5. Revoke, then reload the link and get the 404.
6. Screenshot every step for the PR.

- [ ] **Step 8: Commit, push, open PR4**

```bash
git add components/aeo-outbound app/tools/new-business lib/constants.ts
git commit -m "feat(aeo-outbound): hub, editor, approve, revoke and the Tools entry"
git push
gh pr create --base aeo-outbound-audit --draft --title "feat(aeo-outbound): hub, editor and public link → aeo-outbound-audit" --body-file /tmp/pr4.md
```

---

## Self-review against the spec (done while writing)

- **§2 workflow:** generate (3.3), edit (4.1, 4.3, 4.4), notes (1.4, 3.2), approve (4.2), copy and revoke (4.2, 4.4), rerun (3.3 `rerunOf`, 4.4), discard (1.6, 4.2).
- **§3 sources:** CSS, JS, favicon and share copied and hash-pinned (2.1); charts golden-checked (2.2, 2.3); Peec client and paging ported (1.2); window (1.3); guards (1.3); Glean (3.1); page guard and allowlist (1.1, 4.4); token (1.1); approve-what-was-shown (1.6 revision).
- **§4:** every path in the table has a task. The six shared edits are in 1.1 (`vitest.config.ts`), 1.6 (schema, migration, `MIGRATIONS-PENDING.md`, `.env.example`) and 4.4 (`TEAMS`).
- **§5, §5a:** every row maps to `render.ts` (2.3) or `metrics.ts` (1.4).
- **§6:** prompt, parse, shape, search guard, grounding, two attempts (3.1-3.3).
- **§7, §7a:** pull (1.3), metrics (1.4), generate contract and deadline (3.3).
- **§8:** links and headers (4.1, 4.2), origin (1.1).
- **§9, §9a:** table and transitions (1.6), PATCH contract (4.1), queue (4.3).
- **§10:** UI (4.4).
- **§11:** Ryan's approve (4.2).
- **§14, §15:** each edge case has a test in the owning task.
- **Placeholders:** none. Task 4.4's component bodies are specified behaviour by behaviour with exact endpoints, messages and conditions. The PR body files are written at execution time from real output.
- **Type consistency:** `Slots` keys (`competitive_bullets`, `sources_bullets`, `next_step`) are the same in 1.5, 2.3, 3.2, 3.3 and 4.1. `SnapshotData` fields are the same in 1.4, 2.3, 3.2 and 4.1. `displayStatus` and `DisplayStatus` are the same in 1.6 and 4.4.
