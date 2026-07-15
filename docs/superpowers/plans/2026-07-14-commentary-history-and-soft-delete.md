# Commentary History Log + Draft Soft-Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give approvers a read-only log of every commentary version (live, superseded, deleted), and give editors a button to soft-delete a draft.

**Architecture:** No new versioning system — fork-on-edit already retains every version as a row. Soft-delete adds one nullable column pair (`deleted_at`, `deleted_by`) and a filter; the history log is a pure derivation over rows `getCommentaryForView` already fetches. All read filtering funnels through the single choke point `lib/commentary/select.ts`. The approver gate is enforced **server-side in the RSC**, not in the client panel.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript strict, Drizzle ORM + Neon Postgres, Vitest + @testing-library/react (jsdom).

**Spec:** [`docs/superpowers/specs/2026-07-14-commentary-history-and-soft-delete-design.md`](../specs/2026-07-14-commentary-history-and-soft-delete-design.md)

**Base branch:** cut from `feat/report-commentary` at `5346d62` or later (PRs #148/#149/#150/#151 all merged).

```bash
git checkout feat/report-commentary && git pull
git checkout -b feat/commentary-history-and-soft-delete
```

## Global Constraints

- **TypeScript strict. No `any`.**
- **Deleted means `deletedAt != null`.** A deleted row keeps `status = 'draft'` — never add a `'deleted'` enum value. The history log must still be able to report what the row *was*.
- **`deletedBy` is the authenticated actor**, read server-side from `session.user.email`. Never a parameter. `deleteCommentaryDraft(clientSlug, id)` takes no actor argument by design.
- **Every read of commentary rows goes through `visibleEntries` or `historyEntries`.** These are the only things standing between a deleted draft and a client's screen. Do not add a raw consumer of `getCommentaryForView`.
- **The approver gate for history lives in the RSC** (`components/report-sections/commentary/index.tsx`), not in `CommentaryPanel`. Props cross into the browser bundle; hiding JSX does not stop the data shipping.
- **The `rsc-boundary` CI check does NOT cover that leak.** It catches *function* props crossing the boundary (a serialization crash guard). Green CI is not coverage. Task 5's test is the coverage.
- Commit after every task. Run `npx tsc --noEmit` and `npx vitest run` before each commit.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/db/schema.ts` | Table def + CHECK constraint | Modify |
| `drizzle/00XX_*.sql` | Generated migration | Create (via `npm run db:generate`) |
| `lib/commentary/types.ts` | DTO + history types | Modify |
| `lib/db/queries.ts` | Row → DTO mapping | Modify |
| `lib/commentary/select.ts` | **The choke point.** Read filtering + history derivation | Modify |
| `lib/commentary/select.test.ts` | Tests for the above | Modify |
| `lib/commentary/mutations.ts` | Pure delete guard | Modify |
| `lib/commentary/mutations.test.ts` | Tests for the above | Modify |
| `app/actions/commentary.ts` | `deleteCommentaryDraft` action | Modify |
| `components/report-sections/commentary/index.tsx` | **The security boundary.** Computes history server-side | Modify |
| `components/report-sections/commentary/index.test.tsx` | **Blocking payload test** | Create |
| `components/report-sections/commentary/commentary-panel.tsx` | Delete button + History disclosure | Modify |
| `components/report-sections/commentary/commentary-panel.test.tsx` | Render tests | Modify |

---

## Task 1: Schema — soft-delete columns + DB-enforced invariant

**Files:**
- Modify: `lib/db/schema.ts:1` (imports), `lib/db/schema.ts:248-263` (table)
- Modify: `lib/commentary/types.ts:7-18`
- Modify: `lib/db/queries.ts:264-277`
- Create: `drizzle/00XX_*.sql` (generated)

**Interfaces:**
- Produces: `CommentaryEntry.deletedAt: string | null`, `CommentaryEntry.deletedBy: string | null` — every later task depends on these.

- [ ] **Step 1: Add the columns and the CHECK constraint to the schema**

In `lib/db/schema.ts`, extend the `drizzle-orm/pg-core` import (line 1) with `check`, and add a `sql` import from `drizzle-orm`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, integer, unique, boolean, date, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
```

Then add the two columns and the constraint to `reportCommentary`:

```ts
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  // Soft delete. Deleted rows are hidden from every view but never removed: the
  // approver history log still shows them, and a deleted draft stays recallable
  // at the DB level. Only drafts are deletable (see canDeleteDraft), enforced below.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
}, (table) => ({
  clientViewIdx: index('report_commentary_client_view_idx').on(table.clientId, table.viewKey),
  // The "only drafts are deletable" rule is an application invariant (canDeleteDraft).
  // Enforce it in the DB too, so a future caller cannot produce an approved+deleted row
  // — a state the history log has no way to describe.
  noDeletedApproved: check(
    'report_commentary_no_deleted_approved',
    sql`${table.deletedAt} IS NULL OR ${table.status} = 'draft'`,
  ),
}))
```

- [ ] **Step 2: Add the fields to the DTO**

In `lib/commentary/types.ts`, add to `CommentaryEntry` (after `approvedAt`):

```ts
  approvedBy: string | null
  approvedAt: string | null
  deletedAt: string | null
  deletedBy: string | null
}
```

- [ ] **Step 3: Map them in the row → DTO mapper**

In `lib/db/queries.ts`, in `toCommentaryEntry`, after the `approvedAt` line:

```ts
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deletedBy: row.deletedBy,
  }
}
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`

Expected: a new `drizzle/00XX_*.sql`. **Open it and confirm it contains all three changes** — the two `ADD COLUMN`s and the constraint:

```sql
ALTER TABLE "report_commentary" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "report_commentary" ADD COLUMN "deleted_by" text;
ALTER TABLE "report_commentary" ADD CONSTRAINT "report_commentary_no_deleted_approved" CHECK ("deleted_at" IS NULL OR "status" = 'draft');
```

If the CHECK is missing, the `check()` call is wrong — fix it before continuing. The constraint is the whole point of this step.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (Existing test fixtures build `CommentaryEntry` via a spread helper with defaults, so adding two fields will surface anywhere a literal is constructed — fix those by adding `deletedAt: null, deletedBy: null`.)

- [ ] **Step 6: Run the suite**

Run: `npx vitest run`
Expected: all pass. Any failure here is a fixture missing the two new fields.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/commentary/types.ts lib/db/queries.ts drizzle/
git commit -m "feat(commentary): add soft-delete columns with a DB-enforced deleted⇒draft invariant"
```

> **Note for whoever applies this:** `npm run db:migrate` needs `DATABASE_URL`. Applying to Neon is a separate step from merging; the migration is committed, not run, by this task.

---

## Task 2: The choke point — hide deleted rows, derive the history

**Files:**
- Modify: `lib/commentary/select.ts`
- Modify: `lib/commentary/types.ts`
- Test: `lib/commentary/select.test.ts`

**Interfaces:**
- Consumes: `CommentaryEntry.deletedAt` (Task 1)
- Produces:
  - `tagVersion(entry: CommentaryEntry, liveIds: Set<string>): CommentaryVersionTag`
  - `historyEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryPeriodHistory[]`
  - types `CommentaryVersionTag`, `CommentaryVersion`, `CommentaryPeriodHistory`
  - Task 5 (RSC) and Task 6 (panel) both depend on these exact names.

- [ ] **Step 1: Add the history types**

In `lib/commentary/types.ts`, append:

```ts
/** How a version relates to what the client currently sees. Order matters — see tagVersion. */
export type CommentaryVersionTag = 'live' | 'superseded' | 'deleted' | 'draft'

export interface CommentaryVersion {
  entry: CommentaryEntry
  tag: CommentaryVersionTag
}

/** One reporting period's full version stack, newest-period-first. */
export interface CommentaryPeriodHistory {
  periodStart: string
  periodEnd: string
  versions: CommentaryVersion[]
}
```

- [ ] **Step 2: Write the failing tests**

In `lib/commentary/select.test.ts`, update the import line and append these suites. Note the fixture helper `e()` at the top of that file already spreads defaults — add `deletedAt: null, deletedBy: null` to it (Task 1 Step 5 will have forced this already).

```ts
import { visibleEntries, pickDefaultEntry, mostRecentApprovedPerPeriod, historyEntries, tagVersion } from './select'
```

```ts
describe('visibleEntries — deleted rows are hidden from BOTH views', () => {
  // §2 claims one filter fixes client and staff simultaneously. Prove both; don't infer.
  const del = e({ id: 'D', status: 'draft', deletedAt: '2026-02-10T00:00:00.000Z' })
  const live = e({ id: 'L', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
  const draft = e({ id: 'P', status: 'draft' })

  test('client view excludes a deleted row', () => {
    const out = visibleEntries([del, live], { canEdit: false, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['L'])
  })
  test('staff dropdown excludes a deleted row but keeps live drafts', () => {
    const out = visibleEntries([del, draft, live], { canEdit: true, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['P', 'L'])
  })
  test('a deleted row never becomes the live approved entry by falling back', () => {
    // An approved row that was revoked to draft and then deleted must not resurface.
    const deletedFallback = e({ id: 'X', status: 'draft', approvedAt: '2026-02-09T00:00:00.000Z', deletedAt: '2026-02-11T00:00:00.000Z' })
    const out = visibleEntries([deletedFallback, live], { canEdit: true, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['L'])
  })
})

describe('tagVersion — precedence: deleted wins over live', () => {
  test('deleted beats live even when the row is in the live set', () => {
    // Hand-built approved+deleted row: the DB now FORBIDS this state (CHECK constraint),
    // and historyEntries never puts a deleted row in liveIds. The pure function must be
    // robust to it anyway, so a later refactor widening the winner set cannot relabel
    // a deleted row as 'live'.
    const row = e({ id: 'Z', status: 'approved', deletedAt: '2026-02-10T00:00:00.000Z' })
    expect(tagVersion(row, new Set(['Z']))).toBe('deleted')
  })
  test('live when it wins the period', () => {
    expect(tagVersion(e({ id: 'A', status: 'approved' }), new Set(['A']))).toBe('live')
  })
  test('superseded when approved but not the winner', () => {
    expect(tagVersion(e({ id: 'B', status: 'approved' }), new Set(['A']))).toBe('superseded')
  })
  test('draft otherwise', () => {
    expect(tagVersion(e({ id: 'C', status: 'draft' }), new Set(['A']))).toBe('draft')
  })
})

describe('historyEntries', () => {
  const approver = { canEdit: true, canApprove: true }

  test('returns [] for a non-approver, even an editor', () => {
    const entries = [e({ id: 'A', status: 'approved' })]
    expect(historyEntries(entries, { canEdit: true, canApprove: false })).toEqual([])
    expect(historyEntries(entries, { canEdit: false, canApprove: false })).toEqual([])
  })

  test('groups every version by period and tags each one', () => {
    const liveRow = e({ id: 'B', status: 'approved', approvedAt: '2026-02-05T00:00:00.000Z' })
    const oldRow = e({ id: 'A', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const goneRow = e({ id: 'D', status: 'draft', deletedAt: '2026-02-02T00:00:00.000Z' })
    const out = historyEntries([liveRow, oldRow, goneRow], approver)

    expect(out).toHaveLength(1)
    expect(out[0].periodStart).toBe('2026-01-01')
    expect(out[0].versions.map((v) => [v.entry.id, v.tag])).toEqual([
      ['B', 'live'],
      ['A', 'superseded'],
      ['D', 'deleted'],
    ])
  })

  test('separate periods become separate groups, input order preserved', () => {
    const feb = e({ id: 'feb', periodStart: '2026-02-01', periodEnd: '2026-02-28', status: 'approved' })
    const jan = e({ id: 'jan', status: 'approved' })
    const out = historyEntries([feb, jan], approver)
    expect(out.map((g) => g.periodStart)).toEqual(['2026-02-01', '2026-01-01'])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/commentary/select.test.ts`
Expected: FAIL — `historyEntries is not a function`, `tagVersion is not a function`, and the deleted-row visibility tests fail because nothing filters `deletedAt` yet.

- [ ] **Step 4: Implement**

In `lib/commentary/select.ts`, replace `visibleEntries` and append the two new functions. Update the imports first:

```ts
import type {
  CommentaryEntry,
  CommentaryCapabilities,
  CommentaryVersionTag,
  CommentaryVersion,
  CommentaryPeriodHistory,
} from './types'
```

```ts
/** Everyone sees at most one approved entry — the most recently approved — per
 *  reporting period, so a re-approval *replaces* the previous version rather than
 *  stacking beside it. Avenue Z staff additionally see drafts (including a pending
 *  edit that forked off an approved entry); clients see approved entries only.
 *
 *  Soft-deleted rows are excluded outright, for every viewer. This is the ONLY thing
 *  standing between a deleted draft and a client's screen — every read path funnels
 *  through here (the approver log goes through historyEntries below).
 *
 *  Superseded rows are hidden, not deleted. Deduping at read time (rather than
 *  demoting or dropping rows on approve) is what lets a revoke *fall back* to the
 *  previously approved version for that period — with no row mutation or deletion. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  const alive = entries.filter((x) => !x.deletedAt)
  const approved = mostRecentApprovedPerPeriod(alive.filter((x) => x.status === 'approved'))
  if (!caps.canEdit) return approved

  // Preserve the caller's ordering (period desc, updatedAt desc) rather than the
  // grouped order, so the dropdown stays newest-period-first.
  const live = new Set(approved.map((x) => x.id))
  return alive.filter((x) => x.status === 'draft' || live.has(x.id))
}

/** Label one version relative to what the client currently sees.
 *
 *  PRECEDENCE IS PART OF THE CONTRACT: `deleted` is checked FIRST, before the
 *  live-winner test. A deleted row can't reach liveIds today (it keeps status
 *  'draft', and the DB CHECK forbids approved+deleted), so this is defense-in-depth
 *  — it keeps the function correct regardless of how the caller builds liveIds. */
export function tagVersion(entry: CommentaryEntry, liveIds: Set<string>): CommentaryVersionTag {
  if (entry.deletedAt) return 'deleted'
  if (liveIds.has(entry.id)) return 'live'
  if (entry.status === 'approved') return 'superseded'
  return 'draft'
}

/** The full version stack — superseded, drafts, and deleted rows — grouped by
 *  reporting period. APPROVERS ONLY: returns [] for anyone else.
 *
 *  This gate is enforced server-side by the RSC that calls it. It must never be
 *  weakened to a UI-only check: these entries carry body text that a client (and a
 *  non-approver editor) must not receive across the RSC→client boundary. */
export function historyEntries(
  entries: CommentaryEntry[],
  caps: CommentaryCapabilities,
): CommentaryPeriodHistory[] {
  if (!caps.canApprove) return []

  const liveIds = new Set(
    mostRecentApprovedPerPeriod(
      entries.filter((x) => x.status === 'approved' && !x.deletedAt),
    ).map((x) => x.id),
  )

  const groups = new Map<string, CommentaryPeriodHistory>()
  for (const entry of entries) {
    const key = `${entry.periodStart}|${entry.periodEnd}`
    let group = groups.get(key)
    if (!group) {
      group = { periodStart: entry.periodStart, periodEnd: entry.periodEnd, versions: [] }
      groups.set(key, group)
    }
    const version: CommentaryVersion = { entry, tag: tagVersion(entry, liveIds) }
    group.versions.push(version)
  }
  return [...groups.values()]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/commentary/select.test.ts`
Expected: PASS, all suites.

- [ ] **Step 6: Full suite + type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/commentary/select.ts lib/commentary/select.test.ts lib/commentary/types.ts
git commit -m "feat(commentary): hide deleted rows from every view; derive the approver history log"
```

---

## Task 3: The pure delete guard

**Files:**
- Modify: `lib/commentary/mutations.ts`
- Test: `lib/commentary/mutations.test.ts`

**Interfaces:**
- Produces: `canDeleteDraft(row: { status: CommentaryStatus; deletedAt: Date | string | null } | undefined): { ok: boolean; error?: string }` — Task 4 consumes this.

Lives in `mutations.ts` (not the action file) because a `'use server'` module may only export async actions — the same reason `planCommentaryWrite` and `authorizeRowForClient` live here.

- [ ] **Step 1: Write the failing tests**

Append to `lib/commentary/mutations.test.ts`, and add `canDeleteDraft` to the import on line 2:

```ts
describe('canDeleteDraft', () => {
  test('a live draft is deletable', () => {
    expect(canDeleteDraft({ status: 'draft', deletedAt: null })).toEqual({ ok: true })
  })
  test('an approved entry is NOT deletable — it may be client-visible', () => {
    expect(canDeleteDraft({ status: 'approved', deletedAt: null }).ok).toBe(false)
  })
  test('an already-deleted row returns an explicit failure, not a silent ok', () => {
    // A silent { ok: true } would let the UI report "deleted" for a no-op.
    expect(canDeleteDraft({ status: 'draft', deletedAt: new Date() })).toEqual({ ok: false, error: 'not found' })
  })
  test('a missing row is rejected', () => {
    expect(canDeleteDraft(undefined).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/commentary/mutations.test.ts`
Expected: FAIL — `canDeleteDraft is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/commentary/mutations.ts`:

```ts
/** Only a live draft may be soft-deleted.
 *
 *  Approved entries are refused because they may be what a client is currently
 *  reading — deletion must never pull content out from under them. An already-deleted
 *  row is refused with the SAME 'not found' as a missing row, so a double-delete is an
 *  explicit failure rather than a silent success the UI would report as "deleted". */
export function canDeleteDraft(
  row: { status: CommentaryStatus; deletedAt: Date | string | null } | undefined,
): { ok: boolean; error?: string } {
  if (!row || row.deletedAt) return { ok: false, error: 'not found' }
  if (row.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted.' }
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/commentary/mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commentary/mutations.ts lib/commentary/mutations.test.ts
git commit -m "feat(commentary): pure guard — only live drafts are deletable"
```

---

## Task 4: The `deleteCommentaryDraft` server action

**Files:**
- Modify: `app/actions/commentary.ts` (the `findCommentaryRow` helper at :18-26, plus a new action at the end)

**Interfaces:**
- Consumes: `canDeleteDraft` (Task 3), `authorizeRowForClient` (already in tree)
- Produces: `deleteCommentaryDraft(clientSlug: string, id: string): Promise<Result>` — Task 6 (panel) calls this.

- [ ] **Step 1: Widen `findCommentaryRow` to return `deletedAt`**

The guard needs it. In `app/actions/commentary.ts`:

```ts
/** Not exported: a `'use server'` module may only export async *actions*. */
async function findCommentaryRow(id: string) {
  const rows = await db
    .select({
      status: reportCommentary.status,
      clientId: reportCommentary.clientId,
      deletedAt: reportCommentary.deletedAt,
    })
    .from(reportCommentary)
    .where(eq(reportCommentary.id, id))
    .limit(1)
  return rows[0]
}
```

- [ ] **Step 2: Import the guard**

Update the import line:

```ts
import { validateCommentaryInput, planCommentaryWrite, authorizeRowForClient, canDeleteDraft } from '@/lib/commentary/mutations'
```

- [ ] **Step 3: Add the action at the end of the file**

```ts
/** Soft-delete a draft. Any Avenue Z editor may delete any draft (product decision,
 *  2026-07-14): deleting is not a greater power than editing, since an editor can
 *  already gut a draft's contents by editing it.
 *
 *  The row is retained — `deleted_at` is set, nothing is removed — so the approver
 *  history log still shows it and it stays recallable at the DB level. Approved
 *  entries are refused (see canDeleteDraft): they may be what a client is reading.
 *
 *  deletedBy is the AUTHENTICATED actor, taken from the session — never a parameter.
 *  An audit log whose attribution can be asserted by the caller is worthless. */
export async function deleteCommentaryDraft(clientSlug: string, id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canEditCommentary(email)) return { ok: false, error: 'forbidden' }

  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const row = await findCommentaryRow(id)

  const authorized = authorizeRowForClient(row, client.id)
  if (!authorized.ok) return { ok: false, error: authorized.error! }

  const deletable = canDeleteDraft(row)
  if (!deletable.ok) return { ok: false, error: deletable.error! }

  await db
    .update(reportCommentary)
    .set({ deletedAt: new Date(), deletedBy: email!, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}
```

- [ ] **Step 4: Type-check + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass.

- [ ] **Step 5: Commit**

```bash
git add app/actions/commentary.ts
git commit -m "feat(commentary): deleteCommentaryDraft server action (soft delete, draft-only, client-scoped)"
```

---

## Task 5: The security boundary — RSC computes history, and the test that proves it

**This is the task the PR blocks on.** Read §4 of the spec before starting.

**Files:**
- Modify: `components/report-sections/commentary/index.tsx`
- Create: `components/report-sections/commentary/index.test.tsx`

**Interfaces:**
- Consumes: `historyEntries` (Task 2)
- Produces: `CommentaryPanel` gains a `history: CommentaryPeriodHistory[]` prop (Task 6 renders it)

**Why a DOM test is not enough:** props cross the RSC→client boundary and land in the browser bundle. A test asserting *"the history section doesn't render for a client"* passes while every superseded and deleted body still ships to the client. The test below mocks `CommentaryPanel`, renders the RSC, and inspects **the props it actually received**.

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/commentary/index.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

// Capture the props that actually cross the RSC → client boundary.
// This is the point of the test: NOT what renders, but what ships.
let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => {
    captured = props
    return null
  },
}))

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))

const ENTRIES: CommentaryEntry[] = [
  {
    id: 'live', viewKey: 'peec-ai', bodyHtml: '<p>APPROVED BODY</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'approved',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-09T20:01:00.000Z',
    approvedBy: 'thomas@avenuez.com', approvedAt: '2026-07-10T13:12:00.000Z',
    deletedAt: null, deletedBy: null,
  },
  {
    id: 'superseded', viewKey: 'peec-ai', bodyHtml: '<p>SUPERSEDED SECRET</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'approved',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-03T14:40:00.000Z',
    approvedBy: 'paul@avenuez.com', approvedAt: '2026-07-03T14:40:00.000Z',
    deletedAt: null, deletedBy: null,
  },
  {
    id: 'deleted', viewKey: 'peec-ai', bodyHtml: '<p>DELETED SECRET</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'draft',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-02T11:03:00.000Z',
    approvedBy: null, approvedAt: null,
    deletedAt: '2026-07-02T12:00:00.000Z', deletedBy: 'paul@avenuez.com',
  },
]

vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async () => ({ id: 'client-1', slug: 'acme' }),
  getCommentaryForView: async () => ENTRIES,
}))

// Render the async RSC and hand its element to the DOM so the mocked panel runs.
async function renderSection() {
  const { CommentarySection } = await import('./index')
  const element = await CommentarySection({ clientSlug: 'acme', viewKey: 'peec-ai' })
  render(element)
  return captured
}

describe('CommentarySection — RSC boundary', () => {
  beforeEach(() => {
    captured = null
    process.env.COMMENTARY_APPROVERS = 'thomas@avenuez.com'
  })

  test('a CLIENT receives no history across the boundary', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'someone@clientco.com' } })
    const props = await renderSection()

    expect(props?.history).toEqual([])
    // Belt and braces: no superseded or deleted body may appear ANYWHERE in the payload.
    const payload = JSON.stringify(props)
    expect(payload).not.toContain('SUPERSEDED SECRET')
    expect(payload).not.toContain('DELETED SECRET')
  })

  test('a NON-APPROVER EDITOR receives no history either', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'editor@avenuez.com' } })
    const props = await renderSection()

    expect(props?.history).toEqual([])
    const payload = JSON.stringify(props)
    expect(payload).not.toContain('SUPERSEDED SECRET')
    expect(payload).not.toContain('DELETED SECRET')
  })

  test('an APPROVER receives the full history', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'thomas@avenuez.com' } })
    const props = await renderSection()

    const history = props?.history as { versions: { entry: { id: string }; tag: string }[] }[]
    expect(history).toHaveLength(1)
    expect(history[0].versions.map((v) => [v.entry.id, v.tag])).toEqual([
      ['live', 'live'],
      ['superseded', 'superseded'],
      ['deleted', 'deleted'],
    ])
  })

  test('the deleted draft never reaches the visible entries, for anyone', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'thomas@avenuez.com' } })
    const props = await renderSection()

    const entries = props?.entries as CommentaryEntry[]
    expect(entries.map((x) => x.id)).toEqual(['live'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report-sections/commentary/index.test.tsx`
Expected: FAIL — `props.history` is `undefined` (the RSC doesn't pass it yet).

- [ ] **Step 3: Implement the boundary**

In `components/report-sections/commentary/index.tsx`:

```tsx
// components/report-sections/commentary/index.tsx
import { auth } from '@/auth'
import { getClientBySlug, getCommentaryForView } from '@/lib/db/queries'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { visibleEntries, pickDefaultEntry, historyEntries } from '@/lib/commentary/select'
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

  // THE SECURITY BOUNDARY. historyEntries returns [] for a non-approver, so superseded
  // and deleted bodies are never serialized into the browser bundle. Gating this in the
  // panel's JSX instead would still ship them — props cross the boundary regardless of
  // what renders. Do not move this check into CommentaryPanel.
  const history = historyEntries(all, capabilities)

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
      history={history}
    />
  )
}
```

- [ ] **Step 4: Add the prop to the panel's signature**

`CommentaryPanel` must accept it or TypeScript fails. In `components/report-sections/commentary/commentary-panel.tsx`, add to the imports and the props type (the body is Task 6):

```ts
import type { CommentaryEntry, CommentaryCapabilities, CommentaryPeriodHistory } from '@/lib/commentary/types'
```

```ts
export function CommentaryPanel({
  clientSlug,
  viewKey,
  entries,
  initialId,
  capabilities,
  history,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entries: CommentaryEntry[]
  initialId: string | null
  capabilities: CommentaryCapabilities
  history: CommentaryPeriodHistory[]
}) {
```

The existing `commentary-panel.test.tsx` renders the panel directly — add `history={[]}` to its `renderPanel` helper so it still type-checks.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run components/report-sections/commentary/index.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Full suite + type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/commentary/
git commit -m "feat(commentary): compute approver history server-side; test the RSC boundary payload"
```

---

## Task 6: The UI — Delete button + History disclosure

**Files:**
- Modify: `components/report-sections/commentary/commentary-panel.tsx`
- Test: `components/report-sections/commentary/commentary-panel.test.tsx`

**Interfaces:**
- Consumes: `deleteCommentaryDraft` (Task 4), the `history` prop (Task 5)

- [ ] **Step 1: Write the failing tests**

In `commentary-panel.test.tsx`: add `deleteCommentaryDraft: vi.fn()` to the existing `vi.mock('@/app/actions/commentary', …)` factory, add `deletedAt: null, deletedBy: null` to the `ENTRY` fixture, and extend `renderPanel` to take capabilities and history. Then append:

```tsx
const DRAFT: CommentaryEntry = { ...ENTRY, id: 'd1', status: 'draft', approvedBy: null, approvedAt: null }

function renderWith(opts: {
  entry?: CommentaryEntry
  canEdit?: boolean
  canApprove?: boolean
  history?: CommentaryPeriodHistory[]
}) {
  const entry = opts.entry ?? ENTRY
  return render(
    <CommentaryPanel
      clientSlug="acme"
      viewKey="peec-ai"
      entries={[entry]}
      initialId={entry.id}
      capabilities={{ canEdit: opts.canEdit ?? false, canApprove: opts.canApprove ?? false }}
      history={opts.history ?? []}
    />,
  )
}

describe('delete draft button', () => {
  test('an editor sees Delete on a draft', () => {
    renderWith({ entry: DRAFT, canEdit: true })
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })
  test('no Delete on an approved entry — it may be client-visible', () => {
    renderWith({ entry: ENTRY, canEdit: true })
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
  test('a client never sees Delete', () => {
    renderWith({ entry: DRAFT, canEdit: false })
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
  test('Delete calls the action only after the confirm is accepted', async () => {
    const { deleteCommentaryDraft } = await import('@/app/actions/commentary')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWith({ entry: DRAFT, canEdit: true })
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(deleteCommentaryDraft).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(deleteCommentaryDraft).toHaveBeenCalledWith('acme', 'd1')

    confirmSpy.mockRestore()
  })
})

describe('history disclosure', () => {
  const HISTORY: CommentaryPeriodHistory[] = [{
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    versions: [
      { entry: ENTRY, tag: 'live' },
      { entry: { ...ENTRY, id: 'old', bodyHtml: '<p>OLD</p>' }, tag: 'superseded' },
      { entry: { ...DRAFT, id: 'gone', bodyHtml: '<p>GONE</p>' }, tag: 'deleted' },
    ],
  }]

  test('an approver sees the History disclosure', () => {
    renderWith({ canEdit: true, canApprove: true, history: HISTORY })
    expect(screen.getByText(/History/)).toBeTruthy()
  })
  test('an editor with an empty history sees no disclosure', () => {
    renderWith({ canEdit: true, canApprove: false, history: [] })
    expect(screen.queryByText(/History/)).toBeNull()
  })
  test('expanding shows every version with its tag', () => {
    renderWith({ canEdit: true, canApprove: true, history: HISTORY })
    fireEvent.click(screen.getByText(/History/))
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.getByText('superseded')).toBeTruthy()
    expect(screen.getByText('deleted')).toBeTruthy()
  })
})
```

Update the test file's imports:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CommentaryEntry, CommentaryPeriodHistory } from '@/lib/commentary/types'
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report-sections/commentary/commentary-panel.test.tsx`
Expected: FAIL — no `Delete draft` button, no History disclosure.

- [ ] **Step 3: Implement the delete handler**

In `commentary-panel.tsx`, extend the action import and add state + handler next to `doApprove`/`doRevoke`:

```ts
import { approveCommentary, revokeCommentary, deleteCommentaryDraft } from '@/app/actions/commentary'
```

```ts
  const [historyOpen, setHistoryOpen] = useState(false)
```

```ts
  function doDelete(id: string) {
    if (!window.confirm('Delete this draft? It stays recoverable in the approver history log.')) return
    startTransition(async () => { await deleteCommentaryDraft(clientSlug, id); refresh() })
  }
```

- [ ] **Step 4: Add the Delete button**

Inside the existing `{capabilities.canEdit && (…)}` button row, after the Approve/Revoke buttons:

```tsx
                  {selected.status === 'draft' && (
                    <Button onClick={() => doDelete(selected.id)} disabled={isPending}>Delete draft</Button>
                  )}
```

- [ ] **Step 5: Add the History disclosure**

Immediately before the closing `</div>` of the `{!collapsed && (…)}` block (i.e. after the editor block at the end):

```tsx
          {history.length > 0 && (
            <div className="border-t border-white/[0.08] pt-3">
              <button
                type="button"
                onClick={() => setHistoryOpen((h) => !h)}
                className="flex items-center gap-2 text-xs font-semibold text-text-muted"
              >
                <span>{historyOpen ? '▾' : '▸'}</span>
                History ({history.reduce((n, g) => n + g.versions.length, 0)} versions)
              </button>

              {historyOpen && (
                <div className="mt-3 space-y-4">
                  {history.map((group) => (
                    <div key={`${group.periodStart}|${group.periodEnd}`} className="space-y-2">
                      <p className="text-xs font-semibold text-white">
                        {fmt(group.periodStart)} – {fmt(group.periodEnd)}
                      </p>
                      {group.versions.map(({ entry, tag }) => (
                        <div key={entry.id} className="rounded border border-white/[0.08] p-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded px-2 py-0.5 font-semibold ${TAG_STYLE[tag]}`}>{tag}</span>
                            <span className="text-text-muted">
                              {entry.deletedAt
                                ? `deleted by ${entry.deletedBy} on ${fmtDateTime(entry.deletedAt)}`
                                : entry.approvedAt && entry.approvedBy
                                  ? `approved by ${entry.approvedBy} on ${fmtDateTime(entry.approvedAt)}`
                                  : `updated by ${entry.updatedBy} on ${fmtDateTime(entry.updatedAt)}`}
                            </span>
                          </div>
                          <div
                            className="mt-1 text-xs text-text-muted [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
```

And add the tag palette next to `fmtDateTime` at the top of the file:

```ts
const TAG_STYLE: Record<CommentaryVersionTag, string> = {
  live: 'bg-green-500/15 text-green-400',
  superseded: 'bg-white/10 text-text-muted',
  deleted: 'bg-red-500/15 text-red-400',
  draft: 'bg-yellow-500/15 text-yellow-400',
}
```

with `CommentaryVersionTag` added to the type import.

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run components/report-sections/commentary/commentary-panel.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full suite + type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/commentary/
git commit -m "feat(commentary): delete-draft button + approver-only history disclosure"
```

---

## Task 7: Verify end-to-end and open the PR

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit && npx vitest run && npm run check:rsc && npm run lint
```

Expected: all clean. Remember `check:rsc` passing means **nothing** about the leak in Task 5 — it is a serialization guard, not a confidentiality one.

- [ ] **Step 2: Confirm the choke point is still single**

The invariant from spec §2. Run:

```bash
grep -rn --include='*.ts' --include='*.tsx' 'getCommentaryForView' . --exclude-dir=node_modules --exclude-dir=.next
```

Expected: exactly two hits — the definition in `lib/db/queries.ts` and the single consumer in `components/report-sections/commentary/index.tsx`. **If a third consumer exists, it must go through `visibleEntries` or `historyEntries`, or deleted content leaks.**

- [ ] **Step 3: Drive it in the real app**

Migration must be applied first (`npm run db:migrate`, needs `DATABASE_URL`). Then `npm run dev` and, on a report page with commentary:

1. As an editor, create a draft → **Delete draft** appears → click → confirm → the draft disappears from the dropdown.
2. As an approver, expand **History** → the deleted draft is listed, tagged `deleted`, with who deleted it and when.
3. Confirm the approved entry has **no** Delete button.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/commentary-history-and-soft-delete
```

PR into `feat/report-commentary`. The body must state:
- soft-delete retains the row; nothing is destroyed
- **the delete policy (any editor deletes any draft) was approved by Paul, not Tina** — spec §3
- the migration needs applying to Neon before this is usable in an environment
- reviewers must not read `rsc-boundary ✓` as covering the Task 5 leak

---

## Self-Review

**Spec coverage:**

| Spec § | Covered by |
|---|---|
| §1 columns + CHECK constraint + `deletedBy` provenance | Task 1, Task 4 Step 3 |
| §2 `visibleEntries` excludes deleted (both views) | Task 2 |
| §2 `historyEntries` + tag precedence | Task 2 |
| §2 choke point stays single | Task 7 Step 2 |
| §3 `deleteCommentaryDraft`, draft-only, editor-gated, explicit double-delete failure | Tasks 3 + 4 |
| §4 RSC boundary, empty array for non-approvers | Task 5 |
| §4 panel never refetches | No fetch is added; Task 6 only calls server actions |
| §5 payload test, staff+client deleted exclusion, precedence collision, guard tests | Tasks 2, 3, 5, 6 |
| §6 no restore UI | Not built — history is read-only in Task 6 |
| §7 base branch | Header |

**Type consistency:** `historyEntries` / `tagVersion` / `canDeleteDraft` / `deleteCommentaryDraft(clientSlug, id)` / `CommentaryPeriodHistory` / `CommentaryVersionTag` are used with identical names and signatures in every task that references them.

**Known ordering hazard:** Task 5 Step 4 adds the `history` prop to `CommentaryPanel`'s signature; Task 6 renders it. Doing Task 6 before Task 5 will not type-check.
