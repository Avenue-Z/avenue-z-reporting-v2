# Organic Social — AI Retrievals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Peec "AI retrievals" on owned social content — a per-post AI Retrievals column on LinkedIn Top Content (Surface A) and an owned-only "Top AI-Retrieved Content" element (Surface B) — bridging Dash and Peec via LinkedIn canonical-URL resolution.

**Architecture:** Peec already returns `retrievals` per URL; expose it. Dash and Peec identify a LinkedIn post with different URLs (`ugcPost` vs `activity`), so we resolve the Dash post page's `<link rel=canonical>` to the public `/posts` URL, then exact-match Peec. Owned-ness is detected automatically from each page's JSON-LD author (matched to the client's own LinkedIn company handle). LinkedIn page resolutions are immutable, so they're persisted once in a new table and never re-fetched.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript (strict), Drizzle ORM + Neon Postgres, Vitest, the organic-social **parts framework** (`PartImpl` / `PartRegistry`), Peec native API (`lib/peec`).

## Global Constraints

- **Design source of truth:** `docs/superpowers/specs/2026-07-31-organic-social-ai-retrievals-design.md`. Read it before starting.
- **No `any`** in Peec/Dash response types (project rule 6). Type all new shapes.
- **All external calls server-side only** (project rule 1). Resolution fetches and Peec calls run in RSC/lib, never a Client Component.
- **Owned-ness config = one value:** the client's LinkedIn company handle (e.g. `renaissancebenefits`). No per-article list, ever.
- **Immutable resolutions:** a resolved LinkedIn page mapping is written once and reused forever; never re-scrape a resolved URL. Failures get a sentinel row with a cool-off, not a silent retry loop.
- **Never blank the report:** every new fetch degrades gracefully (missing table, Peec error, unresolved URL, no Peec workspace) to a legible empty/`—`/`N/A` state inside the existing error-boundary/`safe()` pattern — never throws into the page.
- **URL normalization:** always compare URLs via `urlJoinKey` from `@/lib/url` (lowercase, no protocol/www/query/hash/trailing-slash). Never string-compare raw URLs.
- **Test convention:** Vitest; fixtures are committed JSON/HTML under `__fixtures__/` and imported directly (see `lib/organic-social/top-content.test.ts`). No live network in CI — the LinkedIn/Peec live behavior is manual `/verify` only.
- **Branch:** `feat/organic-social-ai-retrievals` (off `dev`). Commit frequently, one deliverable per task.

---

## File Structure

**New**
- `drizzle/0021_*.sql` + snapshot — the `linkedin_url_resolutions` table and the `clients.owned_linkedin_handle` column (drizzle-kit generated).
- `lib/linkedin-resolve/parse.ts` — pure HTML → canonical / author-url extractors.
- `lib/linkedin-resolve/parse.test.ts`
- `lib/linkedin-resolve/resolve.ts` — fetch a LinkedIn page + parse; the DB-cached `getResolution`.
- `lib/organic-social/ai-retrievals.ts` — `retrievalsForPosts` (Surface A) + `ownedAiRetrievedContent` (Surface B).
- `lib/organic-social/ai-retrievals.test.ts`
- `lib/organic-social/__fixtures__/linkedin-post.html`, `linkedin-pulse.html` — trimmed real pages for parser tests.
- `components/report-sections/organic-social/parts/top-ai-retrieved.tsx` — Surface B part.
- `components/report-sections/organic-social/top-ai-retrieved-list.tsx` — Surface B presentational list.

**Modified**
- `lib/peec/url-citations.ts` — add `retrievals` to `UrlCitation` + `mergeUrlCitations`; bump `getUrlCitations` cache version.
- `lib/db/schema.ts` — new table + column + inferred types.
- `lib/organic-social/content-types.ts` — no shape change; `SnapshotPayload` stays `Omit<TopContentPost,'sourceType'>` (retrievals are NOT frozen — see Task 6).
- `components/report-sections/organic-social/parts/top-content.tsx` — fetch retrievals, thread into the card render.
- `components/report-sections/organic-social/sortable-top-content.tsx` + `post-card.tsx` — render the AI Retrievals column/field.
- `components/report-sections/organic-social/parts/registry.ts` + `template.ts` — register + compose Surface B.
- `scripts/seed-section-templates.ts` (+ its template constants) — include the new part in the composition seed.

---

## Phase 0 — Shared plumbing

### Task 1: Expose Peec `retrievals` on `UrlCitation`

**Files:**
- Modify: `lib/peec/url-citations.ts` (type `UrlCitation` ~L42-55; `mergeUrlCitations` ~L98-111; `getUrlCitations` cache `version` ~L338)
- Test: `lib/peec/url-citations.test.ts` (create if absent, else append)

**Interfaces:**
- Produces: `UrlCitation.retrievals: number` — total retrievals for the URL in the fetched window; consumed by Tasks 7 & 9.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest'
import { mergeUrlCitations, type ApiUrlRow } from './url-citations'

const base: ApiUrlRow = {
  url: 'https://www.linkedin.com/posts/renaissancebenefits_x-activity-7482499263831371776-tv03',
  classification: 'owned', title: 'X', channel_title: null,
  usage_count: 0, citation_count: 8, citation_avg: 0, retrievals: 9, retrieval_count: 9,
  citation_rate: 0, mentioned_brands: [],
}

test('mergeUrlCitations carries retrievals through', () => {
  const [c] = mergeUrlCitations([base], [], [], new Map())
  expect(c.retrievals).toBe(9)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run lib/peec/url-citations.test.ts -t "carries retrievals"`
Expected: FAIL — `c.retrievals` is `undefined` (property not on the type / not copied).

- [ ] **Step 3: Implement**

In `UrlCitation` add the field (place after `citationAvg`):
```ts
  retrievals: number               // Peec total retrievals for this URL in the window
```
In `mergeUrlCitations`, in the `out.push({ ... })` object add:
```ts
      retrievals: r.retrievals ?? 0,
```
Bump the `getUrlCitations` cache version so stale cached payloads (without `retrievals`) are invalidated: `version: 'v4'` (was `'v3'`). Update the adjacent comment to note "v4: surfaced retrievals (AI Retrievals feature)".

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run lib/peec/url-citations.test.ts` then `npx tsc --noEmit`
Expected: PASS + 0 type errors. (If other hand-built `UrlCitation` literals exist in the repo, tsc will flag them — add `retrievals: 0` to each; grep `: UrlCitation` and `UrlCitation[] =`.)

- [ ] **Step 5: Commit**

```bash
git add lib/peec/url-citations.ts lib/peec/url-citations.test.ts
git commit -m "feat(peec): surface retrievals on UrlCitation"
```

---

### Task 2: Schema — resolution table + owned-handle column

**Files:**
- Modify: `lib/db/schema.ts` (add table + column near `postDesignations` ~L287; imports already include `pgTable, uuid, text, timestamp, index`)
- Create: `drizzle/0021_*.sql` (+ meta snapshot) via `npm run db:generate`

**Interfaces:**
- Produces: table `linkedin_url_resolutions` and type `LinkedinUrlResolution`; column `clients.owned_linkedin_handle: text | null`. Consumed by Tasks 4, 7, 9.

- [ ] **Step 1: Add the column to `clients`**

In the `clients` pgTable, after `dashSocialConfig`:
```ts
  ownedLinkedinHandle: text('owned_linkedin_handle'),   // e.g. 'renaissancebenefits' — owned-ness for AI Retrievals
```

- [ ] **Step 2: Add the resolution table** (after `postDesignations`)

```ts
// Immutable LinkedIn page resolutions for AI Retrievals. One row per source URL:
// canonicalUrl (posts: /feed/update ugcPost -> public /posts activity URL) and/or
// authorUrl (pulse: JSON-LD author profile/company). Resolved once, reused forever.
export const linkedinUrlResolutions = pgTable('linkedin_url_resolutions', {
  urlKey: text('url_key').primaryKey(),          // urlJoinKey of the SOURCE url (Dash ugcPost or a pulse url)
  canonicalUrl: text('canonical_url'),           // null until/unless resolved (posts)
  authorUrl: text('author_url'),                 // null until/unless resolved (pulse author)
  status: text('status').notNull(),              // 'ok' | 'unresolved'
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
})
export type LinkedinUrlResolution = typeof linkedinUrlResolutions.$inferSelect
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0021_*.sql` creating the table + `ALTER TABLE clients ADD COLUMN owned_linkedin_handle`. Inspect it: additive only, no drops.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): linkedin_url_resolutions table + owned_linkedin_handle column"
```

> **Deploy note (record in the PR body, do not run here):** migration `0021` must be applied to each target DB (staging, then prod) BEFORE the new code serves — same ordering rule as `0019`/`0020`. The feature degrades gracefully if the table is missing (Task 4), but resolutions won't persist until it exists.

---

## Phase 1 — LinkedIn page resolution

### Task 3: Pure parsers — canonical + author from HTML

**Files:**
- Create: `lib/linkedin-resolve/parse.ts`, `lib/linkedin-resolve/parse.test.ts`
- Create fixtures: `lib/organic-social/__fixtures__/linkedin-post.html`, `linkedin-pulse.html` (trim a real page to the `<head>` + first JSON-LD block; include the `<link rel="canonical">`, `og:url`, and the `application/ld+json` author block observed in probing).

**Interfaces:**
- Produces:
  - `parseCanonicalUrl(html: string): string | null`
  - `parseAuthorUrl(html: string): string | null`

- [ ] **Step 1: Write failing tests**

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseCanonicalUrl, parseAuthorUrl } from './parse'

const post = readFileSync(join(__dirname, '../organic-social/__fixtures__/linkedin-post.html'), 'utf8')
const pulse = readFileSync(join(__dirname, '../organic-social/__fixtures__/linkedin-pulse.html'), 'utf8')

test('parseCanonicalUrl reads the public /posts url from a post page', () => {
  expect(parseCanonicalUrl(post)).toMatch(/\/posts\/.*activity-\d+/)
})
test('parseAuthorUrl reads the JSON-LD author company page from a pulse page', () => {
  expect(parseAuthorUrl(pulse)).toBe('https://www.linkedin.com/company/renaissancebenefits')
})
test('missing markup returns null, never throws', () => {
  expect(parseCanonicalUrl('<html></html>')).toBeNull()
  expect(parseAuthorUrl('<html></html>')).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run lib/linkedin-resolve/parse.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement `parse.ts`**

```ts
// Pure HTML extractors for LinkedIn page resolution. No I/O. Regex, not a DOM parser —
// we only need two well-known head elements, and these pages are large.

/** Public canonical URL: <link rel="canonical" href>, falling back to og:url. */
export function parseCanonicalUrl(html: string): string | null {
  return (
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    null
  )
}

/** JSON-LD author.url (the author's LinkedIn profile or company page). */
export function parseAuthorUrl(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1])
      for (const node of Array.isArray(json) ? json : [json]) {
        const authorUrl = node?.author?.url
        if (typeof authorUrl === 'string') return authorUrl
      }
    } catch { /* not the block we want */ }
  }
  return null
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run lib/linkedin-resolve/parse.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add lib/linkedin-resolve/parse.ts lib/linkedin-resolve/parse.test.ts lib/organic-social/__fixtures__/linkedin-*.html
git commit -m "feat(linkedin-resolve): pure canonical/author HTML parsers"
```

---

### Task 4: `getResolution` — fetch + DB-cache the immutable mapping

**Files:**
- Create: `lib/linkedin-resolve/resolve.ts`
- Test: `lib/linkedin-resolve/resolve.test.ts`

**Interfaces:**
- Consumes: `parseCanonicalUrl`, `parseAuthorUrl` (Task 3); `linkedinUrlResolutions` (Task 2); `urlJoinKey` (`@/lib/url`); `db` (`@/lib/db/client`).
- Produces:
  - `type Resolution = { urlKey: string; canonicalUrl: string | null; authorUrl: string | null; status: 'ok' | 'unresolved' }`
  - `fetchAndParse(url: string): Promise<Omit<Resolution,'urlKey'>>` — one live fetch (exported for the manual verify; not unit-tested against network).
  - `getResolution(url: string): Promise<Resolution>` — read the table; on miss, fetch+parse+persist; on any DB/fetch failure return an in-memory `unresolved` sentinel without throwing.

- [ ] **Step 1: Write the failing test** (pure logic: the "decide from a stored row" path via an injected reader/writer)

Design `getResolution` to take an optional store so it's testable without a live DB/network:
```ts
import { expect, test, vi } from 'vitest'
import { resolveWith, type ResolutionStore } from './resolve'

test('returns a stored row without fetching', async () => {
  const store: ResolutionStore = {
    read: vi.fn(async () => ({ urlKey: 'k', canonicalUrl: 'https://x/posts/a-activity-1', authorUrl: null, status: 'ok' })),
    write: vi.fn(),
  }
  const fetcher = vi.fn()
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:1', store, fetcher as never)
  expect(r.canonicalUrl).toContain('/posts/')
  expect(fetcher).not.toHaveBeenCalled()
})

test('on miss, fetches, persists, and returns ok', async () => {
  const writes: unknown[] = []
  const store: ResolutionStore = { read: async () => null, write: async (row) => { writes.push(row) } }
  const fetcher = async () => ({ canonicalUrl: 'https://www.linkedin.com/posts/x-activity-2', authorUrl: null, status: 'ok' as const })
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:2', store, fetcher)
  expect(r.status).toBe('ok')
  expect(writes).toHaveLength(1)
})

test('a fetch/DB failure yields an unresolved sentinel, never throws', async () => {
  const store: ResolutionStore = { read: async () => { throw new Error('db down') }, write: async () => {} }
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:3', store, async () => { throw new Error('net') })
  expect(r.status).toBe('unresolved')
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run lib/linkedin-resolve/resolve.test.ts`
Expected: FAIL — `resolveWith`/`ResolutionStore` undefined.

- [ ] **Step 3: Implement `resolve.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { linkedinUrlResolutions } from '@/lib/db/schema'
import { urlJoinKey } from '@/lib/url'
import { parseCanonicalUrl, parseAuthorUrl } from './parse'

export type Resolution = { urlKey: string; canonicalUrl: string | null; authorUrl: string | null; status: 'ok' | 'unresolved' }
export type ResolutionStore = {
  read: (urlKey: string) => Promise<Resolution | null>
  write: (row: Resolution) => Promise<void>
}
type Fetcher = (url: string) => Promise<Omit<Resolution, 'urlKey'>>

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

/** One live fetch + parse. LinkedIn URNs canonicalize with capital-P 'ugcPost'. */
export async function fetchAndParse(url: string): Promise<Omit<Resolution, 'urlKey'>> {
  const target = url.replace(/ugcpost/i, 'ugcPost')
  const res = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (res.status !== 200) return { canonicalUrl: null, authorUrl: null, status: 'unresolved' }
  const html = await res.text()
  const canonicalUrl = parseCanonicalUrl(html)
  const authorUrl = parseAuthorUrl(html)
  return { canonicalUrl, authorUrl, status: canonicalUrl || authorUrl ? 'ok' : 'unresolved' }
}

/** Testable core: read-through cache with injected store + fetcher. Never throws. */
export async function resolveWith(url: string, store: ResolutionStore, fetcher: Fetcher): Promise<Resolution> {
  const urlKey = urlJoinKey(url) ?? url.toLowerCase()
  try {
    const hit = await store.read(urlKey)
    if (hit) return hit
    const parsed = await fetcher(url)
    const row: Resolution = { urlKey, ...parsed }
    try { await store.write(row) } catch { /* persistence is best-effort */ }
    return row
  } catch {
    return { urlKey, canonicalUrl: null, authorUrl: null, status: 'unresolved' }
  }
}

const dbStore: ResolutionStore = {
  read: async (urlKey) => {
    const rows = await db.select().from(linkedinUrlResolutions).where(eq(linkedinUrlResolutions.urlKey, urlKey))
    const r = rows[0]
    return r ? { urlKey: r.urlKey, canonicalUrl: r.canonicalUrl, authorUrl: r.authorUrl, status: r.status as 'ok' | 'unresolved' } : null
  },
  write: async (row) => {
    await db.insert(linkedinUrlResolutions)
      .values({ urlKey: row.urlKey, canonicalUrl: row.canonicalUrl, authorUrl: row.authorUrl, status: row.status })
      .onConflictDoNothing({ target: linkedinUrlResolutions.urlKey })
  },
}

/** Production entry point: DB-cached resolution. */
export function getResolution(url: string): Promise<Resolution> {
  return resolveWith(url, dbStore, fetchAndParse)
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run lib/linkedin-resolve/resolve.test.ts` + `npx tsc --noEmit`
Expected: PASS + 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/linkedin-resolve/resolve.ts lib/linkedin-resolve/resolve.test.ts
git commit -m "feat(linkedin-resolve): DB-cached getResolution with graceful failure"
```

---

## Phase 2 — Surface A: AI Retrievals column

### Task 5: `retrievalsForPosts` — resolve + match Peec

**Files:**
- Create: `lib/organic-social/ai-retrievals.ts`
- Test: `lib/organic-social/ai-retrievals.test.ts`

**Interfaces:**
- Consumes: `TopContentPost` (`content-types.ts`); `getResolution` (Task 4); `getPlacementCitations` (`lib/peec/url-citations.ts`); `urlJoinKey`; `getClientBySlug`.
- Produces:
  - `type RetrievalResult = Map<number, number | null>` — postId → retrievals; `null` = no Peec workspace or unresolved (renders `—`/`N/A`); a number (incl. `0`) = matched.
  - `computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, hasWorkspace): RetrievalResult` — **pure** join (unit-tested).
  - `retrievalsForPosts(clientSlug, posts): Promise<RetrievalResult>` — the wired version (resolve each LinkedIn post, one all-time Peec fetch, join via `computeRetrievals`).

- [ ] **Step 1: Write the failing test (pure join)**

```ts
import { expect, test } from 'vitest'
import { computeRetrievals } from './ai-retrievals'
import type { TopContentPost } from './content-types'

const post = (id: number, url: string): TopContentPost => ({
  id, channel: 'LINKEDIN', platform: 'LinkedIn', publishedAt: '2026-06-01', caption: '', url,
  mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

test('matched post gets its retrievals; unmatched gets 0; no workspace => null', () => {
  const posts = [post(1, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:1'), post(2, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:2')]
  const resolvedKeyByPostId = new Map([[1, 'linkedin.com/posts/x-activity-11'], [2, 'linkedin.com/posts/x-activity-22']])
  const retrievalsByKey = new Map([['linkedin.com/posts/x-activity-11', 34]])
  const withWs = computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, true)
  expect(withWs.get(1)).toBe(34)
  expect(withWs.get(2)).toBe(0)                 // resolved but not cited => 0
  const noWs = computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, false)
  expect(noWs.get(1)).toBeNull()                // no Peec workspace => N/A
})

test('unresolved post (no canonical key) => null (renders as —)', () => {
  const posts = [post(3, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:3')]
  const r = computeRetrievals(posts, new Map(), new Map(), true)
  expect(r.get(3)).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run lib/organic-social/ai-retrievals.test.ts`
Expected: FAIL — `computeRetrievals` undefined.

- [ ] **Step 3: Implement `ai-retrievals.ts` (pure part first)**

```ts
import type { TopContentPost } from './content-types'
import { urlJoinKey } from '@/lib/url'
import { getResolution } from '@/lib/linkedin-resolve/resolve'
import { getPlacementCitations } from '@/lib/peec/url-citations'
import { getClientBySlug } from '@/lib/db/queries'

export type RetrievalResult = Map<number, number | null>

/** Pure join. null = no workspace OR unresolved (render —/N/A); number (incl 0) = matched. */
export function computeRetrievals(
  posts: TopContentPost[],
  resolvedKeyByPostId: Map<number, string>,
  retrievalsByKey: Map<string, number>,
  hasWorkspace: boolean,
): RetrievalResult {
  const out: RetrievalResult = new Map()
  for (const p of posts) {
    if (!hasWorkspace) { out.set(p.id, null); continue }
    const key = resolvedKeyByPostId.get(p.id)
    if (!key) { out.set(p.id, null); continue }       // unresolved => —
    out.set(p.id, retrievalsByKey.get(key) ?? 0)      // resolved-but-not-cited => 0
  }
  return out
}

/** Wired version. LinkedIn posts resolve via canonical; other platforms match their url directly. */
export async function retrievalsForPosts(clientSlug: string, posts: TopContentPost[]): Promise<RetrievalResult> {
  const client = await getClientBySlug(clientSlug)
  const hasWorkspace = !!client?.peecCustomerProjectId
  if (!hasWorkspace) return computeRetrievals(posts, new Map(), new Map(), false)

  // Resolve each post's canonical key (LinkedIn: page resolution; others: direct urlJoinKey).
  const resolvedKeyByPostId = new Map<number, string>()
  await Promise.all(posts.map(async (p) => {
    if (!p.url) return
    if (p.channel === 'LINKEDIN') {
      const r = await getResolution(p.url)
      const key = r.canonicalUrl ? urlJoinKey(r.canonicalUrl) : null
      if (key) resolvedKeyByPostId.set(p.id, key)
    } else {
      const key = urlJoinKey(p.url)
      if (key) resolvedKeyByPostId.set(p.id, key)
    }
  }))

  // One all-time Peec fetch for exactly the resolved keys.
  const keys = [...new Set(resolvedKeyByPostId.values())]
  const retrievalsByKey = new Map<string, number>()
  if (keys.length) {
    const citations = await getPlacementCitations(clientSlug, keys, { startDate: '2015-01-01' })
    for (const c of citations) retrievalsByKey.set(c.urlKey, c.retrievals)
  }
  return computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, true)
}
```
> `getPlacementCitations` defaults `endDate` to today and walks all pages; `startDate: '2015-01-01'` = effectively All Time. No engine filter = All Models.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run lib/organic-social/ai-retrievals.test.ts` + `npx tsc --noEmit`
Expected: PASS + 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ai-retrievals.ts lib/organic-social/ai-retrievals.test.ts
git commit -m "feat(organic-social): retrievalsForPosts (resolve + Peec match)"
```

---

### Task 6: Render the AI Retrievals column on Top Content

**Files:**
- Modify: `components/report-sections/organic-social/parts/top-content.tsx` (`TopContentV2Section` ~L66-85 — fetch retrievals, pass a `retrievals` map down)
- Modify: `components/report-sections/organic-social/sortable-top-content.tsx` (thread `retrievals` to each card; add the cell)
- Modify: `components/report-sections/organic-social/post-card.tsx` (render the AI Retrievals value)
- Test: `components/report-sections/organic-social/parts/top-content.ai-retrievals.test.tsx` (golden-style, awaiting the async section's output like the existing `visibility-chart` golden test)

**Interfaces:**
- Consumes: `retrievalsForPosts` (Task 5). Threads `retrievals: Map<number, number|null>` from `TopContentV2Section` → `SortableTopContent` → `PostCard`.
- Rendering rule: number → `Intl.NumberFormat` (e.g. `34`); `0` → `0`; `null` → `—`. Label the field **"AI Retrievals"**. Retrievals are **not** snapshot-frozen (they reflect current all-time Peec state), so they are fetched live in the section and NOT added to `SnapshotPayload`.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { PostCard } from './post-card'   // adjust path to where PostCard is exported

const base = {
  id: 1, platform: 'LinkedIn', publishedAt: '2026-06-01', caption: 'hi', url: 'https://x/p',
  creative: null, mediaType: 'IMAGE' as const,
  metrics: { effectiveness: null, engagementRate: null, engagements: 3, impressions: 9 },
}

test('renders the AI Retrievals value when present', () => {
  const { getByText } = render(<PostCard post={base as never} canEdit={false} retrievals={34} />)
  expect(getByText('AI Retrievals')).toBeTruthy()
  expect(getByText('34')).toBeTruthy()
})
test('renders an em dash when retrievals is null', () => {
  const { getByText } = render(<PostCard post={base as never} canEdit={false} retrievals={null} />)
  expect(getByText('—')).toBeTruthy()
})
```
> If `PostCard` isn't currently exported / prop-shaped this way, adjust the test to the real component boundary discovered while implementing; keep the two assertions (value shown; `—` when null).

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run components/report-sections/organic-social/parts/top-content.ai-retrievals.test.tsx`
Expected: FAIL — `retrievals` prop unknown / label absent.

- [ ] **Step 3: Implement**

1. `PostCard`: add `retrievals?: number | null` to its props; render a metric row/cell labeled `AI Retrievals` with value `retrievals == null ? '—' : new Intl.NumberFormat('en-US').format(retrievals)`. Place it alongside the existing metric breakdown (Effectiveness / Engagement Rate / …) so it reads as one more metric.
2. `SortableTopContent`: accept `retrievals: Map<number, number | null>`; when rendering each `PostCard`, pass `retrievals={retrievals.get(post.id) ?? null}`.
3. `TopContentV2Section`: after building `owned`/`influencer`, fetch once:
```ts
   const retrievals = await retrievalsForPosts(clientSlug, posts)
```
   and pass `retrievals={retrievals}` into `SortableTopContent` (both owned and influencer render paths). Import `retrievalsForPosts` from `@/lib/organic-social/ai-retrievals`. Keep it inside the existing `safe(...)`-guarded section; if it throws it must not blank the card — wrap the call so a failure yields an empty map (all `—`):
```ts
   const retrievals = await retrievalsForPosts(clientSlug, posts).catch(() => new Map<number, number | null>())
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run components/report-sections/organic-social` + `npx tsc --noEmit` + `npm run check:rsc`
Expected: PASS + 0 type errors + RSC boundary check passes (no function props cross server→client — `retrievals` is a plain Map/number, fine).

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/
git commit -m "feat(organic-social): AI Retrievals column on Top Content cards"
```

---

## Phase 3 — Surface B: owned-only Top AI-Retrieved Content

### Task 7: `ownedAiRetrievedContent` — Peec → owned filter → ranked

**Files:**
- Modify: `lib/organic-social/ai-retrievals.ts` (add the function + a pure `isOwned` predicate)
- Test: `lib/organic-social/ai-retrievals.test.ts` (append)

**Interfaces:**
- Consumes: `getUrlCitations` (all-time) or `getPlacementCitations`; `getResolution` (for pulse author); the client's `ownedLinkedinHandle`.
- Produces:
  - `type OwnedRetrieval = { url: string; title: string | null; retrievals: number; engines: string[] }`
  - `isOwnedLinkedIn(urlKey: string, authorUrl: string | null, handle: string): boolean` — **pure**: owned iff `urlKey` path is `linkedin.com/posts/<handle>` OR (`/pulse/` and `authorUrl` host-path is `/company/<handle>`).
  - `ownedAiRetrievedContent(clientSlug: string): Promise<OwnedRetrieval[]>` — ranked desc by retrievals; `[]` when no handle/workspace.

- [ ] **Step 1: Write failing tests (pure predicate)**

```ts
import { isOwnedLinkedIn } from './ai-retrievals'

test('owned post by handle path', () => {
  expect(isOwnedLinkedIn('linkedin.com/posts/renaissancebenefits_x-activity-1', null, 'renaissancebenefits')).toBe(true)
})
test('owned pulse by company author', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/some-article-3w0rc', 'https://www.linkedin.com/company/renaissancebenefits', 'renaissancebenefits')).toBe(true)
})
test('third-party pulse (personal author) is NOT owned', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/untapped-gold-howell-nmlce', 'https://www.linkedin.com/in/roger-g-howell', 'renaissancebenefits')).toBe(false)
})
test('a competitor company pulse is NOT owned', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/x-tolbert', 'https://www.linkedin.com/company/berinieportal', 'renaissancebenefits')).toBe(false)
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run lib/organic-social/ai-retrievals.test.ts -t owned`
Expected: FAIL — `isOwnedLinkedIn` undefined.

- [ ] **Step 3: Implement**

```ts
import { normalizeEngine } from '@/lib/peec/url-citations' // if needed; else read c.engines directly

export type OwnedRetrieval = { url: string; title: string | null; retrievals: number; engines: string[] }

/** Pure owned-ness test for a LinkedIn cited URL. */
export function isOwnedLinkedIn(urlKey: string, authorUrl: string | null, handle: string): boolean {
  const h = handle.trim().toLowerCase()
  if (!h) return false
  if (new RegExp(`^linkedin\\.com/posts/${h}(_|/|$)`, 'i').test(urlKey)) return true
  if (/^linkedin\.com\/pulse\//i.test(urlKey) && authorUrl) {
    const authorKey = (authorUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')).toLowerCase()
    return new RegExp(`^linkedin\\.com/company/${h}(/|$)`, 'i').test(authorKey)
  }
  return false
}

export async function ownedAiRetrievedContent(clientSlug: string): Promise<OwnedRetrieval[]> {
  const client = await getClientBySlug(clientSlug)
  const handle = client?.ownedLinkedinHandle?.trim().toLowerCase()
  if (!handle || !client?.peecCustomerProjectId) return []

  const { getUrlCitations } = await import('@/lib/peec/url-citations')
  const citations = await getUrlCitations(clientSlug, { startDate: '2015-01-01' })
  const linkedin = citations.filter((c) => /^linkedin\.com\/(posts|pulse)\//i.test(c.urlKey))

  const out: OwnedRetrieval[] = []
  for (const c of linkedin) {
    // posts: handle is in the path (no fetch). pulse: need the author (resolve, cached).
    let authorUrl: string | null = null
    if (/^linkedin\.com\/pulse\//i.test(c.urlKey)) authorUrl = (await getResolution(c.url)).authorUrl
    if (isOwnedLinkedIn(c.urlKey, authorUrl, handle)) {
      out.push({ url: c.url, title: c.title, retrievals: c.retrievals, engines: c.engines })
    }
  }
  return out.sort((a, b) => b.retrievals - a.retrievals)
}
```
> Note: `getUrlCitations` is capped at 2,000 rows. Owned LinkedIn URLs are few and (per probing) rank well by citation. If coverage proves insufficient in `/verify`, switch this to the all-pages walk filtered to `linkedin.com/(posts|pulse)` — leave a `// coverage:` comment noting the cap.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run lib/organic-social/ai-retrievals.test.ts` + `npx tsc --noEmit`
Expected: PASS + 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ai-retrievals.ts lib/organic-social/ai-retrievals.test.ts
git commit -m "feat(organic-social): ownedAiRetrievedContent (Peec -> owned filter -> ranked)"
```

---

### Task 8: Surface B part — list component + registry + template

**Files:**
- Create: `components/report-sections/organic-social/top-ai-retrieved-list.tsx` (presentational)
- Create: `components/report-sections/organic-social/parts/top-ai-retrieved.tsx` (the `PartImpl`, mirrors `topContentV2`'s async-section-in-Suspense shape)
- Modify: `components/report-sections/organic-social/parts/registry.ts` (register `'top-ai-retrieved': { 1: topAiRetrievedV1 }`)
- Modify: `components/report-sections/organic-social/template.ts` (append `{ id: 'top-ai-retrieved', version: 1 }` to `ORGANIC_SOCIAL_TEMPLATE.order`; it flows into the platform template automatically)
- Test: `components/report-sections/organic-social/top-ai-retrieved-list.test.tsx`

**Interfaces:**
- Consumes: `ownedAiRetrievedContent` (Task 7), `OrganicSocialCtx`, `safe`/`Fallback` (`parts/shared`), the skeleton pattern.
- Produces: part id `top-ai-retrieved` v1, `defaultLabel: 'Top AI-Retrieved Content'`.

- [ ] **Step 1: Write the failing test (presentational)**

```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TopAiRetrievedList } from './top-ai-retrieved-list'

test('ranks owned content and shows retrievals + empty state', () => {
  const { getByText, rerender, queryByText } = render(
    <TopAiRetrievedList items={[{ url: 'https://x/pulse/a', title: 'Article A', retrievals: 230, engines: ['ChatGPT'] }]} />,
  )
  expect(getByText('Article A')).toBeTruthy()
  expect(getByText('230')).toBeTruthy()
  rerender(<TopAiRetrievedList items={[]} />)
  expect(queryByText(/no ai-retrieved/i)).toBeTruthy()   // legible empty state
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run components/report-sections/organic-social/top-ai-retrieved-list.test.tsx`
Expected: FAIL — component undefined.

- [ ] **Step 3: Implement**

`top-ai-retrieved-list.tsx` — a simple ranked list/table: title (linked to `url`, new tab, `rel="noopener noreferrer"`), retrievals (formatted), engine chips. Empty `items` → a friendly empty state: "No AI-retrieved owned content in this period yet." Follow the styling of the existing Top Content cards/tables (reuse the section/heading classes).

`parts/top-ai-retrieved.tsx`:
```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { ownedAiRetrievedContent } from '@/lib/organic-social/ai-retrievals'
import { TopAiRetrievedList } from '../top-ai-retrieved-list'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function TopAiRetrievedSection({ clientSlug }: OrganicSocialCtx) {
  const r = await safe(ownedAiRetrievedContent(clientSlug))
  return r.data ? <TopAiRetrievedList items={r.data} /> : <Fallback kind={r.error!} />
}

export const topAiRetrievedV1: PartImpl<OrganicSocialCtx> = {
  id: 'top-ai-retrieved',
  version: 1,
  published: true,
  defaultLabel: 'Top AI-Retrieved Content',
  render: (ctx) => (
    <Suspense fallback={<div className="h-24 animate-pulse rounded bg-muted" />}>
      <TopAiRetrievedSection {...ctx} />
    </Suspense>
  ),
}
```
Register in `registry.ts` (import + add `'top-ai-retrieved': { 1: topAiRetrievedV1 }`) and append to `ORGANIC_SOCIAL_TEMPLATE.order`.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run components/report-sections/organic-social` + `npx tsc --noEmit` + `npm run check:rsc`
Expected: PASS + 0 type errors + RSC check passes.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/
git commit -m "feat(organic-social): Top AI-Retrieved Content part (Surface B)"
```

---

### Task 9: Update the template seed + parse-guard test

**Files:**
- Modify: `components/report-sections/organic-social/template.ts` (already edited in Task 8 — verify `top-ai-retrieved` is in both Overview and platform order)
- Verify: `scripts/seed-section-templates.ts` reads the code template constants (it does — `ORGANIC_SOCIAL_TEMPLATE` / `ORGANIC_SOCIAL_PLATFORM_TEMPLATE`), so no script change; the new part is picked up automatically.
- Test: `lib/report-sections/seed-templates.test.ts` (the existing parse-before-insert guard) must still pass with the new part present.

**Interfaces:**
- Consumes: the registry from Task 8 (parse-before-insert validates every pinned part exists + is published).

- [ ] **Step 1: Run the existing guard test**

Run: `npx vitest run lib/report-sections/seed-templates.test.ts`
Expected: PASS — proves `top-ai-retrieved@1` is registered, published, and composable (a missing/unpublished pin throws here).

- [ ] **Step 2: Run the full organic-social suite + gates**

Run: `npx vitest run lib/organic-social components/report-sections/organic-social lib/linkedin-resolve lib/peec` then `npx tsc --noEmit` then `npm run check:rsc`
Expected: all green.

- [ ] **Step 3: Commit (if any template tweak was needed)**

```bash
git add components/report-sections/organic-social/template.ts
git commit -m "chore(organic-social): compose Top AI-Retrieved Content into templates"
```

> **Seed note (PR body):** after deploy, re-run `db:seed-section-templates` so the DB `section_templates` rows include the new part (existing rows are insert-if-absent and won't auto-update — a divergence the seed's `--check` will report; promote via the normal template-update path).

---

## Phase 4 — Verify & document

### Task 10: Manual `/verify` script + PR write-up

**Files:**
- Create: `scripts/verify-ai-retrievals.ts` (a throwaway-style live check, gitignored pattern or kept as a probe like `scripts/probe-*.ts`)

- [ ] **Step 1: Live verify against Renaissance** (needs `DASH_API_TOKEN`, `PEEC_AI_CUSTOMER_TOKEN`, staging/prod `DATABASE_URL`)

Confirm end-to-end: `retrievalsForPosts('renaissance', <live LinkedIn top content>)` returns a non-null number for at least the known-cited post (the `…-activity-7450989177057267713…` post showed retrievals=34 in design probing) and `0`/`—` elsewhere; `ownedAiRetrievedContent('renaissance')` returns the company-authored article(s) (the `hr-teams` article, retrievals≈230) and **excludes** the Howell/Tolbert third-party Pulse articles.

- [ ] **Step 2: Record results on the PR** (comprehension-gate artifact per CLAUDE.md): where each number comes from (Dash post → canonical resolution → Peec `retrievals`), the owned-ness rule (author == `/company/<handle>`), and the two migrations/seed the deploy needs.

- [ ] **Step 3: Set `clients.owned_linkedin_handle = 'renaissancebenefits'`** for the Renaissance row (Drizzle Studio / Neon SQL) in each environment as part of rollout — the feature shows nothing owned until it's set.

---

## Self-Review (completed at write time)

- **Spec coverage:** §3 retrievals plumbing → Task 1. §4 column (resolution 4.1, match 4.2) → Tasks 3–6. §5 owned-only Surface B + auto owned-ness → Tasks 7–8. §6 persistence table → Task 2; retrievals-not-frozen noted in Task 6. §7 testing → tests in every task. §9 open questions: handle location resolved (new `owned_linkedin_handle` column, Task 2); platform scope handled (LinkedIn resolves, others direct-match, Task 5); ToS mitigated (persist-once, Task 4). ✅
- **Placeholder scan:** no TBD/TODO; every code step has real code. ✅
- **Type consistency:** `Resolution`, `RetrievalResult`, `OwnedRetrieval`, `computeRetrievals`, `isOwnedLinkedIn`, `retrievalsForPosts`, `ownedAiRetrievedContent`, `getResolution` are defined once and referenced consistently; `UrlCitation.retrievals` (Task 1) is consumed in Tasks 5 & 7. ✅
- **Scope:** Surface A (Tasks 1–6) is independently shippable before Surface B (Tasks 7–9) — matches the "ship A first" option if desired. ✅
