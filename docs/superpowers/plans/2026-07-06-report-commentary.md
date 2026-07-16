# Dashboard Report Commentary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-view commentary section (draft → approved review flow, rich-text body, self-contained date range) to the seven in-scope report views, authored by Avenue Z staff and shown to clients once approved.

**Architecture:** A new `report_commentary` table (one row per entry, many per client-per-view) is read by a server component `CommentarySection` dropped at the top of each in-scope view in all four report route files. A single `resolveCommentaryView(slug, subsection)` normalizer maps the routes' inconsistent coordinates to seven canonical view keys. Pure, unit-tested logic (view resolution, permissions, HTML sanitization, default-entry selection, write-planning) lives in `lib/commentary/`; three `'use server'` actions in `app/actions/commentary.ts` do the writes. The body is authored in a Tiptap editor and stored as sanitized HTML.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript (strict) · Neon Postgres + Drizzle ORM (`neon-http`) · Vitest 3 · Tailwind v4 · Tiptap v3 · sanitize-html.

## Global Constraints

- **Approvers** come from a comma-separated env var `COMMENTARY_APPROVERS` (e.g. `maddie@avenuez.com,dianna@avenuez.com`). Compared case-insensitively.
- **Write/edit/view-drafts** capability = the viewer's email ends with `@avenuez.com` (case-insensitive). Clients see **approved-only**, read-only.
- **Fork-on-edit-of-approved:** editing a `draft` updates in place; editing an `approved` entry inserts a NEW draft and leaves the approved row untouched.
- **Commentary is decoupled from the dashboard date picker** — each entry carries its own required `period_start`/`period_end`; the block never reads the live `dateRange`.
- **Seven canonical view keys only:** `peec-ai`, `peec-ai:pr-influence`, `peec-ai:content-impact`, `paid-search`, `meta-ads`, `linkedin-ads`, `organic-social`. `peec-ai:technical-audit` is out of scope.
- **Pure logic stays out of `'use server'` files** (which may only export async functions) — it lives in `lib/commentary/*.ts` with sibling `.test.ts`.
- **Sanitize on write** is the XSS boundary; stored HTML is rendered directly.
- Follow existing style: Result union `{ ok: true } | { ok: false; error: string }`; `revalidateTag('db', 'max')` after every write; design tokens `bg-bg-surface`/`bg-bg-base`/`text-text-muted`/`text-white`/`border-white/[0.08]`/`rounded-lg`.
- Run tests with `npm test` (`vitest run`). Type-check with `npx tsc --noEmit`. Lint with `npm run lint`.

---

## File structure

**Created**
- `lib/commentary/views.ts` — `CommentaryViewKey`, `resolveCommentaryView`, `COMMENTARY_VIEWS`
- `lib/commentary/views.test.ts`
- `lib/commentary/permissions.ts` — `isAvenueZEmail`, `getApprovers`, `canEditCommentary`, `canApproveCommentary`
- `lib/commentary/permissions.test.ts`
- `lib/commentary/sanitize.ts` — `sanitizeCommentaryHtml`
- `lib/commentary/sanitize.test.ts`
- `lib/commentary/types.ts` — `CommentaryStatus`, `CommentaryEntry`, `CommentaryCapabilities`, `CommentaryInput`
- `lib/commentary/select.ts` — `visibleEntries`, `pickDefaultEntry`
- `lib/commentary/select.test.ts`
- `lib/commentary/mutations.ts` — `validateCommentaryInput`, `planCommentaryWrite`
- `lib/commentary/mutations.test.ts`
- `app/actions/commentary.ts` — `saveCommentary`, `approveCommentary`, `revokeCommentary`
- `components/report-sections/commentary/index.tsx` — `CommentarySection` (RSC)
- `components/report-sections/commentary/commentary-panel.tsx` — `CommentaryPanel` (client)
- `components/report-sections/commentary/commentary-editor.tsx` — `CommentaryEditor` (client)
- `drizzle/0017_*.sql` — generated migration

**Modified**
- `lib/db/schema.ts` — add `date` import, `commentaryStatusEnum`, `reportCommentary` table + types
- `lib/db/queries.ts` — add `toCommentaryEntry`, `getCommentaryForView`
- `app/dashboard/[clientSlug]/reports/page.tsx` — render block (SPA, uses `activeSection`/`subsection`)
- `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` — render block (deep-link, uses `reportSlug`)
- `app/portal/[clientSlug]/reports/page.tsx` — render block (SPA)
- `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` — render block (deep-link)
- `package.json` — add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `sanitize-html`, `@types/sanitize-html`
- `CLAUDE.md` — document `COMMENTARY_APPROVERS`

---

## Dependency graph (for a parallelized fleet)

Each task lists **Depends on** (must be merged first) and is otherwise parallel-safe. Waves show maximal parallelism:

```
Wave 1 (no deps, fully parallel):
  T1  schema + migration
  T2  views resolver
  T3  permissions + env doc
  T4  sanitizer + dep
Wave 2:
  T5  shared DTO types        (deps: T2)
Wave 3 (parallel):
  T6  select                  (deps: T5)
  T7  mutations/validation    (deps: T5)
  T8  query helper + mapper   (deps: T1, T5)
Wave 4:
  T9  server actions          (deps: T1,T2,T3,T4,T7,T8)
Wave 5:
  T10 editor (Tiptap)         (deps: T5,T9)
Wave 6:
  T11 panel                   (deps: T5,T9,T10)
Wave 7:
  T12 CommentarySection RSC   (deps: T2,T3,T6,T8,T11)
Wave 8:
  T13 wire 4 route files      (deps: T2,T12)
Wave 9:
  T14 integration verify      (deps: all)
```

Note for the fleet: T5–T8 import **type-only** or function signatures from earlier tasks. If tasks run truly concurrently in isolated worktrees, an implementer should create the file it depends on as a thin stub from the **Interfaces → Consumes** block only if it is missing; otherwise import the real thing. The `Produces` blocks are the contract.

---

### Task 1: DB schema + migration

**Files:**
- Modify: `lib/db/schema.ts` (imports line 1; add table near the other tables, e.g. after `dashboardShares`/`sectionTemplates` block, and types near the other `$inferSelect` exports)
- Create: `drizzle/0017_*.sql` (generated)

**Interfaces:**
- Consumes: existing `clients` table.
- Produces:
  - `commentaryStatusEnum` (pgEnum `'commentary_status'`, values `['draft','approved']`)
  - table `reportCommentary` with columns `id, clientId, viewKey, bodyHtml, periodStart, periodEnd, status, createdBy, updatedBy, approvedBy, createdAt, updatedAt, approvedAt`
  - `type ReportCommentary = typeof reportCommentary.$inferSelect`
  - `type NewReportCommentary = typeof reportCommentary.$inferInsert`

- [ ] **Step 1: Add `date` to the drizzle import**

In `lib/db/schema.ts` line 1, add `date` to the import list:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, integer, unique, boolean, date } from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: Add the enum and table**

Add near the other table definitions (after the `sectionTemplates` table):

```ts
export const commentaryStatusEnum = pgEnum('commentary_status', ['draft', 'approved'])

// One row per commentary entry. Many entries per (client, viewKey) form the
// history stream shown in the older-entries dropdown. viewKey is a canonical
// key from lib/commentary/views.ts (e.g. 'peec-ai', 'meta-ads'), NOT a raw route
// slug. body_html is sanitized on write. period_* is the commentary's OWN range,
// independent of the dashboard date picker.
export const reportCommentary = pgTable('report_commentary', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  viewKey: text('view_key').notNull(),
  bodyHtml: text('body_html').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: commentaryStatusEnum('status').notNull().default('draft'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  approvedBy: text('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
}, (table) => ({
  clientViewIdx: index('report_commentary_client_view_idx').on(table.clientId, table.viewKey),
}))
```

- [ ] **Step 3: Add the inferred types**

Add near the other type exports:

```ts
export type ReportCommentary = typeof reportCommentary.$inferSelect
export type NewReportCommentary = typeof reportCommentary.$inferInsert
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/0017_<slug>.sql` is created containing `CREATE TYPE "public"."commentary_status" …`, `CREATE TABLE "report_commentary" …`, the FK to `clients`, and the index. `drizzle/meta/_journal.json` gains index 17. **Do not run `db:migrate` here** — migration application is deferred to Task 14 so parallel agents don't race on the shared dev DB.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors from `schema.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(commentary): add report_commentary table + migration 0017"
```

---

### Task 2: View-key resolver

**Files:**
- Create: `lib/commentary/views.ts`
- Test: `lib/commentary/views.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CommentaryViewKey = 'peec-ai' | 'peec-ai:pr-influence' | 'peec-ai:content-impact' | 'paid-search' | 'meta-ads' | 'linkedin-ads' | 'organic-social'`
  - `resolveCommentaryView(slug: string, subsection?: string | null): CommentaryViewKey | null`
  - `COMMENTARY_VIEWS: Record<CommentaryViewKey, { label: string; owner: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/commentary/views.test.ts
import { describe, expect, test } from 'vitest'
import { resolveCommentaryView, COMMENTARY_VIEWS } from './views'

describe('resolveCommentaryView', () => {
  test('AEO tabs', () => {
    expect(resolveCommentaryView('peec-ai')).toBe('peec-ai')
    expect(resolveCommentaryView('peec-ai', 'pr-influence')).toBe('peec-ai:pr-influence')
    expect(resolveCommentaryView('peec-ai', 'content-impact')).toBe('peec-ai:content-impact')
    expect(resolveCommentaryView('peec-ai', 'technical-audit')).toBeNull() // out of scope
  })
  test('paid search aliases collapse to one key', () => {
    expect(resolveCommentaryView('google-ads')).toBe('paid-search')       // deep-link route
    expect(resolveCommentaryView('paid-media')).toBe('paid-search')       // SPA route, no subsection
  })
  test('meta aliases collapse to one key', () => {
    expect(resolveCommentaryView('meta-ads')).toBe('meta-ads')            // deep-link + portal SPA
    expect(resolveCommentaryView('paid-media', 'meta')).toBe('meta-ads')  // dashboard SPA
  })
  test('linkedin aliases collapse to one key', () => {
    expect(resolveCommentaryView('linkedin-ads')).toBe('linkedin-ads')
    expect(resolveCommentaryView('paid-media', 'linkedin')).toBe('linkedin-ads')
  })
  test('organic social', () => {
    expect(resolveCommentaryView('organic-social')).toBe('organic-social')
  })
  test('out-of-scope tabs return null', () => {
    expect(resolveCommentaryView('ga4')).toBeNull()
    expect(resolveCommentaryView('exec-summary')).toBeNull()
    expect(resolveCommentaryView('paid-media', 'unknown')).toBeNull()
  })
  test('every canonical key has a registry entry', () => {
    const keys = ['peec-ai','peec-ai:pr-influence','peec-ai:content-impact','paid-search','meta-ads','linkedin-ads','organic-social'] as const
    for (const k of keys) expect(COMMENTARY_VIEWS[k]).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commentary/views.test.ts`
Expected: FAIL — cannot find module `./views`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/commentary/views.ts

/** Canonical identity for an in-scope commentary view. Stable across the four
 *  report route files, which address the same report under inconsistent
 *  (slug, subsection) coordinates. */
export type CommentaryViewKey =
  | 'peec-ai'
  | 'peec-ai:pr-influence'
  | 'peec-ai:content-impact'
  | 'paid-search'
  | 'meta-ads'
  | 'linkedin-ads'
  | 'organic-social'

/**
 * Map a route's (slug, subsection) to the canonical commentary view key, or null
 * when the view is not in scope (→ no commentary block).
 *
 * Alias sources (verified in the route files):
 *   Paid Search : 'google-ads' (deep-link)      | 'paid-media' no-sub (SPA)
 *   Meta        : 'meta-ads' (deep-link/portal)  | 'paid-media'+'meta'
 *   LinkedIn    : 'linkedin-ads' (deep-link/portal) | 'paid-media'+'linkedin'
 */
export function resolveCommentaryView(slug: string, subsection?: string | null): CommentaryViewKey | null {
  switch (slug) {
    case 'peec-ai':
      if (!subsection) return 'peec-ai'
      if (subsection === 'pr-influence') return 'peec-ai:pr-influence'
      if (subsection === 'content-impact') return 'peec-ai:content-impact'
      return null // technical-audit and any other AEO sub-tab: out of scope
    case 'organic-social':
      return 'organic-social'
    case 'meta-ads':
      return 'meta-ads'
    case 'linkedin-ads':
      return 'linkedin-ads'
    case 'google-ads':
      return 'paid-search'
    case 'paid-media':
      if (!subsection) return 'paid-search'
      if (subsection === 'meta') return 'meta-ads'
      if (subsection === 'linkedin') return 'linkedin-ads'
      return null
    default:
      return null
  }
}

/** Display label + service owner per view (owners per the PRD). */
export const COMMENTARY_VIEWS: Record<CommentaryViewKey, { label: string; owner: string }> = {
  'peec-ai': { label: 'AEO Overview', owner: 'Melena' },
  'peec-ai:pr-influence': { label: 'AEO PR Influence', owner: 'Alyssa' },
  'peec-ai:content-impact': { label: 'AEO Content Impact', owner: 'Danielle' },
  'paid-search': { label: 'Paid Search', owner: 'Amir' },
  'meta-ads': { label: 'Meta Advertising', owner: 'Greg' },
  'linkedin-ads': { label: 'LinkedIn Advertising', owner: 'Greg' },
  'organic-social': { label: 'Organic Social', owner: 'Jasmine / Kyleah' },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/commentary/views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commentary/views.ts lib/commentary/views.test.ts
git commit -m "feat(commentary): view-key resolver + registry"
```

---

### Task 3: Permissions + env documentation

**Files:**
- Create: `lib/commentary/permissions.ts`
- Test: `lib/commentary/permissions.test.ts`
- Modify: `CLAUDE.md` (Environment Variables section)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isAvenueZEmail(email: string | null | undefined): boolean`
  - `getApprovers(env?: string): Set<string>`
  - `canEditCommentary(email: string | null | undefined): boolean`
  - `canApproveCommentary(email: string | null | undefined, env?: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/commentary/permissions.test.ts
import { describe, expect, test } from 'vitest'
import { isAvenueZEmail, getApprovers, canEditCommentary, canApproveCommentary } from './permissions'

describe('isAvenueZEmail', () => {
  test('accepts @avenuez.com case-insensitively', () => {
    expect(isAvenueZEmail('paul.ramirez@avenuez.com')).toBe(true)
    expect(isAvenueZEmail('Maddie@AvenueZ.com')).toBe(true)
  })
  test('rejects other domains and empties', () => {
    expect(isAvenueZEmail('someone@client.com')).toBe(false)
    expect(isAvenueZEmail('evil@avenuez.com.attacker.io')).toBe(false)
    expect(isAvenueZEmail(null)).toBe(false)
    expect(isAvenueZEmail(undefined)).toBe(false)
  })
})

describe('getApprovers / canApproveCommentary', () => {
  const env = 'maddie@avenuez.com, Dianna@avenuez.com'
  test('parses comma list, trims, lowercases', () => {
    expect(getApprovers(env)).toEqual(new Set(['maddie@avenuez.com', 'dianna@avenuez.com']))
    expect(getApprovers('')).toEqual(new Set())
    expect(getApprovers(undefined)).toEqual(new Set())
  })
  test('approve requires Avenue Z email AND allowlist membership', () => {
    expect(canApproveCommentary('maddie@avenuez.com', env)).toBe(true)
    expect(canApproveCommentary('Dianna@avenuez.com', env)).toBe(true)  // case-insensitive
    expect(canApproveCommentary('paul.ramirez@avenuez.com', env)).toBe(false) // AZ but not approver
    expect(canApproveCommentary('dianna@client.com', env)).toBe(false)  // not AZ
  })
})

describe('canEditCommentary', () => {
  test('any Avenue Z email may edit', () => {
    expect(canEditCommentary('paul.ramirez@avenuez.com')).toBe(true)
    expect(canEditCommentary('client@acme.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commentary/permissions.test.ts`
Expected: FAIL — cannot find module `./permissions`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/commentary/permissions.ts

/** True iff the email belongs to the @avenuez.com domain (case-insensitive). */
export function isAvenueZEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith('@avenuez.com')
}

/** Parse the COMMENTARY_APPROVERS env var (comma-separated) into a normalized set. */
export function getApprovers(env: string | undefined = process.env.COMMENTARY_APPROVERS): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Any Avenue Z staff member may write/edit commentary and view drafts. */
export function canEditCommentary(email: string | null | undefined): boolean {
  return isAvenueZEmail(email)
}

/** Only allowlisted Avenue Z staff (Maddie/Dianna) may approve or revoke. */
export function canApproveCommentary(
  email: string | null | undefined,
  env: string | undefined = process.env.COMMENTARY_APPROVERS,
): boolean {
  if (!isAvenueZEmail(email)) return false
  return getApprovers(env).has((email as string).trim().toLowerCase())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/commentary/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the env var in CLAUDE.md**

In `CLAUDE.md`, under `## Environment Variables`, add below the Slack block:

```env
# Report commentary approvers — comma-separated emails allowed to approve
# commentary for client visibility (Maddie/Dianna). All @avenuez.com users can
# write/edit; only these can approve.
COMMENTARY_APPROVERS=maddie@avenuez.com,dianna@avenuez.com
```

- [ ] **Step 6: Commit**

```bash
git add lib/commentary/permissions.ts lib/commentary/permissions.test.ts CLAUDE.md
git commit -m "feat(commentary): permissions (avenuez edit gate + approver allowlist)"
```

---

### Task 4: HTML sanitizer + dependency

**Files:**
- Modify: `package.json` (add `sanitize-html`, `@types/sanitize-html`)
- Create: `lib/commentary/sanitize.ts`
- Test: `lib/commentary/sanitize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sanitizeCommentaryHtml(dirty: string): string`

- [ ] **Step 1: Install the dependency**

Run: `npm install sanitize-html && npm install -D @types/sanitize-html`
Expected: `package.json` gains both entries; lockfile updated.

- [ ] **Step 2: Write the failing test**

```ts
// lib/commentary/sanitize.test.ts
import { describe, expect, test } from 'vitest'
import { sanitizeCommentaryHtml } from './sanitize'

describe('sanitizeCommentaryHtml', () => {
  test('keeps allowed formatting tags', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li></ul><h3>H</h3>'
    expect(sanitizeCommentaryHtml(html)).toBe(html)
  })
  test('strips <script> and its content', () => {
    expect(sanitizeCommentaryHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
  })
  test('strips event-handler attributes', () => {
    expect(sanitizeCommentaryHtml('<p onclick="steal()">x</p>')).toBe('<p>x</p>')
  })
  test('drops javascript: hrefs but keeps http/https/mailto and adds safe rel/target', () => {
    expect(sanitizeCommentaryHtml('<a href="javascript:alert(1)">x</a>')).toBe('x')
    const safe = sanitizeCommentaryHtml('<a href="https://x.com">x</a>')
    expect(safe).toContain('href="https://x.com"')
    expect(safe).toContain('rel="noopener noreferrer"')
    expect(safe).toContain('target="_blank"')
    expect(sanitizeCommentaryHtml('<a href="mailto:a@b.com">m</a>')).toContain('href="mailto:a@b.com"')
  })
  test('strips disallowed tags (img, iframe) but keeps text', () => {
    expect(sanitizeCommentaryHtml('<p>hi</p><img src=x onerror=alert(1)>')).toBe('<p>hi</p>')
    expect(sanitizeCommentaryHtml('<iframe src="evil"></iframe>text')).toBe('text')
  })
  test('handles empty/nullish input', () => {
    expect(sanitizeCommentaryHtml('')).toBe('')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/commentary/sanitize.test.ts`
Expected: FAIL — cannot find module `./sanitize`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/commentary/sanitize.ts
import sanitizeHtml from 'sanitize-html'

// The client-facing XSS boundary. Allow only the formatting Tiptap can emit
// (bold/italic/underline, lists, a single heading level, links). Everything else
// — scripts, event handlers, img/iframe, javascript: URLs — is stripped.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
}

export function sanitizeCommentaryHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? '', OPTIONS)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/commentary/sanitize.test.ts`
Expected: PASS. (If the exact string equality on the links test is brittle due to attribute ordering, the test uses `toContain` for those — keep it.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/commentary/sanitize.ts lib/commentary/sanitize.test.ts
git commit -m "feat(commentary): HTML sanitizer (write-side XSS boundary)"
```

---

### Task 5: Shared DTO types

**Files:**
- Create: `lib/commentary/types.ts`

**Interfaces:**
- Consumes: `CommentaryViewKey` (Task 2).
- Produces: `CommentaryStatus`, `CommentaryEntry`, `CommentaryCapabilities`, `CommentaryInput`.

- [ ] **Step 1: Write the types (no test — pure type module)**

```ts
// lib/commentary/types.ts
import type { CommentaryViewKey } from './views'

export type CommentaryStatus = 'draft' | 'approved'

/** Serializable entry passed from the RSC to client components. Dates are strings:
 *  period_* as 'YYYY-MM-DD'; timestamps as ISO 8601. */
export interface CommentaryEntry {
  id: string
  viewKey: CommentaryViewKey
  bodyHtml: string
  periodStart: string
  periodEnd: string
  status: CommentaryStatus
  updatedBy: string
  updatedAt: string
  approvedBy: string | null
  approvedAt: string | null
}

/** What the current viewer may do. */
export interface CommentaryCapabilities {
  canEdit: boolean    // @avenuez.com
  canApprove: boolean // in COMMENTARY_APPROVERS
}

/** Editor → saveCommentary payload. */
export interface CommentaryInput {
  id?: string
  clientSlug: string
  viewKey: CommentaryViewKey
  bodyHtml: string
  periodStart: string
  periodEnd: string
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/commentary/types.ts
git commit -m "feat(commentary): shared DTO types"
```

---

### Task 6: Default-entry selection

**Files:**
- Create: `lib/commentary/select.ts`
- Test: `lib/commentary/select.test.ts`

**Interfaces:**
- Consumes: `CommentaryEntry`, `CommentaryCapabilities` (Task 5).
- Produces:
  - `visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[]`
  - `pickDefaultEntry(entries: CommentaryEntry[]): CommentaryEntry | null`

- [ ] **Step 1: Write the failing test**

```ts
// lib/commentary/select.test.ts
import { describe, expect, test } from 'vitest'
import { visibleEntries, pickDefaultEntry } from './select'
import type { CommentaryEntry } from './types'

const e = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'x', viewKey: 'meta-ads', bodyHtml: '<p>x</p>',
  periodStart: '2026-01-01', periodEnd: '2026-01-31', status: 'approved',
  updatedBy: 'a@avenuez.com', updatedAt: '2026-02-01T00:00:00.000Z',
  approvedBy: null, approvedAt: null, ...over,
})

describe('visibleEntries', () => {
  const entries = [e({ id: 'd', status: 'draft' }), e({ id: 'a', status: 'approved' })]
  test('Avenue Z sees all', () => {
    expect(visibleEntries(entries, { canEdit: true, canApprove: false }).map((x) => x.id)).toEqual(['d', 'a'])
  })
  test('clients see approved only', () => {
    expect(visibleEntries(entries, { canEdit: false, canApprove: false }).map((x) => x.id)).toEqual(['a'])
  })
})

describe('pickDefaultEntry', () => {
  test('most recent by periodStart, tiebreak updatedAt', () => {
    const older = e({ id: 'old', periodStart: '2026-01-01' })
    const newer = e({ id: 'new', periodStart: '2026-02-01' })
    const sameStartNewer = e({ id: 'tie', periodStart: '2026-02-01', updatedAt: '2026-03-01T00:00:00.000Z' })
    expect(pickDefaultEntry([older, newer, sameStartNewer])?.id).toBe('tie')
  })
  test('empty → null', () => {
    expect(pickDefaultEntry([])).toBeNull()
  })
  test('does not mutate input order', () => {
    const arr = [e({ id: '1', periodStart: '2026-01-01' }), e({ id: '2', periodStart: '2026-02-01' })]
    pickDefaultEntry(arr)
    expect(arr.map((x) => x.id)).toEqual(['1', '2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commentary/select.test.ts`
Expected: FAIL — cannot find module `./select`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/commentary/select.ts
import type { CommentaryEntry, CommentaryCapabilities } from './types'

/** Avenue Z staff see every entry; clients see approved entries only. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  return caps.canEdit ? entries : entries.filter((x) => x.status === 'approved')
}

/** The default entry to show: most recent by period start, then by last update.
 *  ISO date strings compare chronologically. Non-mutating. */
export function pickDefaultEntry(entries: CommentaryEntry[]): CommentaryEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort(
    (a, b) => b.periodStart.localeCompare(a.periodStart) || b.updatedAt.localeCompare(a.updatedAt),
  )[0]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/commentary/select.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commentary/select.ts lib/commentary/select.test.ts
git commit -m "feat(commentary): visibility filter + default-entry selection"
```

---

### Task 7: Write-planning + validation

**Files:**
- Create: `lib/commentary/mutations.ts`
- Test: `lib/commentary/mutations.test.ts`

**Interfaces:**
- Consumes: `CommentaryStatus` (Task 5).
- Produces:
  - `validateCommentaryInput(input: { bodyHtml: string; periodStart: string; periodEnd: string }): { ok: boolean; error?: string }`
  - `planCommentaryWrite(existingStatus: CommentaryStatus | null): { op: 'insert' | 'update' }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/commentary/mutations.test.ts
import { describe, expect, test } from 'vitest'
import { validateCommentaryInput, planCommentaryWrite } from './mutations'

describe('validateCommentaryInput', () => {
  const base = { bodyHtml: '<p>Solid month.</p>', periodStart: '2026-01-01', periodEnd: '2026-01-31' }
  test('accepts a well-formed entry', () => {
    expect(validateCommentaryInput(base)).toEqual({ ok: true })
  })
  test('rejects empty body (tags only / whitespace)', () => {
    expect(validateCommentaryInput({ ...base, bodyHtml: '<p></p>' }).ok).toBe(false)
    expect(validateCommentaryInput({ ...base, bodyHtml: '   ' }).ok).toBe(false)
  })
  test('requires both dates', () => {
    expect(validateCommentaryInput({ ...base, periodStart: '' }).ok).toBe(false)
    expect(validateCommentaryInput({ ...base, periodEnd: '' }).ok).toBe(false)
  })
  test('rejects start after end', () => {
    expect(validateCommentaryInput({ ...base, periodStart: '2026-02-01', periodEnd: '2026-01-01' }).ok).toBe(false)
  })
})

describe('planCommentaryWrite (fork-on-edit-of-approved)', () => {
  test('editing an approved entry inserts a new draft', () => {
    expect(planCommentaryWrite('approved')).toEqual({ op: 'insert' })
  })
  test('editing a draft updates in place', () => {
    expect(planCommentaryWrite('draft')).toEqual({ op: 'update' })
  })
  test('no existing row inserts', () => {
    expect(planCommentaryWrite(null)).toEqual({ op: 'insert' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commentary/mutations.test.ts`
Expected: FAIL — cannot find module `./mutations`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/commentary/mutations.ts
import type { CommentaryStatus } from './types'

/** Validate a (already-sanitized) commentary payload. Body must have visible text;
 *  both dates required; start ≤ end (lexical compare works for 'YYYY-MM-DD'). */
export function validateCommentaryInput(input: {
  bodyHtml: string
  periodStart: string
  periodEnd: string
}): { ok: boolean; error?: string } {
  const text = (input.bodyHtml ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (!text) return { ok: false, error: 'Commentary body is required.' }
  if (!input.periodStart || !input.periodEnd) return { ok: false, error: 'A date range is required.' }
  if (input.periodStart > input.periodEnd) return { ok: false, error: 'Start date must be on or before the end date.' }
  return { ok: true }
}

/** Decide UPDATE vs INSERT. Editing an approved entry forks a new draft so the
 *  client-visible approved row is never disturbed; editing a draft updates it. */
export function planCommentaryWrite(existingStatus: CommentaryStatus | null): { op: 'insert' | 'update' } {
  return existingStatus === 'draft' ? { op: 'update' } : { op: 'insert' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/commentary/mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commentary/mutations.ts lib/commentary/mutations.test.ts
git commit -m "feat(commentary): input validation + fork-on-edit write plan"
```

---

### Task 8: Query helper + row mapper

**Files:**
- Modify: `lib/db/queries.ts` (add `desc` to the `drizzle-orm` import; add `reportCommentary`/`ReportCommentary` to the schema import; append the helpers)

**Interfaces:**
- Consumes: `reportCommentary`, `ReportCommentary` (Task 1); `CommentaryEntry` (Task 5); `CommentaryViewKey` (Task 2).
- Produces:
  - `toCommentaryEntry(row: ReportCommentary): CommentaryEntry`
  - `getCommentaryForView(clientId: string, viewKey: string): Promise<CommentaryEntry[]>` (React.cache-wrapped)

- [ ] **Step 1: Update imports**

In `lib/db/queries.ts`:
- add `desc` to the `drizzle-orm` import: `import { eq, and, lt, isNotNull, desc } from 'drizzle-orm'`
- add to the schema import list: `reportCommentary, type ReportCommentary`
- add near the other type imports: `import type { CommentaryEntry } from '@/lib/commentary/types'` and `import type { CommentaryViewKey } from '@/lib/commentary/views'`

- [ ] **Step 2: Append the mapper and query helper**

```ts
// --- Report commentary ---

/** Map a DB row to the serializable DTO sent to client components. neon-http
 *  returns `date` columns as 'YYYY-MM-DD' strings and `timestamp` as Date. */
export function toCommentaryEntry(row: ReportCommentary): CommentaryEntry {
  return {
    id: row.id,
    viewKey: row.viewKey as CommentaryViewKey,
    bodyHtml: row.bodyHtml,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  }
}

/** All commentary entries for a (client, view), newest first. React.cache-wrapped
 *  for per-render dedup; freshness after writes comes from revalidateTag('db'). */
export const getCommentaryForView = cache(
  async (clientId: string, viewKey: string): Promise<CommentaryEntry[]> => {
    const rows = await db
      .select()
      .from(reportCommentary)
      .where(and(eq(reportCommentary.clientId, clientId), eq(reportCommentary.viewKey, viewKey)))
      .orderBy(desc(reportCommentary.periodStart), desc(reportCommentary.updatedAt))
    return rows.map(toCommentaryEntry)
  },
)
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors. (If `row.periodStart` is typed as anything other than `string`, the Drizzle `date` column default mode is string — confirm the column has no `{ mode: 'date' }`.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat(commentary): getCommentaryForView query + DTO mapper"
```

---

### Task 9: Server actions

**Files:**
- Create: `app/actions/commentary.ts`

**Interfaces:**
- Consumes: `reportCommentary` (T1); `resolveCommentaryView`/`CommentaryViewKey` not needed here; `canEditCommentary`/`canApproveCommentary` (T3); `sanitizeCommentaryHtml` (T4); `validateCommentaryInput`/`planCommentaryWrite` (T7); `getClientBySlug` (existing); `CommentaryInput` (T5).
- Produces:
  - `saveCommentary(input: CommentaryInput): Promise<Result>`
  - `approveCommentary(id: string): Promise<Result>`
  - `revokeCommentary(id: string): Promise<Result>`
  - where `type Result = { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the action file**

There is no separate unit test for this `'use server'` file (its pure cores are tested in Tasks 3/4/7, per the repo convention). Verification is via type-check here and the integration task.

```ts
// app/actions/commentary.ts
'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reportCommentary } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { sanitizeCommentaryHtml } from '@/lib/commentary/sanitize'
import { validateCommentaryInput, planCommentaryWrite } from '@/lib/commentary/mutations'
import type { CommentaryInput, CommentaryStatus } from '@/lib/commentary/types'

type Result = { ok: true } | { ok: false; error: string }

/** Create or edit a commentary entry. Editing an approved entry forks a new draft
 *  (see planCommentaryWrite); editing a draft updates in place. Always lands as/stays draft. */
export async function saveCommentary(input: CommentaryInput): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canEditCommentary(email)) return { ok: false, error: 'forbidden' }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const bodyHtml = sanitizeCommentaryHtml(input.bodyHtml)
  const valid = validateCommentaryInput({ bodyHtml, periodStart: input.periodStart, periodEnd: input.periodEnd })
  if (!valid.ok) return { ok: false, error: valid.error! }

  // Determine the existing status (only for a row that belongs to this client).
  let existingStatus: CommentaryStatus | null = null
  if (input.id) {
    const rows = await db
      .select({ status: reportCommentary.status, clientId: reportCommentary.clientId })
      .from(reportCommentary)
      .where(eq(reportCommentary.id, input.id))
      .limit(1)
    const row = rows[0]
    if (row && row.clientId === client.id) existingStatus = row.status
  }

  const plan = planCommentaryWrite(existingStatus)
  if (plan.op === 'update' && input.id) {
    await db
      .update(reportCommentary)
      .set({
        bodyHtml,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        updatedBy: email!,
        updatedAt: new Date(),
      })
      .where(eq(reportCommentary.id, input.id))
  } else {
    await db.insert(reportCommentary).values({
      clientId: client.id,
      viewKey: input.viewKey,
      bodyHtml,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'draft',
      createdBy: email!,
      updatedBy: email!,
    })
  }

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Approve an entry for client visibility. Allowlist only. */
export async function approveCommentary(id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  await db
    .update(reportCommentary)
    .set({ status: 'approved', approvedBy: email!, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Revoke approval, returning an entry to draft (internal-only). Allowlist only. */
export async function revokeCommentary(id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  await db
    .update(reportCommentary)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions/commentary.ts
git commit -m "feat(commentary): save/approve/revoke server actions"
```

---

### Task 10: Rich-text editor (Tiptap)

**Files:**
- Modify: `package.json` (add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`)
- Create: `components/report-sections/commentary/commentary-editor.tsx`

**Interfaces:**
- Consumes: `CommentaryEntry`, `CommentaryViewKey` (T5/T2); `saveCommentary` (T9); `Button` (`@/components/ui/button`).
- Produces: `CommentaryEditor` — `{ clientSlug: string; viewKey: CommentaryViewKey; entry?: CommentaryEntry; onDone: () => void }`.

- [ ] **Step 1: Install Tiptap**

Run: `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link`
Expected: three entries added to `package.json` dependencies.

- [ ] **Step 2: Write the editor component**

```tsx
// components/report-sections/commentary/commentary-editor.tsx
'use client'

import { useState, useTransition } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Button } from '@/components/ui/button'
import { saveCommentary } from '@/app/actions/commentary'
import type { CommentaryEntry } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'

const CONTENT_CLASS =
  'min-h-[8rem] p-3 text-sm text-white focus:outline-none [&_a]:underline [&_a]:text-blue-400 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1'

function ToolbarButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'text-text-muted hover:bg-white/5'}`}
    >
      {label}
    </button>
  )
}

export function CommentaryEditor({
  clientSlug,
  viewKey,
  entry,
  onDone,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entry?: CommentaryEntry
  onDone: () => void
}) {
  const [periodStart, setPeriodStart] = useState(entry?.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(entry?.periodEnd ?? '')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit bundles Link; disable it here so the separately
      // configured Link extension below is the only 'link' (avoids a duplicate-
      // extension collision). The `link: false` key is ignored on versions where
      // StarterKit does not include Link.
      StarterKit.configure({ heading: { levels: [3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    ],
    content: entry?.bodyHtml || '<p></p>',
    immediatelyRender: false, // avoid SSR hydration mismatch in Next
    editorProps: { attributes: { class: CONTENT_CLASS } },
  })

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function handleSave() {
    if (!editor) return
    setError('')
    startTransition(async () => {
      const res = await saveCommentary({
        id: entry?.id,
        clientSlug,
        viewKey,
        bodyHtml: editor.getHTML(),
        periodStart,
        periodEnd,
      })
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  if (!editor) return null

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Period start
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white" />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Period end
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white" />
        </label>
      </div>

      <div className="rounded-md border border-white/[0.08] bg-bg-base">
        <div className="flex flex-wrap gap-1 border-b border-white/[0.08] p-2">
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" />
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" />
          <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H" />
          <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="• List" />
          <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1. List" />
          <ToolbarButton active={editor.isActive('link')} onClick={setLink} label="🔗 Link" />
        </div>
        <EditorContent editor={editor} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : 'Save draft'}</Button>
        <Button variant="ghost" onClick={onDone} disabled={isPending}>Cancel</Button>
      </div>
      {entry?.status === 'approved' && (
        <p className="text-xs text-text-muted">Editing an approved entry creates a new draft; the approved version stays visible to the client until the new draft is approved.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors. (If `variant="ghost"` is not a valid `Button` variant, check `components/ui/button.tsx` and use an available variant such as `"outline"` or omit `variant`.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/report-sections/commentary/commentary-editor.tsx
git commit -m "feat(commentary): Tiptap rich-text editor form"
```

---

### Task 11: Commentary panel

**Files:**
- Create: `components/report-sections/commentary/commentary-panel.tsx`

**Interfaces:**
- Consumes: `CommentaryEntry`, `CommentaryCapabilities`, `CommentaryViewKey` (T5/T2); `approveCommentary`/`revokeCommentary` (T9); `CommentaryEditor` (T10); `Button`.
- Produces: `CommentaryPanel` — `{ clientSlug: string; viewKey: CommentaryViewKey; entries: CommentaryEntry[]; initialId: string | null; capabilities: CommentaryCapabilities }`.

- [ ] **Step 1: Write the panel component**

```tsx
// components/report-sections/commentary/commentary-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CommentaryEditor } from './commentary-editor'
import { approveCommentary, revokeCommentary } from '@/app/actions/commentary'
import type { CommentaryEntry, CommentaryCapabilities } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'

function fmt(d: string): string {
  // 'YYYY-MM-DD' → 'Mon D, YYYY' without timezone drift.
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function CommentaryPanel({
  clientSlug,
  viewKey,
  entries,
  initialId,
  capabilities,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entries: CommentaryEntry[]
  initialId: string | null
  capabilities: CommentaryCapabilities
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(initialId)
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [isPending, startTransition] = useTransition()

  const selected = entries.find((e) => e.id === selectedId) ?? null

  function refresh() {
    setEditing(null)
    router.refresh() // re-runs the RSC; revalidateTag already busted the cache
  }
  function doApprove(id: string) { startTransition(async () => { await approveCommentary(id); refresh() }) }
  function doRevoke(id: string) { startTransition(async () => { await revokeCommentary(id); refresh() }) }

  return (
    <section className="mb-8 rounded-lg border border-white/[0.08] bg-bg-surface">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-sm font-extrabold text-white">
          <span>{collapsed ? '▸' : '▾'}</span> Commentary
        </button>
        {capabilities.canEdit && editing === null && (
          <Button onClick={() => setEditing('new')}>Add commentary</Button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          {editing === 'new' && (
            <CommentaryEditor clientSlug={clientSlug} viewKey={viewKey} onDone={refresh} />
          )}

          {editing !== 'new' && entries.length > 1 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white"
            >
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {fmt(e.periodStart)} – {fmt(e.periodEnd)}{e.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
          )}

          {editing !== 'new' && !selected && <p className="text-sm text-text-muted">No commentary yet.</p>}

          {editing !== 'new' && selected && editing !== selected.id && (
            <article className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-text-muted">Reporting period: {fmt(selected.periodStart)} – {fmt(selected.periodEnd)}</span>
                <span className={`rounded px-2 py-0.5 font-semibold ${selected.status === 'approved' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                  {selected.status === 'approved' ? 'Approved' : 'Draft'}
                </span>
              </div>
              <div
                className="text-sm text-white [&_a]:underline [&_a]:text-blue-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
              />
              <p className="text-xs text-text-muted">Last updated by {selected.updatedBy}</p>
              {capabilities.canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setEditing(selected.id)}>Edit</Button>
                  {capabilities.canApprove && selected.status === 'draft' && (
                    <Button onClick={() => doApprove(selected.id)} disabled={isPending}>Approve</Button>
                  )}
                  {capabilities.canApprove && selected.status === 'approved' && (
                    <Button onClick={() => doRevoke(selected.id)} disabled={isPending}>Revoke</Button>
                  )}
                </div>
              )}
            </article>
          )}

          {editing !== 'new' && selected && editing === selected.id && (
            <CommentaryEditor clientSlug={clientSlug} viewKey={viewKey} entry={selected} onDone={refresh} />
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/commentary/commentary-panel.tsx
git commit -m "feat(commentary): panel (display, history dropdown, approve/revoke, edit)"
```

---

### Task 12: CommentarySection RSC

**Files:**
- Create: `components/report-sections/commentary/index.tsx`

**Interfaces:**
- Consumes: `auth` (`@/auth`); `getClientBySlug`, `getCommentaryForView` (existing/T8); `canEditCommentary`, `canApproveCommentary` (T3); `visibleEntries`, `pickDefaultEntry` (T6); `CommentaryViewKey` (T2); `CommentaryPanel` (T11).
- Produces: `CommentarySection` (async RSC) — `{ clientSlug: string; viewKey: CommentaryViewKey }`.

- [ ] **Step 1: Write the server component**

```tsx
// components/report-sections/commentary/index.tsx
import { auth } from '@/auth'
import { getClientBySlug, getCommentaryForView } from '@/lib/db/queries'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { visibleEntries, pickDefaultEntry } from '@/lib/commentary/select'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'

export async function CommentarySection({ clientSlug, viewKey }: { clientSlug: string; viewKey: CommentaryViewKey }) {
  const [session, client] = await Promise.all([auth(), getClientBySlug(clientSlug)])
  if (!client) return null

  const email = session?.user?.email ?? null
  const capabilities = { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }

  const all = await getCommentaryForView(client.id, viewKey)
  const visible = visibleEntries(all, capabilities)
  const initial = pickDefaultEntry(visible)

  // A client with nothing approved sees nothing. Avenue Z staff always get the
  // panel (so they can add the first entry).
  if (!capabilities.canEdit && !initial) return null

  return (
    <CommentaryPanel
      clientSlug={clientSlug}
      viewKey={viewKey}
      entries={visible}
      initialId={initial?.id ?? null}
      capabilities={capabilities}
    />
  )
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/commentary/index.tsx
git commit -m "feat(commentary): CommentarySection server component"
```

---

### Task 13: Wire the block into the four route files

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

**Interfaces:**
- Consumes: `resolveCommentaryView` (T2); `CommentarySection` (T12); existing `ReportErrorBoundary` (`@/components/report-sections/error-boundary`) and `Suspense`.
- Produces: the commentary block rendered at the top of each in-scope view.

For **each** file, do the same three edits. The two **SPA** files use `activeSection` + `subsection`; the two **deep-link** files use `reportSlug` (pass `undefined` for subsection).

- [ ] **Step 1: Add imports (all four files)**

```ts
import { resolveCommentaryView } from '@/lib/commentary/views'
import { CommentarySection } from '@/components/report-sections/commentary'
```

(Confirm `Suspense` is already imported — it is in the SPA files. If a deep-link file lacks it, add `import { Suspense } from 'react'`. `ReportErrorBoundary` is already imported in all four.)

- [ ] **Step 2: Compute the view key (all four files)**

In the SPA files, near where `activeSection`/`subsection` are resolved (before the returned JSX):

```ts
const commentaryView = resolveCommentaryView(activeSection, subsection)
```

In the deep-link files, near where `reportSlug` is available:

```ts
const commentaryView = resolveCommentaryView(reportSlug)
```

- [ ] **Step 3: Render the block at the top of the report content (all four files)**

Insert this immediately **before** the existing `<ReportErrorBoundary …>` that wraps the report section (in the dashboard SPA file, that is right after `<div className="h-8" />`):

```tsx
{commentaryView && (
  <ReportErrorBoundary sectionName="Commentary">
    <Suspense fallback={null}>
      <CommentarySection clientSlug={clientSlug} viewKey={commentaryView} />
    </Suspense>
  </ReportErrorBoundary>
)}
```

(For the deep-link files, place it just before the element/`<ReportErrorBoundary>` that renders `getReportSection(...)`, so it sits above the section content and below the page header.)

- [ ] **Step 4: Verify type-check + lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Confirm `clientSlug` is in scope at each insertion point (it is — all four pages already read it from `params`).

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/[clientSlug]/reports/page.tsx" "app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx" "app/portal/[clientSlug]/reports/page.tsx" "app/portal/[clientSlug]/reports/[reportSlug]/page.tsx"
git commit -m "feat(commentary): render commentary block on the 7 in-scope views"
```

---

### Task 14: Integration verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything.
- Produces: a working feature on the dev DB.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass, including the five new `lib/commentary/*.test.ts`.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Apply the migration to the dev DB**

Ensure `.env.local` has `DATABASE_URL_UNPOOLED` and `COMMENTARY_APPROVERS` set. Then:

Run: `npm run db:migrate`
Expected: `0017_*.sql` applied; `report_commentary` table and `commentary_status` type exist in Neon.

- [ ] **Step 4: Manual smoke test (one AEO + one paid view)**

Run: `npm run dev`, sign in as an `@avenuez.com` user, and for a client whose `enabledReports` include the relevant tabs:
- Navigate to **AEO Overview** (`peec-ai`) and **Meta Advertising** (reached via `paid-media`+`meta` on the dashboard SPA). Confirm:
  1. The Commentary block renders at the top, collapsible, default expanded.
  2. **Add commentary** → rich text (bold/list/link) + required period → **Save draft** persists; empty body or missing dates shows an inline error.
  3. A draft shows a **Draft** badge; a non-approver sees no Approve button; set your email in `COMMENTARY_APPROVERS`, reload, and **Approve** flips it to **Approved**.
  4. **Edit** an approved entry → Save → a NEW draft appears in the dropdown while the approved entry is unchanged.
  5. Older entries are selectable via the dropdown; each shows its own period.
- Open the **portal** view for the same client as a client user (or simulate): only **approved** commentary shows, read-only (no Add/Edit/Approve).
- Confirm an out-of-scope tab (e.g. **Web Analytics**/`ga4`) shows **no** commentary block.

- [ ] **Step 5: Final commit (if any doc tweaks)**

```bash
git add -A
git commit -m "chore(commentary): integration verification notes" || true
```

---

## Self-review notes (author)

- **Spec coverage:** placement at top of view (T13) · entry model incl. status/last-updated/period (T1) · draft→approved + approver allowlist (T3, T9) · default = most recent, decoupled from picker, older via dropdown (T6, T11) · @avenuez edit / client approved-only (T3, T6, T12) · editable history + fork-on-edit (T7, T9, T11) · rich text + links (T10) · sanitize boundary (T4) · view-key normalization across 4 routes (T2, T13) · collapsible default-open (T11). YAGNI items (separate links field, full edit-log table, delete) intentionally absent per spec non-goals.
- **Type consistency:** `CommentaryViewKey`, `CommentaryEntry`, `CommentaryCapabilities`, `CommentaryInput`, `Result` names are used identically across tasks; `saveCommentary`/`approveCommentary`/`revokeCommentary` signatures match between T9, T10, T11.
- **Brand:** T10/T11 use existing tokens but styling should be refined with the frontend brand-coherence skill during implementation (noted, not a blocker).
