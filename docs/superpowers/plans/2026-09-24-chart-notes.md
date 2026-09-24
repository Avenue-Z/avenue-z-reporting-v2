# Written notes on the annotated graphs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Written by me (Thomas) on 2026-09-24. Every file, function and line this plan names was read on
`dev` at `df2cf05`. Two things were proven by running them before the plan was written, in a
scratch copy outside the repo: the exact SQL `drizzle-kit generate` produces for the new table
(Task 1 shows it), and that the hover box component type-checks against the installed Recharts
3.7.0 under `strict`.

**Goal:** Let the team put a short, approved note on any day of a v2 Organic Social graph, with up
to 2 of that day's posts, shown on the callout and in the chart's hover box.

**Architecture:** A new additive table, `chart_notes`, holds notes with Commentary's draft and
approve lifecycle. The two v2 graph parts read them once per platform and merge them into the
annotation list they already build, before the existing hides layer runs, so a hide still wins.
Four server actions write them, each checking the role and the email. The shared `LineChart` gains
one optional prop for the hover box; with the prop absent it renders exactly what it renders today.

**Tech Stack:** Next.js 16 App Router, React 19.2.3, TypeScript strict, Drizzle ORM 0.45.2 on Neon
(`drizzle-orm/neon-http`), Recharts 3.7.0, Vitest 3 with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-chart-annotations-design.md`, section "Phase 2:
written notes" (P1 to P13). The team confirmed the reading on 2026-09-24 (Kyleah): any day, the
team picks that day's posts, a short note, shown on the callout and on hover, approved before a
client sees it.

## Global Constraints

- **Renaissance is untouched.** Its graphs are v1 and never call the notes code. Every existing
  golden snapshot stays byte-identical: `git diff --name-only origin/dev -- '*.snap'` prints
  nothing at the end. The Renaissance drift check's `REN.*` lines stay identical on staging.
- **Every shared change is optional and off by default:** the `LineChart` `notes` prop, the
  `email` field on `OrganicSocialCtx`, the new optional fields on `Annotation` and
  `ChartAnnotation`, and the `noteControls` prop on the two chart components.
- **Notes:** 1 to 80 characters after trimming, counted as characters (an emoji counts once), one
  line, plain text rendered as text. Up to 2 post ids. A day that is not after today in UTC.
- **Who:** team or client by role (`viewerForRole`); write needs `canEditCommentary(email)`;
  approve and revoke need `canApproveCommentary(email)`. A client role is refused whatever its
  email.
- **One open draft per client, platform, chart and day**, enforced by the partial unique index
  `chart_notes_one_open_draft`.
- **Public repo:** no client names, client figures, brand ids, database hosts or the staging URL
  in any committed file. Test data is invented.
- **Writing:** no em or en dashes anywhere (code comments, tests, commits, PR text). First person
  as me.
- **Branch flow:** `feat/os-chart-notes` off `dev`, one PR to `dev` titled with "→ dev". The
  migration runs on staging only on my written go, with a host guard first. Nothing goes to
  production until Jasmine approves staging, and never without my written go.
- **Work style:** foreground only, no subagents or background tasks.
- **Test discovery:** `vitest.config.ts` includes `lib/organic-social/**`, `app/actions/**` and
  `components/report-sections/**` by glob, and `components/charts/line-chart.test.tsx` by name.
  Every new test file below sits under one of those globs, so the config does not change.
- **Checks CI runs** (`.github/workflows/checks.yml`): `npm run check:rsc` and `npm test`. Also
  run `npx tsc --noEmit` and `npm run lint` locally.

## Review Focus

1. **A note on a day that lost followers, or had none.** The card must read `8/14 | the note`,
   never `+-3 Followers`. Pinned in Task 5 (`a day that lost followers keeps its note and never
   gets a signed number`).
2. **A picked post that is from another day, or that Dash no longer returns.** It must never show;
   when every pick is gone the card keeps the day's top post. Pinned in Task 5.
3. **A team session with no email, or with an email outside `@avenuez.com`.** It must get exactly
   the client view: approved notes only, no drafts, no ids, no controls. Pinned in Tasks 2 and 5.
4. **Two saves racing for the same day** (a double click, or two people). The second must come back
   as a clear message, not a thrown error. Pinned in Task 4.
5. **The live month.** The form must never offer a day after today, and the server must refuse one
   sent directly. Pinned in Tasks 2 and 5.

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Cut the branch from dev**

```bash
git fetch origin
git switch -c feat/os-chart-notes origin/dev
git log --oneline -1
```

Expected: the tip is `origin/dev`.

- [ ] **Step 2: Record the baseline**

```bash
npm test 2>&1 | tail -6
```

Expected: every test passes. Write the "Test Files" and "Tests" counts into the PR description
later, as the before numbers.

---

### Task 1: The `chart_notes` table and migration 0025

**Files:**
- Modify: `lib/db/schema.ts:1` (import `uniqueIndex`), and insert after `:396`
  (`export type ChartAnnotationHide ...`)
- Create (generated): `drizzle/0025_chart_notes.sql`, `drizzle/meta/0025_snapshot.json`
- Modify (generated): `drizzle/meta/_journal.json`
- Create: `lib/organic-social/chart-notes/migration.test.ts`
- Modify: `MIGRATIONS-PENDING.md` (append a section)

**Interfaces:**
- Produces: `chartNotes` (table) and `ChartNote` (`typeof chartNotes.$inferSelect`) from
  `@/lib/db/schema`. Columns: `id`, `clientId`, `channel`, `chart`, `day` (string, yyyy-mm-dd),
  `body`, `postIds` (number[]), `status` ('draft' | 'approved'), `createdBy`, `updatedBy`,
  `approvedBy`, `createdAt`, `updatedAt`, `approvedAt`, `deletedAt`, `deletedBy`.

- [ ] **Step 1: Write the failing test**

`lib/organic-social/chart-notes/migration.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The migration is the one change here that reaches a shared database, so what it does is pinned
// as text: one new table, nothing else touched.
const dir = join(process.cwd(), 'drizzle')
const file = readdirSync(dir).find((f) => f.startsWith('0025_'))
const sql = file ? readFileSync(join(dir, file), 'utf8') : ''
const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)

test('0025 exists and is the last migration in the journal', () => {
  expect(file).toBe('0025_chart_notes.sql')
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  expect(journal.entries.at(-1)?.tag).toBe('0025_chart_notes')
})

test('every statement is about chart_notes and nothing else', () => {
  expect(statements.length).toBe(4)
  for (const s of statements) expect(s).toContain('"chart_notes"')
  expect(sql).not.toMatch(/DROP|ALTER TABLE "(?!chart_notes")/)
})

test('a day holds at most one open draft', () => {
  expect(sql).toContain(
    `CREATE UNIQUE INDEX "chart_notes_one_open_draft" ON "chart_notes" USING btree ("client_id","channel","chart","day") WHERE status = 'draft' AND deleted_at IS NULL;`,
  )
})

test('a deleted note is always a draft, as Commentary enforces', () => {
  expect(sql).toContain(
    `CONSTRAINT "chart_notes_no_deleted_approved" CHECK ("chart_notes"."deleted_at" IS NULL OR "chart_notes"."status" = 'draft')`,
  )
})

test('it reuses the commentary status enum and stores post ids as a list', () => {
  expect(sql).toContain(`"status" "commentary_status" DEFAULT 'draft' NOT NULL`)
  expect(sql).toContain(`"post_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL`)
  expect(sql).not.toContain('CREATE TYPE')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/organic-social/chart-notes/migration.test.ts`
Expected: FAIL, `expected undefined to be '0025_chart_notes.sql'`.

- [ ] **Step 3: Add the table to the schema**

In `lib/db/schema.ts:1`, add `uniqueIndex` to the `drizzle-orm/pg-core` import:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, integer, unique, boolean, date, check, bigint, uniqueIndex } from 'drizzle-orm/pg-core'
```

Insert after `export type ChartAnnotationHide = typeof chartAnnotationHides.$inferSelect` (`:396`):

```ts

// One row per written note on a v2 Organic Social graph (annotations Phase 2), keyed like
// chart_annotation_hides by client, platform, chart and day. Commentary's lifecycle: a note is
// saved as a draft, approved before a client sees it, and only a draft is ever soft deleted. A day
// can hold several approved rows (a client sees the most recently approved) but at most one open
// draft, enforced by the partial unique index below. Purely additive: nothing Renaissance renders
// reads it.
export const chartNotes = pgTable('chart_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),   // DashChannel, e.g. 'INSTAGRAM'
  chart: text('chart').notNull(),       // 'followers' | 'engagements'
  day: date('day').notNull(),           // yyyy-mm-dd, the UTC day Dash counts
  body: text('body').notNull(),         // 1 to 80 characters of plain text, checked by the action
  postIds: bigint('post_ids', { mode: 'number' }).array().notNull().default(sql`'{}'::bigint[]`), // Dash post ids, at most 2
  status: commentaryStatusEnum('status').notNull().default('draft'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  approvedBy: text('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
}, (table) => ({
  clientChannelIdx: index('chart_notes_client_channel_idx').on(table.clientId, table.channel),
  oneOpenDraft: uniqueIndex('chart_notes_one_open_draft')
    .on(table.clientId, table.channel, table.chart, table.day)
    .where(sql`status = 'draft' AND deleted_at IS NULL`),
  noDeletedApproved: check('chart_notes_no_deleted_approved', sql`${table.deletedAt} IS NULL OR ${table.status} = 'draft'`),
}))

export type ChartNote = typeof chartNotes.$inferSelect
```

- [ ] **Step 4: Generate the migration**

```bash
npx drizzle-kit generate --name chart_notes
cat drizzle/0025_chart_notes.sql
```

Expected, exactly (this is what the scratch run produced):

```sql
CREATE TABLE "chart_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"chart" text NOT NULL,
	"day" date NOT NULL,
	"body" text NOT NULL,
	"post_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"status" "commentary_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "chart_notes_no_deleted_approved" CHECK ("chart_notes"."deleted_at" IS NULL OR "chart_notes"."status" = 'draft')
);
--> statement-breakpoint
ALTER TABLE "chart_notes" ADD CONSTRAINT "chart_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_notes_client_channel_idx" ON "chart_notes" USING btree ("client_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_notes_one_open_draft" ON "chart_notes" USING btree ("client_id","channel","chart","day") WHERE status = 'draft' AND deleted_at IS NULL;
```

If the file differs in anything but whitespace, stop and find out why before going on.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run lib/organic-social/chart-notes/migration.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Record the migration as pending**

Append to `MIGRATIONS-PENDING.md`:

```markdown

## Add chart notes (annotations Phase 2; staging pending; production pending)

`drizzle/0025_chart_notes.sql` adds one table, `chart_notes`: the team's written notes on the v2
Organic Social graphs, with Commentary's draft and approve lifecycle. Additive: no existing table,
column or row changes, and nothing Renaissance renders reads it. It reuses the existing
`commentary_status` enum. A partial unique index keeps at most one open draft per client,
platform, chart and day, and a check keeps a deleted note a draft.

Staging, only on my written go and before the code reaches staging:
`CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`. That script does not
check which database it points at, so a host guard runs first. Before: a read-only check that
0025 is the only unrecorded migration. After: a read-only check of the table, its check, both
indexes and the ledger. Production goes the same way, before the production merge, only on my
written go and only after Jasmine approves staging.
```

- [ ] **Step 7: Commit, push, open the draft PR**

```bash
git add lib/db/schema.ts drizzle/0025_chart_notes.sql drizzle/meta/0025_snapshot.json drizzle/meta/_journal.json lib/organic-social/chart-notes/migration.test.ts MIGRATIONS-PENDING.md
git status --porcelain
git commit -m "feat(organic-social): add the chart_notes table (migration 0025)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/os-chart-notes
gh pr create --draft --base dev --title "feat(organic-social): written notes on the annotated graphs → dev" --body "Draft. Plan: docs/superpowers/plans/2026-09-24-chart-notes.md (PR #272). Description to follow."
```

---

### Task 2: Pure rules (types, limits, validation, permissions, which note shows)

**Files:**
- Modify: `lib/organic-social/annotation-hides/mutations.ts:8` (export `isRealDay`)
- Modify: `lib/organic-social/annotations.ts` (new types, `dayLabel`; `annotationLabel` uses it)
- Create: `lib/organic-social/chart-notes/limits.ts`
- Create: `lib/organic-social/chart-notes/validate.ts`, `validate.test.ts`
- Create: `lib/organic-social/chart-notes/permissions.ts`, `permissions.test.ts`
- Create: `lib/organic-social/chart-notes/pick.ts`, `pick.test.ts`

**Interfaces:**
- Consumes: `ChartNote` (Task 1); `isRealDay` from `annotation-hides/mutations.ts:8`; `CHANNELS`
  from `lib/organic-social/metrics.ts:22`; `canEditCommentary`, `canApproveCommentary` from
  `lib/commentary/permissions.ts:18`, `:23`; `viewerForRole` from
  `lib/organic-social/reporting-months.ts:69`.
- Produces:
  - `annotations.ts`: `dayLabel(date: string): string`; types `ChartThumb`, `NoteEditorState`,
    `AnnotationNote`, `NoteControls`; new optional fields `Annotation.note?: AnnotationNote`,
    `Annotation.noteOnly?: true`, `ChartAnnotation.note?: string`,
    `ChartAnnotation.thumbs?: ChartThumb[]`, `ChartAnnotation.noteOnly?: true`,
    `ChartAnnotation.noteEditor?: NoteEditorState`; `ChartAnnotation.thumb` becomes
    `ChartThumb | null` (same shape as today).
  - `limits.ts`: `NOTE_MAX_CHARS = 80`, `NOTE_MAX_POSTS = 2`.
  - `validate.ts`: `validateNoteInput(input, today): { ok: boolean; error?: string }`,
    `isNoteId(id: unknown): id is string`, `todayUtc(now?: Date): string`.
  - `permissions.ts`: `noteCapabilities(role: unknown, email: string | null | undefined, env?: string): { canEdit: boolean; canApprove: boolean }`.
  - `pick.ts`: `latestApproved`, `notesByDay(rows, { chart, from, to, canEdit }): Map<string, DayNote>`, type `DayNote`.

- [ ] **Step 1: Write the failing tests**

`lib/organic-social/chart-notes/validate.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isNoteId, todayUtc, validateNoteInput } from './validate'

const TODAY = '2026-09-24'
const OK = { channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14', body: 'Influencer post went live', postIds: [11, 12] }
const v = (over: Partial<Record<keyof typeof OK, unknown>>) => validateNoteInput({ ...OK, ...over }, TODAY)

test('a real platform, chart, past day, short note and two posts pass', () => {
  expect(validateNoteInput(OK, TODAY)).toEqual({ ok: true })
  expect(v({ chart: 'engagements', postIds: [] })).toEqual({ ok: true })
})

test('today passes; tomorrow is refused even when sent directly', () => {
  expect(v({ day: TODAY })).toEqual({ ok: true })
  expect(v({ day: '2026-09-25' })).toEqual({ ok: false, error: 'That day has not happened yet.' })
})

test('unknown platform, unknown chart and impossible days are refused', () => {
  expect(v({ channel: 'MYSPACE' })).toEqual({ ok: false, error: 'invalid channel' })
  expect(v({ chart: 'reach' })).toEqual({ ok: false, error: 'invalid chart' })
  expect(v({ day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
  expect(v({ day: '8/14/2026' })).toEqual({ ok: false, error: 'invalid day' })
  expect(v({ channel: 7 })).toEqual({ ok: false, error: 'invalid channel' })
})

test('a note is 1 to 80 characters after trimming, counted as characters', () => {
  expect(v({ body: '   ' })).toEqual({ ok: false, error: 'A note is 1 to 80 characters.' })
  expect(v({ body: 'x'.repeat(80) })).toEqual({ ok: true })
  expect(v({ body: 'x'.repeat(81) })).toEqual({ ok: false, error: 'A note is 1 to 80 characters.' })
  expect(v({ body: '🎉'.repeat(80) })).toEqual({ ok: true })
  expect(v({ body: `  ${'x'.repeat(80)}  ` })).toEqual({ ok: true })
  expect(v({ body: 42 })).toEqual({ ok: false, error: 'invalid note' })
})

test('a note is one line of plain text: no line breaks, tabs or other control characters', () => {
  for (const body of ['two\nlines', 'tab\there', 'bell\u0007', 'del\u007f']) {
    expect(v({ body })).toEqual({ ok: false, error: 'A note is one line of plain text.' })
  }
})

test('at most 2 posts, each a positive whole number, no repeats', () => {
  const refused = { ok: false, error: 'Pick at most 2 posts.' }
  expect(v({ postIds: [1, 2, 3] })).toEqual(refused)
  expect(v({ postIds: [5, 5] })).toEqual(refused)
  expect(v({ postIds: [0] })).toEqual(refused)
  expect(v({ postIds: [-1] })).toEqual(refused)
  expect(v({ postIds: [1.5] })).toEqual(refused)
  expect(v({ postIds: ['11'] })).toEqual(refused)
  expect(v({ postIds: '11' })).toEqual(refused)
})

test('a note id is a uuid, so a bad id never reaches the database', () => {
  expect(isNoteId('c7d8e0a1-1111-4111-8111-111111111111')).toBe(true)
  for (const id of ['', 'abc', "1' OR '1'='1", 7, null]) expect(isNoteId(id)).toBe(false)
})

test('today is the UTC date', () => {
  expect(todayUtc(new Date('2026-09-24T23:30:00-04:00'))).toBe('2026-09-25')
})
```

`lib/organic-social/chart-notes/permissions.test.ts`:

```ts
import { expect, test } from 'vitest'
import { noteCapabilities } from './permissions'

const APPROVERS = 'approver@avenuez.com'
const none = { canEdit: false, canApprove: false }

test('any team member with an @avenuez.com email can write; approving also needs the list', () => {
  expect(noteCapabilities('INTERNAL_ANALYST', 'writer@avenuez.com', APPROVERS)).toEqual({ canEdit: true, canApprove: false })
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com', APPROVERS)).toEqual({ canEdit: true, canApprove: true })
})

test('a client role gets nothing, whatever its email', () => {
  expect(noteCapabilities('CLIENT_ADMIN', 'approver@avenuez.com', APPROVERS)).toEqual(none)
  expect(noteCapabilities('CLIENT_VIEWER', 'writer@avenuez.com', APPROVERS)).toEqual(none)
})

test('a team role with no email, or one outside @avenuez.com, gets nothing', () => {
  expect(noteCapabilities('INTERNAL_ADMIN', null, APPROVERS)).toEqual(none)
  expect(noteCapabilities('INTERNAL_ADMIN', 'someone@example.com', APPROVERS)).toEqual(none)
})

test('no role or an unknown role gets nothing', () => {
  expect(noteCapabilities(undefined, 'approver@avenuez.com', APPROVERS)).toEqual(none)
  expect(noteCapabilities('SUPERUSER', 'approver@avenuez.com', APPROVERS)).toEqual(none)
})
```

`lib/organic-social/chart-notes/pick.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { ChartNote } from '@/lib/db/schema'
import { latestApproved, notesByDay } from './pick'

// Every date and text is invented.
const t = (iso: string) => new Date(iso)
const row = (over: Partial<ChartNote>): ChartNote => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: t('2026-09-01T00:00:00Z'), updatedAt: t('2026-09-01T00:00:00Z'),
  approvedAt: t('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const WINDOW = { chart: 'followers' as const, from: '2026-08-01', to: '2026-08-31' }

test('a client sees the most recently approved note of a day, and nothing else', () => {
  const rows = [
    row({ id: 'old', body: 'Old', approvedAt: t('2026-09-01T00:00:00Z') }),
    row({ id: 'new', body: 'New', approvedAt: t('2026-09-02T00:00:00Z') }),
    row({ id: 'd', body: 'Draft', status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  const m = notesByDay(rows, { ...WINDOW, canEdit: false })
  expect([...m.keys()]).toEqual(['2026-08-14'])
  expect(m.get('2026-08-14')).toEqual({ approved: { id: 'new', text: 'New', postIds: [] } })
})

test('a day with only a draft does not exist for a client', () => {
  const rows = [row({ status: 'draft', approvedAt: null, approvedBy: null })]
  expect(notesByDay(rows, { ...WINDOW, canEdit: false }).size).toBe(0)
})

test('an editor sees the approved note, the open draft and the ids to act on them', () => {
  const rows = [
    row({ id: 'a', body: 'Live', postIds: [11] }),
    row({ id: 'd', body: 'Better', postIds: [12], status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  expect(notesByDay(rows, { ...WINDOW, canEdit: true }).get('2026-08-14')).toEqual({
    approved: { id: 'a', text: 'Live', postIds: [11] },
    editor: { approvedId: 'a', approvedPostIds: [11], draft: { id: 'd', text: 'Better', postIds: [12] } },
  })
})

test('a draft-only day exists for an editor, with no approved text', () => {
  const rows = [row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null })]
  expect(notesByDay(rows, { ...WINDOW, canEdit: true }).get('2026-08-14')).toEqual({
    approved: null,
    editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Event', postIds: [] } },
  })
})

test('revoking the newest approval falls back to the one before it, as Commentary does', () => {
  // A revoked note is a draft again (status draft, approval cleared), so the older approval shows.
  const rows = [
    row({ id: 'old', body: 'Old', approvedAt: t('2026-09-01T00:00:00Z') }),
    row({ id: 'revoked', body: 'New', status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  expect(notesByDay(rows, { ...WINDOW, canEdit: false }).get('2026-08-14')?.approved?.text).toBe('Old')
})

test('only this chart, only inside the window, never a deleted row', () => {
  const rows = [
    row({ id: 'eng', chart: 'engagements' }),
    row({ id: 'before', day: '2026-07-31' }),
    row({ id: 'after', day: '2026-09-01' }),
    row({ id: 'gone', status: 'draft', approvedAt: null, deletedAt: t('2026-09-03T00:00:00Z') }),
    row({ id: 'first', day: '2026-08-01' }),
    row({ id: 'last', day: '2026-08-31' }),
  ]
  expect([...notesByDay(rows, { ...WINDOW, canEdit: true }).keys()]).toEqual(['2026-08-01', '2026-08-31'])
})

test('an equal approval time breaks on the later update, so the answer never depends on row order', () => {
  const a = row({ id: 'a', updatedAt: t('2026-09-01T00:00:00Z') })
  const b = row({ id: 'b', updatedAt: t('2026-09-01T00:00:01Z') })
  expect(latestApproved([a, b])?.id).toBe('b')
  expect(latestApproved([b, a])?.id).toBe('b')
  expect(latestApproved([])).toBeNull()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/organic-social/chart-notes/`
Expected: FAIL, cannot resolve `./validate`, `./permissions`, `./pick`.

- [ ] **Step 3: Export `isRealDay`**

`lib/organic-social/annotation-hides/mutations.ts:8`, change `function isRealDay` to
`export function isRealDay`. Nothing else in the file changes.

- [ ] **Step 4: Add the types and `dayLabel` to `lib/organic-social/annotations.ts`**

Replace `annotationLabel` (`:71-77`) with `dayLabel` plus the same `annotationLabel` built on it
(identical output; the existing label tests at `annotations.test.ts:97-116` guard that):

```ts
/** `8/14`: the date half of every label. No leading zeros and no year, since a report covers one
 *  month. A day shown only for its note uses this alone, because its value can be a zero or a
 *  loss, and the peak label below would print `+-3 Followers`. */
export function dayLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

/**
 * `8/10 | +12 Followers` or `8/9 | 35 Engagements`. No leading zeros and no year, since a
 * report covers one month. The deck separates the engagement label with a dash; a pipe is
 * used on both so the two charts read the same way.
 */
export function annotationLabel(date: string, value: number, chart: AnnotationChart): string {
  const when = dayLabel(date)
  const amount = value.toLocaleString('en-US')
  if (chart === 'followers') return `${when} | +${amount} Follower${value === 1 ? '' : 's'}`
  return `${when} | ${amount} Engagement${value === 1 ? '' : 's'}`
}
```

Add to `interface Annotation` (`:48-54`), after `hidden?: boolean`:

```ts
  /** Phase 2: the team's note for this day, already cut to what this viewer may see. */
  note?: AnnotationNote
  /** Phase 2: not a peak; shown only because the day has a note. Its label carries no number, and
   *  its value is never drawn (a day with no point on the series carries 0). */
  noteOnly?: true
```

Add after `interface AnnotationControls` (ends `:61`):

```ts

/** The part of a post the callout row draws: its picture and its link. Never a caption, a metric
 *  or an id. */
export interface ChartThumb {
  creative: Creative | null
  mediaType: TopContentPost['mediaType']
  url: string | null
}

/** What an editor needs to act on one day's notes. Never sent to anyone who cannot edit. */
export interface NoteEditorState {
  approvedId: string | null
  approvedPostIds: number[]
  draft: { id: string; text: string; postIds: number[] } | null
}

/** One day's note on the server, before it is trimmed for the chart. */
export interface AnnotationNote {
  /** The approved text, or null while the day has only a draft (only an editor ever sees that). */
  text: string | null
  /** The approved note's picked posts that Dash still returns for that day. Empty keeps `post`. */
  posts: TopContentPost[]
  /** Editors only. */
  editor?: NoteEditorState
}

/** What the Add note and Edit forms need for one chart. Editors only. */
export interface NoteControls {
  clientSlug: string
  channel: DashChannel
  chart: AnnotationChart
  canApprove: boolean
  /** The days a note may go on, oldest first (never after today), each with that day's posts. */
  days: { day: string; posts: { id: number; thumb: ChartThumb }[] }[]
}
```

In `interface ChartAnnotation` (`:108-116`), change the `thumb` line to `thumb: ChartThumb | null`
and add after it:

```ts
  /** Phase 2: the approved note, joined to the label after a second pipe. */
  note?: string
  /** Phase 2: the picked posts' thumbnails, drawn instead of `thumb`. */
  thumbs?: ChartThumb[]
  /** Phase 2: a day shown only for its note. */
  noteOnly?: true
  /** Phase 2, editors only: the ids and the draft behind the controls. */
  noteEditor?: NoteEditorState
```

- [ ] **Step 5: Write the limits, validation, permissions and pick modules**

`lib/organic-social/chart-notes/limits.ts` (no imports, so the client form can use it):

```ts
/** A note is one short line: the deck's callouts name a post or an event in a few words. */
export const NOTE_MAX_CHARS = 80
/** The most posts one callout pictures in the deck screenshots the team shared on 2026-09-24. */
export const NOTE_MAX_POSTS = 2
```

`lib/organic-social/chart-notes/validate.ts`:

```ts
import { CHANNELS } from '../metrics'
import { isRealDay } from '../annotation-hides/mutations'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from './limits'

const CHARTS = new Set<string>(['followers', 'engagements'])
const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Today's date in UTC, the calendar Dash counts days on. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** A note id is a uuid. Checked before any query, so a malformed id is a plain refusal rather
 *  than a Postgres cast error thrown out of the action. */
export function isNoteId(id: unknown): id is string {
  return typeof id === 'string' && NOTE_ID.test(id)
}

/** Every C0 control character and DEL, so a note stays one line of plain text. A code point
 *  check rather than a regex, which eslint's no-control-regex would flag. */
function hasControl(text: string): boolean {
  return [...text].some((c) => {
    const n = c.codePointAt(0)!
    return n < 32 || n === 127
  })
}

/** Pure validation for the save action's payload, the same way authorizeAnnotationHide is kept out
 *  of the action file (lib/organic-social/annotation-hides/mutations.ts:14-24). The first three
 *  checks are the ones that function makes today; the rest are new for notes. */
export function validateNoteInput(
  input: { channel: unknown; chart: unknown; day: unknown; body: unknown; postIds: unknown },
  today: string,
): { ok: boolean; error?: string } {
  if (typeof input.channel !== 'string' || !(CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: 'invalid channel' }
  if (typeof input.chart !== 'string' || !CHARTS.has(input.chart)) return { ok: false, error: 'invalid chart' }
  if (typeof input.day !== 'string' || !isRealDay(input.day)) return { ok: false, error: 'invalid day' }
  if (input.day > today) return { ok: false, error: 'That day has not happened yet.' }
  if (typeof input.body !== 'string') return { ok: false, error: 'invalid note' }
  const body = input.body.trim()
  const chars = [...body].length // characters, so an emoji counts once
  if (chars < 1 || chars > NOTE_MAX_CHARS) return { ok: false, error: `A note is 1 to ${NOTE_MAX_CHARS} characters.` }
  if (hasControl(body)) return { ok: false, error: 'A note is one line of plain text.' }
  const ids = input.postIds
  if (
    !Array.isArray(ids) || ids.length > NOTE_MAX_POSTS || new Set(ids).size !== ids.length
    || !ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  ) return { ok: false, error: `Pick at most ${NOTE_MAX_POSTS} posts.` }
  return { ok: true }
}
```

`lib/organic-social/chart-notes/permissions.ts`:

```ts
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { viewerForRole } from '../reporting-months'

/** Commentary's rules, applied the way monthly Commentary applies them
 *  (components/report-sections/commentary/monthly.tsx:19-22): a client role is a client whatever
 *  its email; a team role writes with an @avenuez.com email and approves only when that email is on
 *  COMMENTARY_APPROVERS. `env` is only for tests. */
export function noteCapabilities(
  role: unknown,
  email: string | null | undefined,
  env: string | undefined = process.env.COMMENTARY_APPROVERS,
): { canEdit: boolean; canApprove: boolean } {
  if (viewerForRole(role) !== 'team') return { canEdit: false, canApprove: false }
  return { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email, env) }
}
```

`lib/organic-social/chart-notes/pick.ts`:

```ts
import type { ChartNote } from '@/lib/db/schema'
import type { AnnotationChart, NoteEditorState } from '../annotations'

type Row = Pick<ChartNote, 'id' | 'chart' | 'day' | 'body' | 'postIds' | 'status' | 'approvedAt' | 'updatedAt' | 'deletedAt'>

/** One day's note as a viewer may see it. `editor` is present only for someone who can edit. */
export interface DayNote {
  approved: { id: string; text: string; postIds: number[] } | null
  editor?: NoteEditorState
}

const time = (d: Date | null) => (d ? d.getTime() : -Infinity)

/** The most recently approved row, ranked by approval time then last update: the rule
 *  mostRecentApprovedPerPeriod applies to Commentary (lib/commentary/select.ts:35-44). */
export function latestApproved<T extends Pick<Row, 'approvedAt' | 'updatedAt'>>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows) {
    const later = !best
      || time(r.approvedAt) > time(best.approvedAt)
      || (time(r.approvedAt) === time(best.approvedAt) && r.updatedAt.getTime() > best.updatedAt.getTime())
    if (later) best = r
  }
  return best
}

/** Per day inside [from, to], on one chart: the approved note a client sees, and for an editor the
 *  ids and the open draft. A day with only a draft does not exist for someone who cannot edit. */
export function notesByDay(
  rows: Row[],
  o: { chart: AnnotationChart; from: string; to: string; canEdit: boolean },
): Map<string, DayNote> {
  const live = rows.filter((r) => !r.deletedAt && r.chart === o.chart && r.day >= o.from && r.day <= o.to)
  const out = new Map<string, DayNote>()
  for (const day of [...new Set(live.map((r) => r.day))].sort()) {
    const ofDay = live.filter((r) => r.day === day)
    const approved = latestApproved(ofDay.filter((r) => r.status === 'approved'))
    // chart_notes_one_open_draft allows one; newest first anyway, so the answer never depends on
    // row order if the index were ever missing.
    const draft = ofDay
      .filter((r) => r.status === 'draft')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
    if (!approved && !(o.canEdit && draft)) continue
    out.set(day, {
      approved: approved ? { id: approved.id, text: approved.body, postIds: approved.postIds } : null,
      ...(o.canEdit
        ? {
            editor: {
              approvedId: approved?.id ?? null,
              approvedPostIds: approved?.postIds ?? [],
              draft: draft ? { id: draft.id, text: draft.body, postIds: draft.postIds } : null,
            },
          }
        : {}),
    })
  }
  return out
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/organic-social/`
Expected: all pass, including the existing `annotations.test.ts` label tests and
`annotation-hides/mutations.test.ts`.

- [ ] **Step 7: Commit and push**

```bash
git add lib/organic-social/annotation-hides/mutations.ts lib/organic-social/annotations.ts lib/organic-social/chart-notes/
git status --porcelain
git commit -m "feat(organic-social): note rules: limits, validation, who may act, which note shows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Reading and writing the table

**Files:**
- Create: `lib/organic-social/chart-notes/select.ts`
- Create: `lib/organic-social/chart-notes/mutations.ts`, `mutations.test.ts`

**Interfaces:**
- Consumes: `chartNotes`, `ChartNote` (Task 1).
- Produces:
  - `getChartNotes(clientId: string, channel: DashChannel): Promise<ChartNote[]>` (React-cached,
    live rows only, every chart of that platform).
  - `type NoteKey = { clientId: string; channel: DashChannel; chart: AnnotationChart; day: string }`
  - `findChartNote(id)`, returning `{ clientId, status, deletedAt, channel, chart, day } | undefined`
  - `findOpenDraft(k: NoteKey): Promise<{ id: string } | undefined>`
  - `insertDraft(k: NoteKey & { body: string; postIds: number[]; by: string }): Promise<void>`
  - `updateDraft(id: string, a: { body: string; postIds: number[]; by: string }): Promise<boolean>`
  - `approveNote(id: string, by: string): Promise<boolean>`
  - `revokeNote(id: string): Promise<boolean>`
  - `softDeleteDraft(id: string, by: string): Promise<boolean>`
  - `OPEN_DRAFT_INDEX = 'chart_notes_one_open_draft'`, `isOpenDraftConflict(e: unknown): boolean`

The database writes are exercised through the action tests (Task 4, mocked) and on staging
(Task 10). Only the pure error check has a unit test, the same split the hides module uses
(`setAnnotationHidden` has no unit test; `authorizeAnnotationHide` does).

- [ ] **Step 1: Write the failing test**

`lib/organic-social/chart-notes/mutations.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isOpenDraftConflict } from './mutations'

// Unverified until staging (Task 10): the exact shape neon-http gives a unique violation. The
// check accepts the constraint name in either the `constraint` field or the message, and walks
// `cause`, because Drizzle 0.45 wraps driver errors in DrizzleQueryError
// (node_modules/drizzle-orm/errors.d.ts:9-14).
const violation = { code: '23505', constraint: 'chart_notes_one_open_draft' }

test('the open-draft index losing a race is recognized, bare or wrapped', () => {
  expect(isOpenDraftConflict(violation)).toBe(true)
  expect(isOpenDraftConflict({ message: 'query failed', cause: violation })).toBe(true)
  expect(isOpenDraftConflict({ code: '23505', message: 'duplicate key value violates unique constraint "chart_notes_one_open_draft"' })).toBe(true)
})

test('any other error is not ours to swallow', () => {
  expect(isOpenDraftConflict({ code: '23505', constraint: 'some_other_key' })).toBe(false)
  expect(isOpenDraftConflict({ code: '23514', constraint: 'chart_notes_one_open_draft' })).toBe(false)
  expect(isOpenDraftConflict(new Error('connection reset'))).toBe(false)
  expect(isOpenDraftConflict(null)).toBe(false)
  expect(isOpenDraftConflict('23505')).toBe(false)
})

test('a cause chain that loops ends instead of spinning', () => {
  const a: { cause?: unknown } = {}
  a.cause = a
  expect(isOpenDraftConflict(a)).toBe(false)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/organic-social/chart-notes/mutations.test.ts`
Expected: FAIL, cannot resolve `./mutations`.

- [ ] **Step 3: Write the read**

`lib/organic-social/chart-notes/select.ts`:

```ts
import { cache } from 'react'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chartNotes, type ChartNote } from '@/lib/db/schema'
import type { DashChannel } from '../metrics'

/** Every live note on one platform, both charts, so a tab's two graphs share one read. The same
 *  read path as getAnnotationHides (lib/organic-social/annotation-hides/select.ts:9-12): React.cache
 *  for per-render dedup, freshness after a write from revalidateTag('db') in the action. */
export const getChartNotes = cache(async (clientId: string, channel: DashChannel): Promise<ChartNote[]> =>
  db.select().from(chartNotes).where(and(
    eq(chartNotes.clientId, clientId),
    eq(chartNotes.channel, channel),
    isNull(chartNotes.deletedAt),
  )))
```

- [ ] **Step 4: Write the writes**

`lib/organic-social/chart-notes/mutations.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chartNotes } from '@/lib/db/schema'
import type { AnnotationChart } from '../annotations'
import type { DashChannel } from '../metrics'

export type NoteKey = { clientId: string; channel: DashChannel; chart: AnnotationChart; day: string }

export const OPEN_DRAFT_INDEX = 'chart_notes_one_open_draft'

/** The fields every action checks before it writes. */
export async function findChartNote(id: string) {
  const rows = await db
    .select({
      clientId: chartNotes.clientId, status: chartNotes.status, deletedAt: chartNotes.deletedAt,
      channel: chartNotes.channel, chart: chartNotes.chart, day: chartNotes.day,
    })
    .from(chartNotes)
    .where(eq(chartNotes.id, id))
    .limit(1)
  return rows[0]
}

export async function findOpenDraft(k: NoteKey): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: chartNotes.id })
    .from(chartNotes)
    .where(and(
      eq(chartNotes.clientId, k.clientId), eq(chartNotes.channel, k.channel),
      eq(chartNotes.chart, k.chart), eq(chartNotes.day, k.day),
      eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt),
    ))
    .limit(1)
  return rows[0]
}

export async function insertDraft(k: NoteKey & { body: string; postIds: number[]; by: string }): Promise<void> {
  await db.insert(chartNotes).values({
    clientId: k.clientId, channel: k.channel, chart: k.chart, day: k.day,
    body: k.body, postIds: k.postIds, status: 'draft', createdBy: k.by, updatedBy: k.by,
  })
}

// Each write below re-asserts the state it expects and reports whether it hit a row, so a lost race
// reads as 'not found' rather than a false success. The same reasoning as Commentary's writes
// (app/actions/commentary.ts:17-34), including revoke's exemption from the deleted check.

export async function updateDraft(id: string, a: { body: string; postIds: number[]; by: string }): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ body: a.body, postIds: a.postIds, updatedBy: a.by, updatedAt: new Date() })
    .where(and(eq(chartNotes.id, id), eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt)))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

export async function approveNote(id: string, by: string): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ status: 'approved', approvedBy: by, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(chartNotes.id, id), isNull(chartNotes.deletedAt)))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

export async function revokeNote(id: string): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(chartNotes.id, id))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

/** Soft delete. The row stays, so who deleted it and when stay on record. */
export async function softDeleteDraft(id: string, by: string): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ deletedAt: new Date(), deletedBy: by, updatedAt: new Date() })
    .where(and(eq(chartNotes.id, id), eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt)))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

/** True when a write lost the race for a day's one open draft: Postgres unique violation 23505 on
 *  chart_notes_one_open_draft. Drizzle wraps the driver's error (DrizzleQueryError.cause), so the
 *  chain is walked, at most 5 deep. Any other error is not ours to swallow. */
export function isOpenDraftConflict(e: unknown): boolean {
  let cur: unknown = e
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const { code, constraint, message, cause } = cur as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown }
    const named = constraint === OPEN_DRAFT_INDEX || (typeof message === 'string' && message.includes(OPEN_DRAFT_INDEX))
    if (code === '23505' && named) return true
    cur = cause
  }
  return false
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run lib/organic-social/chart-notes/`
Expected: all pass.

- [ ] **Step 6: Commit and push**

```bash
git add lib/organic-social/chart-notes/select.ts lib/organic-social/chart-notes/mutations.ts lib/organic-social/chart-notes/mutations.test.ts
git commit -m "feat(organic-social): read and write chart notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: The four server actions

**Files:**
- Create: `app/actions/chart-notes.ts`, `app/actions/chart-notes.test.ts`

A new file rather than `app/actions/organic-social.ts`, because eight test files mock that module
with only the hide and designation actions (`grep -rln app/actions/organic-social` over the test
files); a new export there would be missing from each of those mocks.

**Interfaces:**
- Consumes: `noteCapabilities`, `validateNoteInput`, `isNoteId`, `todayUtc` (Task 2); the Task 3
  writes; `authorizeRowForClient`, `guardNotDeleted`, `canDeleteDraft` from
  `lib/commentary/mutations.ts:29`, `:43`, `:56`.
- Produces (all `'use server'`, all return `{ ok: true } | { ok: false; error: string }`):
  - `saveChartNoteAction(input: { clientSlug: string; channel: string; chart: string; day: string; body: string; postIds: number[] })`
  - `approveChartNoteAction(clientSlug: string, id: string)`
  - `revokeChartNoteAction(clientSlug: string, id: string)`
  - `deleteChartNoteDraftAction(clientSlug: string, id: string)`

- [ ] **Step 1: Write the failing tests**

`app/actions/chart-notes.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'client-uuid' })) }))
vi.mock('@/lib/organic-social/chart-notes/mutations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/chart-notes/mutations')>(
    '@/lib/organic-social/chart-notes/mutations',
  )
  return {
    ...actual,
    findChartNote: vi.fn(), findOpenDraft: vi.fn(async () => undefined), insertDraft: vi.fn(async () => {}),
    updateDraft: vi.fn(async () => true), approveNote: vi.fn(async () => true),
    revokeNote: vi.fn(async () => true), softDeleteDraft: vi.fn(async () => true),
  }
})

import { auth } from '@/auth'
import { revalidateTag } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import * as m from '@/lib/organic-social/chart-notes/mutations'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction, saveChartNoteAction } from './chart-notes'

// Every slug, email, id and date is invented.
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const OTHER = 'c7d8e0a1-2222-4222-8222-222222222222'
const INPUT = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14', body: '  Influencer post went live  ', postIds: [11] }
const session = (value: unknown) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(value)
const as = (role: string, email: string | null = 'writer@avenuez.com') => session({ user: { role, email } })
const ROW = { clientId: 'client-uuid', status: 'draft', deletedAt: null, channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14' }
const FORBIDDEN = { ok: false, error: 'forbidden' }
const writes = () => [m.insertDraft, m.updateDraft, m.approveNote, m.revokeNote, m.softDeleteDraft]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
  process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com'
})
afterEach(() => { vi.useRealTimers(); delete process.env.COMMENTARY_APPROVERS })

test('a client role is refused by every action, even with an @avenuez.com email', async () => {
  as('CLIENT_ADMIN', 'approver@avenuez.com')
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  expect(await approveChartNoteAction('a-client', ID)).toEqual(FORBIDDEN)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(FORBIDDEN)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(FORBIDDEN)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('no session, or a team session with no email, is refused', async () => {
  session(null)
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  as('INTERNAL_ADMIN', null)
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('save: malformed or future input is refused before any read or write', async () => {
  as('INTERNAL_ANALYST')
  expect(await saveChartNoteAction({ ...INPUT, day: '2026-09-25' })).toEqual({ ok: false, error: 'That day has not happened yet.' })
  expect(await saveChartNoteAction({ ...INPUT, clientSlug: ' ' })).toEqual({ ok: false, error: 'invalid client' })
  expect(await saveChartNoteAction({ ...INPUT, postIds: [1, 2, 3] })).toEqual({ ok: false, error: 'Pick at most 2 posts.' })
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(m.findOpenDraft).not.toHaveBeenCalled()
})

test('save: an unknown client is refused', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(getClientBySlug).mockResolvedValueOnce(undefined as never)
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'client not found' })
  expect(m.insertDraft).not.toHaveBeenCalled()
})

test('save: with no open draft, a trimmed draft is created by the signed-in editor, then the page refreshes', async () => {
  as('INTERNAL_ANALYST')
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: true })
  expect(m.insertDraft).toHaveBeenCalledWith({
    clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
    body: 'Influencer post went live', postIds: [11], by: 'writer@avenuez.com',
  })
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})

test('save: with an open draft, that draft is edited in place', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: ID })
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: true })
  expect(m.updateDraft).toHaveBeenCalledWith(ID, { body: 'Influencer post went live', postIds: [11], by: 'writer@avenuez.com' })
  expect(m.insertDraft).not.toHaveBeenCalled()
})

test('save: a draft deleted between the read and the write is reported, not faked', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: ID })
  vi.mocked(m.updateDraft).mockResolvedValueOnce(false)
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'not found' })
  expect(revalidateTag).not.toHaveBeenCalled()
})

test('save: losing the race for the day\'s one open draft is a clear message, not a thrown error', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.insertDraft).mockRejectedValueOnce({ message: 'query failed', cause: { code: '23505', constraint: 'chart_notes_one_open_draft' } })
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'A draft is already open on this day. Reload to see it.' })
})

test('save: any other database error still surfaces', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.insertDraft).mockRejectedValueOnce(new Error('connection reset'))
  await expect(saveChartNoteAction(INPUT)).rejects.toThrow('connection reset')
})

test('approve: an editor who is not on the approvers list is refused', async () => {
  as('INTERNAL_ADMIN', 'writer@avenuez.com')
  expect(await approveChartNoteAction('a-client', ID)).toEqual(FORBIDDEN)
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: a malformed id, another client\'s note or a deleted note is "not found"', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  expect(await approveChartNoteAction('a-client', 'nope')).toEqual({ ok: false, error: 'not found' })
  expect(m.findChartNote).not.toHaveBeenCalled()
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, clientId: 'someone-else' } as never)
  expect(await approveChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'not found' })
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, deletedAt: new Date() } as never)
  expect(await approveChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'not found' })
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: an approver approves, stamped with their email', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  expect(await approveChartNoteAction('a-client', ID)).toEqual({ ok: true })
  expect(m.approveNote).toHaveBeenCalledWith(ID, 'approver@avenuez.com')
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})

test('revoke: refused while another draft is open on that day, so a day never holds two', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: OTHER })
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'A draft is already open on this day. Delete or approve it first.' })
  expect(m.revokeNote).not.toHaveBeenCalled()
})

test('revoke: an approved note returns to draft', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: true })
  expect(m.findOpenDraft).toHaveBeenCalledWith({ clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14' })
  expect(m.revokeNote).toHaveBeenCalledWith(ID)
})

test('revoke: a draft racing in between is caught by the index and reported', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  vi.mocked(m.revokeNote).mockRejectedValueOnce({ code: '23505', constraint: 'chart_notes_one_open_draft' })
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'A draft is already open on this day. Delete or approve it first.' })
})

test('delete: only a draft, soft deleted by the signed-in editor', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: false, error: 'Only drafts can be deleted.' })
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: true })
  expect(m.softDeleteDraft).toHaveBeenCalledWith(ID, 'writer@avenuez.com')
})

test('delete: a second delete of the same draft is "not found", not a false success', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  vi.mocked(m.softDeleteDraft).mockResolvedValueOnce(false)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: false, error: 'not found' })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run app/actions/chart-notes.test.ts`
Expected: FAIL, cannot resolve `./chart-notes`.

- [ ] **Step 3: Write the actions**

`app/actions/chart-notes.ts`:

```ts
'use server'

import { revalidateTag } from 'next/cache'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { authorizeRowForClient, canDeleteDraft, guardNotDeleted } from '@/lib/commentary/mutations'
import { noteCapabilities } from '@/lib/organic-social/chart-notes/permissions'
import { isNoteId, todayUtc, validateNoteInput } from '@/lib/organic-social/chart-notes/validate'
import {
  approveNote, findChartNote, findOpenDraft, insertDraft, isOpenDraftConflict,
  revokeNote, softDeleteDraft, updateDraft, type NoteKey,
} from '@/lib/organic-social/chart-notes/mutations'
import type { AnnotationChart } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'

type Result = { ok: true } | { ok: false; error: string }

const FORBIDDEN: Result = { ok: false, error: 'forbidden' }
const NOT_FOUND: Result = { ok: false, error: 'not found' }

/** Every action checks the role AND the email: the hide action checks only the role
 *  (app/actions/organic-social.ts:49), the Commentary actions only the email
 *  (app/actions/commentary.ts:58). A hidden control is not an authorization boundary. Not exported:
 *  a 'use server' module may only export async actions. */
async function viewer() {
  const session = await auth()
  const email = session?.user?.email ?? null
  return { email, ...noteCapabilities(session?.user?.role, email) }
}

/** Create a draft for the day, or edit the day's open draft. Always lands as a draft: editing an
 *  approved note leaves it visible to clients until the draft is approved. */
export async function saveChartNoteAction(input: {
  clientSlug: string; channel: string; chart: string; day: string; body: string; postIds: number[]
}): Promise<Result> {
  const v = await viewer()
  if (!v.canEdit) return FORBIDDEN
  if (typeof input.clientSlug !== 'string' || !input.clientSlug.trim()) return { ok: false, error: 'invalid client' }
  const valid = validateNoteInput(input, todayUtc())
  if (!valid.ok) return { ok: false, error: valid.error! }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const key: NoteKey = { clientId: client.id, channel: input.channel as DashChannel, chart: input.chart as AnnotationChart, day: input.day }
  const body = input.body.trim()
  try {
    const open = await findOpenDraft(key)
    if (open) {
      if (!(await updateDraft(open.id, { body, postIds: input.postIds, by: v.email! }))) return NOT_FOUND
    } else {
      await insertDraft({ ...key, body, postIds: input.postIds, by: v.email! })
    }
  } catch (e) {
    // Two people (or one double click) opening a draft on the same day: the index keeps one.
    if (isOpenDraftConflict(e)) return { ok: false, error: 'A draft is already open on this day. Reload to see it.' }
    throw e
  }
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Approve a note for client view. Approvers only; the row must belong to the named client and
 *  must not be deleted. An older approval of the same day stays in the table, superseded, so a
 *  revoke falls back to it, as Commentary does. */
export async function approveChartNoteAction(clientSlug: string, id: string): Promise<Result> {
  const v = await viewer()
  if (!v.canApprove) return FORBIDDEN
  if (!isNoteId(id)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const alive = guardNotDeleted(row)
  if (!alive.ok) return { ok: false, error: alive.error! }
  if (!(await approveNote(id, v.email!))) return NOT_FOUND
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Return an approved note to draft. Refused while another draft is open on that day, so a day
 *  never holds two; the index catches the same case if one lands in between. */
export async function revokeChartNoteAction(clientSlug: string, id: string): Promise<Result> {
  const v = await viewer()
  if (!v.canApprove) return FORBIDDEN
  if (!isNoteId(id)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const busy = { ok: false as const, error: 'A draft is already open on this day. Delete or approve it first.' }
  const open = await findOpenDraft({ clientId: client.id, channel: row!.channel as DashChannel, chart: row!.chart as AnnotationChart, day: row!.day })
  if (open && open.id !== id) return busy
  try {
    if (!(await revokeNote(id))) return NOT_FOUND
  } catch (e) {
    if (isOpenDraftConflict(e)) return busy
    throw e
  }
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Soft delete a draft. Any editor, like Commentary; an approved note is refused, since a client
 *  may be reading it. The deleter is taken from the session, never from the caller. */
export async function deleteChartNoteDraftAction(clientSlug: string, id: string): Promise<Result> {
  const v = await viewer()
  if (!v.canEdit) return FORBIDDEN
  if (!isNoteId(id)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const deletable = canDeleteDraft(row)
  if (!deletable.ok) return { ok: false, error: deletable.error! }
  if (!(await softDeleteDraft(id, v.email!))) return NOT_FOUND
  revalidateTag('db', 'max')
  return { ok: true }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run app/actions/`
Expected: all pass, including the existing `organic-social.test.ts`.

- [ ] **Step 5: Commit with the edge-case list, and push**

This change crosses a process boundary and takes untrusted input, so the commit body carries the
six-category list (my global rule):

```bash
git add app/actions/chart-notes.ts app/actions/chart-notes.test.ts
git commit -F - <<'EOF'
feat(organic-social): server actions to save, approve, revoke and delete chart notes

## Edge cases

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | a database error mid-write | app/actions/chart-notes.ts | fix: the index race returns a message; anything else throws to the caller, which shows a generic retry line (Task 8) |
| 2 | operator visibility | a refused or failed action is not logged server-side | app/actions/chart-notes.ts | file: Commentary's actions do not log either; add both together |
| 3 | bounds | note length and post count | lib/organic-social/chart-notes/validate.ts | fix: 80 characters, 2 posts |
| 4 | input boundaries | every field of the payload, and the note id | validate.ts, isNoteId | fix: validated before any read; a bad id never reaches a uuid cast |
| 5 | state and concurrency | two drafts on one day; a row deleted between read and write | chart_notes_one_open_draft, mutations.ts | fix: the index plus a clear message; every write reports whether it hit a row |
| 6 | security | a client role, or a team role without an @avenuez.com email, calling an action directly | viewer() in chart-notes.ts | fix: role and email both checked; the author is taken from the session |

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push
```

---

### Task 5: Merging notes into a chart's annotations

**Files:**
- Modify: `lib/organic-social/annotations.ts` (`thumbOf`, `thumbSrc`; `toChartAnnotations` carries
  the note fields)
- Modify: `lib/organic-social/annotations.test.ts` (append)
- Create: `components/report-sections/organic-social/parts/chart-notes.ts`, `chart-notes.test.ts`

**Interfaces:**
- Consumes: `notesByDay`, `DayNote` (Task 2); `getChartNotes` (Task 3); `noteCapabilities`
  (Task 2); `topPostByDate` (`annotations.ts:85`); `getClientBySlug`.
- Produces:
  - `thumbOf(post: TopContentPost): ChartThumb`, `thumbSrc(t: ChartThumb): string | null`
  - `withNotes(args: { clientSlug: string; channel: DashChannel; chart: AnnotationChart; role: string; email: string | null; series: TrendSeries; from: string; to: string; today: string; items: Annotation[]; posts: TopContentPost[] | null }): Promise<{ items: Annotation[]; controls?: NoteControls }>`
  - `windowDays(from: string, to: string): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `lib/organic-social/annotations.test.ts`, which already defines `post(id, publishedAt,
engagements)` with `https://example.com/<id>` links (used at `:158`):

```ts
test('a client receives the approved note and the picked thumbnails, never the editor ids', () => {
  const [a] = toChartAnnotations([{
    date: '2026-08-14', value: -3, label: '8/14', post: null, hidden: false, noteOnly: true,
    note: { text: 'Event', posts: [post(2, '2026-08-14', 5)] },
  }])
  expect(Object.keys(a).sort()).toEqual(['date', 'hidden', 'label', 'note', 'noteOnly', 'thumb', 'thumbs', 'value'])
  expect(a.note).toBe('Event')
  expect(a.thumbs?.map((t) => t.url)).toEqual(['https://example.com/2'])
})

test('a day with only a draft sends no note text to anyone', () => {
  const editor = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Draft', postIds: [] } }
  const [a] = toChartAnnotations([{ date: '2026-08-14', value: 0, label: '8/14', post: null, noteOnly: true, note: { text: null, posts: [], editor } }])
  expect(a.note).toBeUndefined()
  expect(a.noteEditor).toEqual(editor)
})

test('the thumbnail source is the image thumb or the video poster', () => {
  expect(thumbSrc({ creative: { kind: 'image', thumb: 't', full: 'f' }, mediaType: 'IMAGE', url: null })).toBe('t')
  expect(thumbSrc({ creative: { kind: 'video', src: 's', poster: 'p' }, mediaType: 'VIDEO', url: null })).toBe('p')
  expect(thumbSrc({ creative: { kind: 'video', src: 's', poster: null }, mediaType: 'VIDEO', url: null })).toBeNull()
  expect(thumbSrc({ creative: null, mediaType: 'IMAGE', url: null })).toBeNull()
})
```

Add `thumbSrc` to that file's import from `./annotations`.

`components/report-sections/organic-social/parts/chart-notes.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

// withNotes decides what a viewer may see of the team's notes. Both collaborators are stubbed:
// the client lookup and the notes read. Nothing reaches a database. Every value is invented.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))

import { windowDays, withNotes } from './chart-notes'
import type { ChartNote } from '@/lib/db/schema'
import type { Annotation } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const t = (iso: string) => new Date(iso)
const row = (over: Partial<ChartNote>): ChartNote => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: t('2026-09-01T00:00:00Z'), updatedAt: t('2026-09-01T00:00:00Z'),
  approvedAt: t('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})
const PEAK: Annotation = { date: '2026-08-10', value: 28, label: '8/10 | +28 Followers', post: null }
const BASE = {
  clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'followers' as const,
  series: { channels: ['Instagram'], points: [{ date: '2026-08-10', Instagram: 28 }, { date: '2026-08-14', Instagram: -3 }] },
  from: '2026-08-01', to: '2026-08-31', today: '2026-09-24', items: [PEAK], posts: [] as TopContentPost[],
}
const CLIENT = { ...BASE, role: 'CLIENT_VIEWER', email: 'writer@avenuez.com' }
const EDITOR = { ...BASE, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' }

let err: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  getClientBySlug.mockReset().mockResolvedValue({ id: 'client-uuid' })
  getChartNotes.mockReset().mockResolvedValue([])
  err = vi.spyOn(console, 'error').mockImplementation(() => {})
})

test('a day that lost followers keeps its note and never gets a signed number', async () => {
  getChartNotes.mockResolvedValue([row({})])
  const { items } = await withNotes(CLIENT)
  expect(items.map((a) => a.date)).toEqual(['2026-08-10', '2026-08-14'])
  expect(items[1]).toMatchObject({ label: '8/14', noteOnly: true, note: { text: 'Event', posts: [] } })
  expect(items[1].label).not.toContain('+')
})

test('a client gets approved notes only, with no editor state and no controls', async () => {
  getChartNotes.mockResolvedValue([row({}), row({ id: 'd', day: '2026-08-20', status: 'draft', approvedAt: null, approvedBy: null })])
  const r = await withNotes(CLIENT)
  expect(r.items.map((a) => a.date)).toEqual(['2026-08-10', '2026-08-14'])
  expect(r.items[1].note?.editor).toBeUndefined()
  expect(r.controls).toBeUndefined()
})

test('a note on a peak day joins that day instead of adding one', async () => {
  getChartNotes.mockResolvedValue([row({ day: '2026-08-10', body: 'Went live' })])
  const { items } = await withNotes(CLIENT)
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ label: '8/10 | +28 Followers', note: { text: 'Went live' } })
  expect(items[0].noteOnly).toBeUndefined()
})

test('picked posts come only from that day, skipping any Dash no longer returns', async () => {
  getChartNotes.mockResolvedValue([row({ postIds: [2, 99, 3] })])
  const { items } = await withNotes({ ...CLIENT, posts: [post(2, '2026-08-14', 5), post(3, '2026-08-15', 50)] })
  expect(items[1].note?.posts.map((p) => p.id)).toEqual([2])
})

test('when every pick is gone, the day keeps its top post', async () => {
  getChartNotes.mockResolvedValue([row({ postIds: [99] })])
  const { items } = await withNotes({ ...CLIENT, posts: [post(4, '2026-08-14', 9)] })
  expect(items[1].note?.posts).toEqual([])
  expect(items[1].post?.id).toBe(4)
})

test('the team gets the draft, the ids and the controls, with that day\'s posts', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null, body: 'Soon' })])
  const r = await withNotes({ ...EDITOR, posts: [post(5, '2026-08-10', 1)] })
  expect(r.items[1].note).toEqual({ text: null, posts: [], editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } } })
  expect(r.controls).toMatchObject({ clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', canApprove: false })
  expect(r.controls?.days).toHaveLength(31)
  expect(r.controls?.days.find((d) => d.day === '2026-08-10')?.posts).toEqual([
    { id: 5, thumb: { creative: post(5, '2026-08-10', 1).creative, mediaType: 'IMAGE', url: 'https://example.com/5' } },
  ])
})

test('a team role without an @avenuez.com email gets exactly the client view', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null })])
  const r = await withNotes({ ...EDITOR, email: null })
  expect(r.items).toEqual([PEAK])
  expect(r.controls).toBeUndefined()
})

test('in the live month the form offers no day after today', async () => {
  const r = await withNotes({ ...EDITOR, from: '2026-09-01', to: '2026-09-30', today: '2026-09-24', series: { channels: ['Instagram'], points: [] } })
  expect(r.controls?.days.map((d) => d.day).at(-1)).toBe('2026-09-24')
  expect(r.controls?.days).toHaveLength(24)
})

test('unreadable notes fail closed for everyone, and say which chart', async () => {
  getChartNotes.mockRejectedValue(new Error('relation "chart_notes" does not exist'))
  for (const who of [CLIENT, EDITOR]) {
    const r = await withNotes(who)
    expect(r).toEqual({ items: [PEAK] })
  }
  expect(String(err.mock.calls[0][0])).toContain('chart notes unreadable for a-client INSTAGRAM followers')
})

test('no client row fails the same way', async () => {
  getClientBySlug.mockResolvedValue(null)
  expect(await withNotes(EDITOR)).toEqual({ items: [PEAK] })
  expect(getChartNotes).not.toHaveBeenCalled()
})

test('windowDays is inclusive, empty when reversed, and bounded', () => {
  expect(windowDays('2026-08-30', '2026-09-01')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  expect(windowDays('2026-09-02', '2026-09-01')).toEqual([])
  expect(windowDays('2026-01-01', '2027-12-31')).toHaveLength(400)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/organic-social/annotations.test.ts components/report-sections/organic-social/parts/chart-notes.test.ts`
Expected: FAIL, `thumbSrc` is not exported and `./chart-notes` cannot be resolved.

- [ ] **Step 3: Add `thumbOf`, `thumbSrc` and extend `toChartAnnotations`**

In `lib/organic-social/annotations.ts`, replace `toChartAnnotations` (`:118-128`) with:

```ts
/** What the row draws for one post: its picture and its link, nothing else. */
export function thumbOf(post: TopContentPost): ChartThumb {
  return { creative: post.creative, mediaType: post.mediaType, url: post.url }
}

/** The small picture for a post, or null when there is none to show: an image's thumb, a video's
 *  poster. */
export function thumbSrc(t: ChartThumb): string | null {
  const c = t.creative
  if (!c) return null
  return c.kind === 'image' ? c.thumb : c.poster
}

/** Annotations, trimmed for the client component that draws them. A note adds only its approved
 *  text and its picked posts' thumbnails; the ids and the draft go to editors only, because
 *  notesByDay attaches `editor` only for someone who can edit. */
export function toChartAnnotations(items: Annotation[]): ChartAnnotation[] {
  return items.map(({ date, value, label, post, hidden, note, noteOnly }) => ({
    date,
    value,
    label,
    // Staff only: set by the hides layer, so the row can fade it and the chart can drop its dot.
    ...(hidden === undefined ? {} : { hidden }),
    thumb: post ? thumbOf(post) : null,
    ...(note?.text ? { note: note.text } : {}),
    ...(note && note.posts.length > 0 ? { thumbs: note.posts.map(thumbOf) } : {}),
    ...(noteOnly ? { noteOnly } : {}),
    ...(note?.editor ? { noteEditor: note.editor } : {}),
  }))
}
```

- [ ] **Step 4: Write `withNotes`**

`components/report-sections/organic-social/parts/chart-notes.ts`:

```ts
import { getClientBySlug } from '@/lib/db/queries'
import { getChartNotes } from '@/lib/organic-social/chart-notes/select'
import { notesByDay, type DayNote } from '@/lib/organic-social/chart-notes/pick'
import { noteCapabilities } from '@/lib/organic-social/chart-notes/permissions'
import { dayLabel, thumbOf, topPostByDate } from '@/lib/organic-social/annotations'
import type { Annotation, AnnotationChart, NoteControls } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { TrendSeries } from '@/lib/organic-social/types'

/** Every yyyy-mm-dd from `from` to `to`, inclusive, in UTC. A window is a month; the cap only
 *  stops a malformed range from running long. */
export function windowDays(from: string, to: string): string[] {
  const out: string[] = []
  for (const d = new Date(`${from}T00:00:00Z`); out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    if (day > to) break
    out.push(day)
  }
  return out
}

function attach(a: Annotation, dn: DayNote | undefined, dayPosts: TopContentPost[]): Annotation {
  if (!dn) return a
  // A pick counts only if it is one of this day's posts in Dash's answer; the rest are skipped.
  const picks = (dn.approved?.postIds ?? [])
    .map((id) => dayPosts.find((p) => p.id === id))
    .filter((p): p is TopContentPost => !!p)
  return { ...a, note: { text: dn.approved?.text ?? null, posts: picks, ...(dn.editor ? { editor: dn.editor } : {}) } }
}

/** Merges the team's notes into one chart's annotations, before the hides layer runs, so a hide on
 *  a day still removes its note from the client. A note on a peak day joins it; a note on any other
 *  day becomes its own item, labelled with the date alone. Editors also get the form's controls.
 *
 *  Fails closed, as hides do for clients (parts/annotation-hides.ts:29-36): if the notes cannot be
 *  read, nobody sees a note, editors get no controls, the graph renders as it did before notes, and
 *  the error is logged with the client, platform and chart. */
export async function withNotes(args: {
  clientSlug: string; channel: DashChannel; chart: AnnotationChart; role: string; email: string | null
  series: TrendSeries; from: string; to: string; today: string
  items: Annotation[]; posts: TopContentPost[] | null
}): Promise<{ items: Annotation[]; controls?: NoteControls }> {
  const caps = noteCapabilities(args.role, args.email)
  try {
    const client = await getClientBySlug(args.clientSlug)
    if (!client) throw new Error(`no client row for ${args.clientSlug}`)
    const rows = await getChartNotes(client.id, args.channel)
    const byDay = notesByDay(rows, { chart: args.chart, from: args.from, to: args.to, canEdit: caps.canEdit })
    const posts = args.posts ?? []
    const postsOn = (day: string) => posts.filter((p) => p.publishedAt === day)
    const key = args.series.channels[0]
    const values = new Map(args.series.points.map((p) => [String(p.date), Number(key ? p[key] : NaN)]))
    const top = topPostByDate(posts)

    const items = args.items.map((a) => attach(a, byDay.get(a.date), postsOn(a.date)))
    for (const [day, dn] of byDay) {
      if (items.some((a) => a.date === day)) continue
      const v = values.get(day)
      items.push(attach(
        { date: day, value: v !== undefined && Number.isFinite(v) ? v : 0, label: dayLabel(day), post: top.get(day) ?? null, noteOnly: true },
        dn,
        postsOn(day),
      ))
    }
    items.sort((x, y) => x.date.localeCompare(y.date))

    if (!caps.canEdit) return { items }
    const last = args.today < args.to ? args.today : args.to
    return {
      items,
      controls: {
        clientSlug: args.clientSlug, channel: args.channel, chart: args.chart, canApprove: caps.canApprove,
        days: windowDays(args.from, last).map((day) => ({ day, posts: postsOn(day).map((p) => ({ id: p.id, thumb: thumbOf(p) })) })),
      },
    }
  } catch (e) {
    console.error(
      `[organic-social] chart notes unreadable for ${args.clientSlug} ${args.channel} ${args.chart}; showing none:`,
      (e as Error).message,
    )
    return { items: args.items }
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/organic-social/ components/report-sections/organic-social/parts/`
Expected: all pass, including the existing `toChartAnnotations` tests at `annotations.test.ts:157-170`.

- [ ] **Step 6: Commit and push**

```bash
git add lib/organic-social/annotations.ts lib/organic-social/annotations.test.ts components/report-sections/organic-social/parts/chart-notes.ts components/report-sections/organic-social/parts/chart-notes.test.ts
git commit -m "feat(organic-social): merge approved notes into a chart's annotations, fail closed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Wiring the v2 graphs, and the viewer's email

**Files:**
- Modify: `components/report-sections/organic-social/ctx.ts:3-14` (optional `email`)
- Modify: `components/report-sections/organic-social/index.tsx:51-53`
- Modify: `components/report-sections/organic-social/index.test.tsx` (one test)
- Modify: `components/report-sections/organic-social/parts/follower-graph.tsx:54-74`
- Modify: `components/report-sections/organic-social/parts/engagement-trend.tsx:38-61`
- Modify: `components/report-sections/organic-social/follower-graph.tsx`,
  `components/report-sections/organic-social/trends.tsx:31-33`, `:143-147` (a pass-through
  `noteControls` prop only; the chart uses it in Task 8)
- Modify: `components/report-sections/organic-social/parts/annotations-wiring.test.tsx`

**Interfaces:**
- Consumes: `withNotes` (Task 5), `todayUtc` (Task 2).
- Produces: `OrganicSocialCtx.email?: string`; `FollowerGraph`, `EngagementTrend` and
  `ChannelTrendChart` accept `noteControls?: NoteControls`.

- [ ] **Step 1: Write the failing tests**

In `annotations-wiring.test.tsx`, after the hides mock (`:12-13`) add:

```ts
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn(async () => [] as unknown[]) }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))
```

and append:

```ts
const noteRow = (over: Record<string, unknown>) => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  approvedAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const propsOf = (el: unknown) => (el as ReactElement<{ annotations?: ChartAnnotation[]; noteControls?: unknown }>).props

test('v1 never reads notes', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 5 }))
  await FollowerSection(AUG)
  expect(getChartNotes).not.toHaveBeenCalled()
})

test('a client sees an approved note on a quiet day as its own callout, with no controls', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-14': -3 }))
  graphPosts.mockResolvedValueOnce([])
  getChartNotes.mockResolvedValueOnce([noteRow({})])
  const el = await FollowerSectionV2(AUG)
  expect(propsOf(el).annotations?.map((a) => [a.label, a.note ?? null, a.noteOnly ?? null])).toEqual([
    ['8/10 | +28 Followers', null, null], ['8/14', 'Event', true],
  ])
  expect(propsOf(el).noteControls).toBeUndefined()
})

test('an editor gets the note controls on the v2 engagement graph', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  graphPosts.mockResolvedValueOnce([post(8, '2026-08-10', 60)])
  const el = await TrendSectionV2({ ...AUG, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' })
  expect(propsOf(el).noteControls).toMatchObject({ chart: 'engagements', clientSlug: 'fixture-client' })
  vi.useRealTimers()
})
```

In `index.test.tsx`, inside the same `describe` as the test at `:148-154`, append:

```ts
  test('the viewer\'s email reaches the parts when the session has one', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' } } as never)
    getClientBySlug.mockResolvedValue(OPTED)
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.email).toBe('writer@avenuez.com')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/report-sections/organic-social/parts/annotations-wiring.test.tsx components/report-sections/organic-social/index.test.tsx`
Expected: FAIL: the note is not merged, no `noteControls`, and `c.email` is undefined.

- [ ] **Step 3: Add `email` to the context**

`ctx.ts`, inside `OrganicSocialCtx` after `role: string`:

```ts
  /** The viewer's email, set only when the session has one. Read only by the written notes on the
   *  v2 graphs (Commentary's email rules, lib/commentary/permissions.ts); every other part ignores
   *  it. */
  email?: string
```

`buildOrganicSocialCtx` is unchanged: the field is optional and absent by default.

- [ ] **Step 4: Read it with the role**

`index.tsx:51-53`, replace with:

```ts
  // The email feeds only the written notes on the v2 graphs. Read in the same guarded call, so a
  // failed session read still means client rules and no email.
  let role: string | undefined
  let email: string | undefined
  try {
    const user = (await auth())?.user
    role = user?.role
    email = user?.email ?? undefined
  } catch { role = undefined; email = undefined }
  const rctx: OrganicSocialCtx = { ...ctx, ...(role ? { role } : {}), ...(email ? { email } : {}) }
```

A session with no email gives the same object as today, which keeps `index.test.tsx:153` passing.

- [ ] **Step 5: Call `withNotes` in both v2 parts**

`parts/follower-graph.tsx`: add imports

```ts
import { withNotes } from './chart-notes'
import { todayUtc } from '@/lib/organic-social/chart-notes/validate'
```

and replace `:54-74` with:

```ts
export async function FollowerSectionV2({ clientSlug, dateRange, channel, role, email }: OrganicSocialCtx) {
  if (!channel) return null
  const [graph, posts] = await Promise.all([
    safe(getFollowerGraph(clientSlug, dateRange, channel, 'netNewFollowers', 'utc')),
    safe(graphPosts(clientSlug, dateRange, channel)),
  ])
  if (!graph.data) return <Fallback kind={graph.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(graph.data, { limit: ANNOTATION_LIMIT.followers, from: start, to: end })
  const built = buildAnnotations(peaks, posts.data ?? null, 'followers')
  // Notes first, then hides over the merged list, so a hide still removes a day's note.
  const noted = await withNotes({
    clientSlug, channel, chart: 'followers', role, email: email ?? null, series: graph.data,
    from: start, to: end, today: todayUtc(), items: built, posts: posts.data ?? null,
  })
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'followers', role, items: noted.items })
  // Jasmine's outline names this chart, word for word.
  return (
    <FollowerGraph
      series={graph.data}
      annotations={toChartAnnotations(items)}
      annotationControls={controls}
      noteControls={noted.controls}
      title={`${CHANNEL_LABEL[channel]} Follower Growth Graph`}
    />
  )
}
```

`parts/engagement-trend.tsx`: the same two imports, and replace `:38-61` with:

```ts
export async function TrendSectionV2({ clientSlug, dateRange, channel, role, email }: OrganicSocialCtx) {
  if (!channel) {
    const trend = await safe(getEngagementTrend(clientSlug, dateRange, null, 'utc'))
    return trend.data ? <EngagementTrend series={trend.data} /> : <Fallback kind={trend.error!} />
  }
  const [trend, posts] = await Promise.all([
    safe(getEngagementTrend(clientSlug, dateRange, channel, 'utc')),
    safe(graphPosts(clientSlug, dateRange, channel)),
  ])
  if (!trend.data) return <Fallback kind={trend.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(trend.data, { limit: ANNOTATION_LIMIT.engagements, from: start, to: end })
  const built = buildAnnotations(peaks, posts.data ?? null, 'engagements')
  // Notes first, then hides over the merged list, so a hide still removes a day's note.
  const noted = await withNotes({
    clientSlug, channel, chart: 'engagements', role, email: email ?? null, series: trend.data,
    from: start, to: end, today: todayUtc(), items: built, posts: posts.data ?? null,
  })
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'engagements', role, items: noted.items })
  // Jasmine's outline names this chart, word for word.
  return (
    <EngagementTrend
      series={trend.data}
      annotations={toChartAnnotations(items)}
      annotationControls={controls}
      noteControls={noted.controls}
      title={`${CHANNEL_LABEL[channel]} Engagement Graph`}
    />
  )
}
```

- [ ] **Step 6: Pass `noteControls` through the chart components**

`components/report-sections/organic-social/follower-graph.tsx`, whole file:

```tsx
import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'

/** Daily followers over time. On a platform subpage `series` has one channel.
 *  `annotations`, `noteControls` and `title` are optional: v1 of this part passes none of them and
 *  renders exactly as before, titled "Followers" over total followers. */
export function FollowerGraph({
  series, annotations, annotationControls, noteControls, title = 'Followers',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} />
}
```

`trends.tsx`: add `NoteControls` to the type import at `:9`; add `noteControls?: NoteControls` to
the props TYPE of `ChannelTrendChart` (`:33`) without destructuring it yet (Task 8 does), so nothing
is unused in between; and change `EngagementTrend` (`:143-147`) to:

```tsx
export function EngagementTrend({
  series, annotations, annotationControls, noteControls, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} />
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run components/report-sections/`
Expected: all pass. The golden snapshots are unchanged:
`git diff --name-only origin/dev -- '*.snap'` prints nothing.

- [ ] **Step 8: Commit and push**

```bash
git add components/report-sections/organic-social/
git status --porcelain
git commit -m "feat(organic-social): the v2 graphs read the team's notes; the viewer's email joins the context" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: The note in the chart's hover box

**Files:**
- Modify: `components/charts/line-chart.tsx` (imports `:3-13`, props `:24-32`, `:87`, `Tooltip` `:110-119`)
- Modify: `components/charts/line-chart.test.tsx` (append)

**Interfaces:**
- Produces: `LineChart` prop `notes?: Record<string, string>` (keyed by x value); exported
  `NotedTooltip(props: ComponentProps<typeof DefaultTooltipContent> & { note?: string })`.

Recharts calls a function `content` with the same props it gives its default box
(`node_modules/recharts/lib/component/Tooltip.js:34-42`), so the hover box with a note is the
default box plus one line. With `notes` absent, `content` is `undefined` and the Tooltip renders
its default, as today. The Renaissance goldens (`v1-render.golden.test.tsx`, including the Paid
Media shaped `LineChart` at `:79-81`) prove it stays byte-identical.

- [ ] **Step 1: Write the failing tests**

Append to `components/charts/line-chart.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { DefaultTooltipContent } from 'recharts'
import { NotedTooltip } from './line-chart'

// Invented values. The box is rendered directly: Recharts only shows it on a real hover.
const P = {
  active: true, label: '2026-09-21', contentStyle: { background: '#272727' },
  payload: [{ name: 'Instagram', value: 9, dataKey: 'Instagram', color: '#ffffff' }],
} as unknown as ComponentProps<typeof NotedTooltip>

describe('NotedTooltip', () => {
  test('with no note, the hover box is exactly the default one', () => {
    const noted = render(<NotedTooltip {...P} />).container.innerHTML
    const plain = render(<DefaultTooltipContent {...(P as ComponentProps<typeof DefaultTooltipContent>)} />).container.innerHTML
    expect(noted).toBe(plain)
  })

  test('with a note, the box shows the date, the value, then the note under them', () => {
    const text = render(<NotedTooltip {...P} note="Influencer post went live" />).container.textContent ?? ''
    expect(text).toContain('2026-09-21')
    expect(text).toContain('Instagram')
    expect(text.indexOf('Influencer post went live')).toBeGreaterThan(text.indexOf('Instagram'))
  })

  test('a long note wraps inside the box instead of stretching it', () => {
    const c = render(<NotedTooltip {...P} note={'x'.repeat(80)} />).container
    const note = [...c.querySelectorAll('p')].find((el) => el.textContent === 'x'.repeat(80)) as HTMLElement
    expect(note.style.whiteSpace).toBe('normal')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/charts/line-chart.test.tsx`
Expected: FAIL, `NotedTooltip` is not exported.

- [ ] **Step 3: Add the prop and the box**

`line-chart.tsx`: add `DefaultTooltipContent` to the `recharts` import and
`import type { ComponentProps } from 'react'`. Add to `LineChartProps`:

```ts
  /** The team's approved notes, keyed by x value, shown under the value in the hover box. Optional
   *  everywhere: a chart given no notes renders exactly the Tooltip it rendered before this prop. */
  notes?: Record<string, string>
```

Add above `export function LineChart`:

```tsx
/** The default hover box, plus the day's note under the value when there is one. Recharts passes a
 *  function `content` the same props it passes its own box, so with no note this is that box. */
export function NotedTooltip({ note, ...props }: ComponentProps<typeof DefaultTooltipContent> & { note?: string }) {
  if (!note) return <DefaultTooltipContent {...props} />
  return (
    <div style={{ margin: 0, padding: 10, ...props.contentStyle }}>
      <DefaultTooltipContent {...props} contentStyle={{ ...props.contentStyle, border: 'none', background: 'transparent', padding: 0 }} />
      <p style={{ margin: '6px 0 0', maxWidth: 240, whiteSpace: 'normal' }}>{note}</p>
    </div>
  )
}
```

Change the signature at `:87` to `({ data, xKey, yKeys, marks, notes, height = 300, valueFormat }: LineChartProps)`
and the `Tooltip` at `:110-119` to:

```tsx
          <Tooltip
            formatter={fmt}
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
            content={notes ? (p) => <NotedTooltip {...p} note={notes[String(p.label)]} /> : undefined}
          />
```

- [ ] **Step 4: Run the tests and the Renaissance goldens**

Run: `npx vitest run components/charts/line-chart.test.tsx components/report-sections/organic-social/v1-render.golden.test.tsx components/report-sections/organic-social/render-invariant.test.tsx`
Expected: all pass, and `git diff --name-only origin/dev -- '*.snap'` prints nothing. If a
snapshot changed, `content={undefined}` is not identical to no prop in this Recharts version:
switch to spreading `{...(notes ? { content: ... } : {})}` with the callback typed as
`(p: TooltipContentProps<ValueType, NameType>)`, and re-run.

- [ ] **Step 5: Commit and push**

```bash
git add components/charts/line-chart.tsx components/charts/line-chart.test.tsx
git commit -m "feat(charts): an optional note in the line chart's hover box" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: The callout row, the dots and the forms

**Files:**
- Create: `components/report-sections/organic-social/note-form.tsx`
- Create: `components/report-sections/organic-social/note-actions.tsx`
- Modify: `components/report-sections/organic-social/annotation-callouts.tsx:46-54`, `:60-122`
- Modify: `components/report-sections/organic-social/trends.tsx:31-139`
- Create: `components/report-sections/organic-social/chart-notes-ui.test.tsx`

**Interfaces:**
- Consumes: the four actions (Task 4); `NOTE_MAX_CHARS`, `NOTE_MAX_POSTS` (Task 2); `dayLabel`,
  `thumbSrc`, `NoteControls`, `ChartAnnotation`, `ChartThumb` (Tasks 2 and 5); `LineChart.notes`
  (Task 7).
- Produces: `NoteForm({ controls, fixedDay?, initial?, onClose })`, `NoteActions({ annotation, controls })`.

- [ ] **Step 1: Write the failing tests**

`components/report-sections/organic-social/chart-notes-ui.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is a stub that records its props.
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))
const actions = vi.hoisted(() => ({
  saveChartNoteAction: vi.fn(async () => ({ ok: true })),
  approveChartNoteAction: vi.fn(async () => ({ ok: true })),
  revokeChartNoteAction: vi.fn(async () => ({ ok: true })),
  deleteChartNoteDraftAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/chart-notes', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LineChart } from '@/components/charts/line-chart'
import { ChannelTrendChart } from './trends'
import type { ChartAnnotation, ChartThumb, NoteControls } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'

// Every value is invented.
const SERIES: TrendSeries = {
  channels: ['Instagram'],
  points: ['2026-08-10', '2026-08-14', '2026-08-20', '2026-08-22'].map((date) => ({ date, Instagram: 5 })),
}
const IMG = (n: number): ChartThumb => ({
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${n}.jpg`, full: `https://cdn.example.com/f${n}.jpg` },
  mediaType: 'IMAGE', url: `https://example.com/p/${n}`,
})
const PEAK: ChartAnnotation = { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', hidden: false, thumb: IMG(1) }
const QUIET = (over: Partial<ChartAnnotation>): ChartAnnotation =>
  ({ date: '2026-08-14', value: -3, label: '8/14', hidden: false, thumb: null, noteOnly: true, ...over })
const CONTROLS: NoteControls = {
  clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', canApprove: true,
  days: [
    { day: '2026-08-10', posts: [{ id: 11, thumb: IMG(1) }, { id: 12, thumb: IMG(2) }, { id: 13, thumb: IMG(3) }] },
    { day: '2026-08-14', posts: [] },
  ],
}
const chart = () => vi.mocked(LineChart).mock.lastCall![0]
const draw = (annotations: ChartAnnotation[], noteControls?: NoteControls) =>
  render(<ChannelTrendChart title="T" series={SERIES} annotations={annotations} noteControls={noteControls} />)

beforeEach(() => vi.clearAllMocks())

test('an approved note joins its top-day callout after a second pipe', () => {
  draw([{ ...PEAK, note: 'Influencer post went live' }])
  expect(screen.getByText('8/10 | 50 Engagements | Influencer post went live')).toBeTruthy()
})

test('a note-only day shows the date and the note, and no number', () => {
  draw([QUIET({ note: 'Event' })])
  expect(screen.getByText('8/14 | Event')).toBeTruthy()
  expect(screen.queryByText(/-3/)).toBeNull()
})

test('picked posts replace the top post on the card', () => {
  const { container } = draw([{ ...PEAK, note: 'x', thumbs: [IMG(2), IMG(3)] }])
  expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
    'https://cdn.example.com/t2.jpg', 'https://cdn.example.com/t3.jpg',
  ])
})

test('a dot marks top days and approved note days; a draft-only or hidden day gets none', () => {
  const draftOnly = QUIET({ date: '2026-08-20', noteEditor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } } })
  draw([PEAK, QUIET({ note: 'Event' }), draftOnly, QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
  expect(chart().marks).toEqual([{ x: '2026-08-10' }, { x: '2026-08-14' }])
})

test('the hover box gets approved notes on shown days only, and nothing when there are none', () => {
  draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
  expect(chart().notes).toEqual({ '2026-08-14': 'Event' })
  draw([PEAK])
  expect(chart().notes).toBeUndefined()
})

test('a draft-only card never reaches a PDF; an approved note-only card does', () => {
  const draftOnly = QUIET({ date: '2026-08-20', noteEditor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } } })
  draw([QUIET({ note: 'Event' }), draftOnly], CONTROLS)
  expect(screen.getByText('8/14 | Event').closest('li')?.className).not.toContain('no-print')
  expect(screen.getByText('8/20').closest('li')?.className).toContain('no-print')
  expect(screen.getByText('Draft: Soon').className).toContain('no-print')
})

test('a client sees no note controls and no draft text', () => {
  draw([{ ...PEAK, note: 'Event' }])
  expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
  expect(screen.queryByText(/^Draft:/)).toBeNull()
})

test('Add note saves the day, up to 2 posts and the text, then refreshes the page', async () => {
  draw([PEAK], CONTROLS)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-08-10' } })
  fireEvent.click(screen.getByLabelText('Post 1'))
  fireEvent.click(screen.getByLabelText('Post 2'))
  expect((screen.getByLabelText('Post 3') as HTMLInputElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Went live' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(actions.saveChartNoteAction).toHaveBeenCalledWith({
    clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', day: '2026-08-10', body: 'Went live', postIds: [11, 12],
  })
})

test('a refused save shows the reason and does not refresh', async () => {
  actions.saveChartNoteAction.mockResolvedValueOnce({ ok: false, error: 'A draft is already open on this day. Reload to see it.' } as never)
  draw([PEAK], CONTROLS)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
  fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect((await screen.findByRole('alert')).textContent).toContain('A draft is already open on this day')
  expect(refresh).not.toHaveBeenCalled()
})

test('an approver gets Approve on a draft and Revoke on an approved note; an editor gets neither', async () => {
  const ed = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } }
  const approver = draw([{ ...PEAK, note: 'Old', noteEditor: ed }], CONTROLS)
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await waitFor(() => expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'did'))
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  approver.unmount()

  draw([{ ...PEAK, note: 'Old', noteEditor: ed }], { ...CONTROLS, canApprove: false })
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/report-sections/organic-social/chart-notes-ui.test.tsx`
Expected: FAIL: no joined label, no controls, `chart().notes` missing.

- [ ] **Step 3: Write the form**

`components/report-sections/organic-social/note-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from '@/lib/organic-social/chart-notes/limits'
import { dayLabel, thumbSrc, type NoteControls } from '@/lib/organic-social/annotations'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'
const BUTTON = 'rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** Add or edit a day's note: the day (fixed when editing), up to NOTE_MAX_POSTS of that day's posts,
 *  and the text. Saving always lands as a draft; the action re-checks everything. Staff only, and
 *  `no-print`, since Export PDF prints the page in front of you. */
export function NoteForm({ controls, fixedDay, initial, onClose }: {
  controls: NoteControls
  fixedDay?: string
  initial?: { text: string; postIds: number[] }
  onClose: () => void
}) {
  const router = useRouter()
  const latest = controls.days[controls.days.length - 1]?.day ?? ''
  const [day, setDay] = useState(fixedDay ?? latest)
  const posts = controls.days.find((d) => d.day === day)?.posts ?? []
  const [text, setText] = useState(initial?.text ?? '')
  // A pick Dash no longer returns cannot be shown or unticked, so it is dropped here.
  const [picked, setPicked] = useState<number[]>((initial?.postIds ?? []).filter((id) => posts.some((p) => p.id === id)))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < NOTE_MAX_POSTS ? [...p, id] : p))

  function save() {
    setError(null)
    startTransition(async () => {
      let r: { ok: boolean; error?: string }
      try {
        r = await saveChartNoteAction({ clientSlug: controls.clientSlug, channel: controls.channel, chart: controls.chart, day, body: text, postIds: picked })
      } catch {
        r = { ok: false, error: 'Could not save. Try again.' }
      }
      if (!r.ok) { setError(r.error ?? 'Could not save. Try again.'); return }
      onClose()
      router.refresh() // re-runs the RSC; the action's revalidateTag already busted the cache
    })
  }

  return (
    <div role="group" aria-label="Note" className="no-print flex w-full flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
      <select aria-label="Day" className={FIELD} value={day} disabled={!!fixedDay}
        onChange={(e) => { setDay(e.target.value); setPicked([]) }}>
        {controls.days.map((d) => (
          <option key={d.day} value={d.day}>
            {dayLabel(d.day)}{d.posts.length ? ` (${d.posts.length} post${d.posts.length === 1 ? '' : 's'})` : ''}
          </option>
        ))}
      </select>
      {posts.map((p, i) => {
        const on = picked.includes(p.id)
        const src = thumbSrc(p.thumb)
        return (
          <label key={p.id} className="flex items-center gap-1 text-[11px] text-text-muted">
            <input type="checkbox" aria-label={`Post ${i + 1}`} checked={on}
              disabled={!on && picked.length >= NOTE_MAX_POSTS} onChange={() => toggle(p.id)} />
            {src ? <img src={src} alt="" className="h-10 w-10 rounded object-cover" /> : <span>No preview</span>}
          </label>
        )
      })}
      <input aria-label="Note text" className={`${FIELD} min-w-[12rem] flex-1`} value={text}
        maxLength={NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder="What happened this day?" />
      <button type="button" className={BUTTON} onClick={save} disabled={pending || !text.trim() || !day}>Save draft</button>
      <button type="button" className={BUTTON} onClick={onClose} disabled={pending}>Cancel</button>
      {error && <p role="alert" className="w-full text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Write the per-card actions**

`components/report-sections/organic-social/note-actions.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction } from '@/app/actions/chart-notes'
import type { ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'
import { NoteForm } from './note-form'

const BUTTON = 'no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** A card's note controls, for someone who can edit: add or edit the note, delete a draft, and for
 *  an approver, approve a draft or revoke an approved note. Each action re-checks the session. */
export function NoteActions({ annotation, controls }: { annotation: ChartAnnotation; controls: NoteControls }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ed = annotation.noteEditor

  const run = (act: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null)
      let r: { ok: boolean; error?: string }
      try { r = await act() } catch { r = { ok: false, error: 'Something went wrong. Try again.' } }
      if (!r.ok) { setError(r.error ?? 'Something went wrong. Try again.'); return }
      router.refresh()
    })

  // Editing opens the day's draft if there is one (the server edits that draft), else the
  // approved text.
  const initial = ed?.draft
    ? { text: ed.draft.text, postIds: ed.draft.postIds }
    : annotation.note ? { text: annotation.note, postIds: ed?.approvedPostIds ?? [] } : undefined

  return (
    <>
      <button type="button" className={BUTTON} disabled={pending} onClick={() => setEditing((v) => !v)}>
        {ed ? 'Edit note' : 'Add note'}
      </button>
      {ed?.draft && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending}
          onClick={() => run(() => approveChartNoteAction(controls.clientSlug, ed.draft!.id))}>Approve</button>
      )}
      {ed?.approvedId && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending}
          onClick={() => run(() => revokeChartNoteAction(controls.clientSlug, ed.approvedId!))}>Revoke</button>
      )}
      {ed?.draft && (
        <button type="button" className={BUTTON} disabled={pending}
          onClick={() => run(() => deleteChartNoteDraftAction(controls.clientSlug, ed.draft!.id))}>Delete draft</button>
      )}
      {error && <span role="alert" className="no-print text-[11px] text-red-400">{error}</span>}
      {editing && <NoteForm controls={controls} fixedDay={annotation.date} initial={initial} onClose={() => setEditing(false)} />}
    </>
  )
}
```

- [ ] **Step 5: Draw the note on the card**

In `annotation-callouts.tsx`:

1. Imports: add `ChartThumb` and `NoteControls` to the type import at `:6`, and
   `import { NoteActions } from './note-actions'`.
2. Replace `Thumb` (`:46-54`) with:

```tsx
/** The annotation's own label describes the picture: no caption crosses the server to client
 *  boundary (only the day, the value and the thumbnail do). */
function Thumb({ thumb, alt }: { thumb: ChartThumb; alt: string }) {
  const picture = <Picture creative={thumb.creative} alt={alt} />
  const href = safeHref(thumb.url)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{picture}</a> : picture
}
```

3. In `AnnotationItem`, add `noteControls?: NoteControls` to its props, and replace the returned
   `<li>` (`:87-102`) with:

```tsx
  // A day shown only for its note, with no approved note yet, has nothing for a client: like a
  // hidden row it must not reach a PDF exported from the team's view.
  const draftOnly = !!annotation.noteOnly && !annotation.note
  const text = annotation.note ? `${annotation.label} | ${annotation.note}` : annotation.label
  const thumbs = annotation.thumbs ?? (annotation.thumb ? [annotation.thumb] : [])
  const draft = annotation.noteEditor?.draft

  // Export PDF is window.print() of the page in front of you, so anything staff-only has to
  // carry `no-print` or it lands in a PDF exported from a client's view: a hidden row is shown
  // to staff only so they can unhide it, and the toggle is a control rather than content.
  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2', hidden && 'opacity-40 no-print', !hidden && draftOnly && 'no-print')}>
      {thumbs.map((t, i) => <Thumb key={i} thumb={t} alt={annotation.label} />)}
      <span className="text-xs font-bold text-white">{text}</span>
      {draft && <span className="no-print text-[11px] text-text-muted">Draft: {draft.text}</span>}
      {hidden && <span className="text-[11px] text-text-muted">Hidden from client</span>}
      {controls && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
        >
          {hidden ? 'Unhide' : 'Hide from client'}
        </button>
      )}
      {noteControls && <NoteActions annotation={annotation} controls={noteControls} />}
    </li>
  )
```

4. Replace `AnnotationCallouts` (`:106-122`) with:

```tsx
/** The days that spiked, and the days the team wrote a note on, in date order, directly above the
 *  chart they explain. Not pinned to pixel positions over the line, which would break as the chart
 *  resizes on a phone. */
export function AnnotationCallouts({ items, controls, noteControls, onToggle }: {
  items: ChartAnnotation[]
  controls?: AnnotationControls
  noteControls?: NoteControls
  onToggle?: (day: string, hidden: boolean) => void
}) {
  if (items.length === 0) return null
  // Hiding every row is not enough: the list is a non-last child of the chart's section, so
  // Tailwind still gives it a margin and the printed page keeps a gap where the row was. A
  // draft-only day prints nothing either.
  const nothingPrintable = items.every((a) => a.hidden || (a.noteOnly && !a.note))
  return (
    <ul aria-label="Annotations" className={cn('flex flex-wrap gap-3', nothingPrintable && 'no-print')}>
      {items.map((a) => <AnnotationItem key={a.date} annotation={a} controls={controls} noteControls={noteControls} onToggle={onToggle} />)}
    </ul>
  )
}
```

The `li` gains `flex-wrap` so an open form can take its own line; nothing else about a card
without a note changes.

- [ ] **Step 6: The chart: Add note, dots and hover notes**

In `trends.tsx`:

1. `import { NoteForm } from './note-form'`.
2. In `ChannelTrendChart`, add `noteControls` to the destructured props (`:32`) and add after the
   `showAnnotations` state (`:43`):

```tsx
  const [adding, setAdding] = useState(false)
```

3. Replace `:74` (`const visible = ...`) with:

```tsx
  const visible = hasAnnotations && showAnnotations && !activeEmpty ? current : undefined
  // A dot marks what a client sees: a top day, or a day with an approved note. A day shown only for
  // a draft gets no dot, and a hidden day gets none, so the team's chart matches the client's.
  const shown = visible?.filter((a) => !a.hidden && (!a.noteOnly || !!a.note))
  const noted = shown?.filter((a) => a.note)
  const notes = noted && noted.length > 0 ? Object.fromEntries(noted.map((a) => [a.date, a.note!])) : undefined
```

4. After the Annotations button block (after `:124`, still inside the button row `div`), add:

```tsx
            {noteControls && noteControls.days.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                aria-expanded={adding}
                className="no-print flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted transition-colors hover:text-white"
              >
                Add note
              </button>
            )}
```

5. Replace `:126` and the `LineChart` at `:130-135` with:

```tsx
          {adding && noteControls && <NoteForm controls={noteControls} onClose={() => setAdding(false)} />}
          {visible && <AnnotationCallouts items={visible} controls={annotationControls} noteControls={noteControls} onToggle={setHidden} />}
```

```tsx
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={shown?.map((a) => ({ x: a.date }))}
              notes={notes}
            />
```

With no annotations (every v1 chart, Renaissance included), `visible`, `shown` and `notes` are all
undefined, so `LineChart` gets `marks={undefined}` as today and `notes={undefined}`, which Task 7
proved renders today's Tooltip.

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run components/`
Expected: all pass, including `annotation-callouts.test.tsx`, `trends.identity.test.tsx` and every
golden. `git diff --name-only origin/dev -- '*.snap'` prints nothing.

- [ ] **Step 8: Commit and push**

```bash
git add components/report-sections/organic-social/
git status --porcelain
git commit -m "feat(organic-social): notes on the callouts, dots and forms for the team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Full verification, my own review, and the PR

**Files:** none new.

- [ ] **Step 1: Every check CI runs, plus the two it does not**

```bash
npx tsc --noEmit
npm run lint
npm run check:rsc
npm test 2>&1 | tail -6
```

Expected: all clean; the test count is the Task 0 baseline plus the new tests, with none skipped.

- [ ] **Step 2: Renaissance and hygiene guards**

```bash
git diff --name-only origin/dev -- '*.snap'
git diff --name-only origin/dev | xargs grep -nP "\x{2014}|\x{2013}" || echo "no dashes"
git diff origin/dev --stat
```

Expected: no snapshot file listed; "no dashes"; only the files this plan names.

- [ ] **Step 3: Prove the tests catch the mistakes that matter**

Make each edit, run the named test, see it fail, then `git checkout -- <file>`:

| Revert | Test that must fail |
|---|---|
| `noteCapabilities`: drop the `viewerForRole` line | `permissions.test.ts` "a client role gets nothing" |
| `withNotes`: drop `if (!client) throw` | `chart-notes.test.ts` "no client row fails the same way" |
| `notesByDay`: drop `r.day <= o.to` | `pick.test.ts` "only this chart, only inside the window" |
| `attach`: search all posts instead of `dayPosts` | `chart-notes.test.ts` "picked posts come only from that day" |
| `toChartAnnotations`: always spread `noteEditor` | `annotations.test.ts` "a client receives the approved note ... never the editor ids" |
| `saveChartNoteAction`: remove the `isOpenDraftConflict` branch | `chart-notes.test.ts` (actions) "losing the race" |
| `trends.tsx`: drop `(!a.noteOnly \|\| !!a.note)` | `chart-notes-ui.test.tsx` "a dot marks ..." |
| `validateNoteInput`: drop the future-day check | `validate.test.ts` "tomorrow is refused" |

- [ ] **Step 4: Prove the PR merges clean with every open PR, in any order**

```bash
gh pr list --state open --json number,headRefName
for b in $(gh pr list --state open --json headRefName -q '.[].headRefName'); do
  git fetch -q origin "$b"
  git merge-tree --write-tree origin/dev HEAD "origin/$b" >/dev/null && echo "clean with $b" || echo "CONFLICT with $b"
done
```

Expected: "clean with" every open branch.

- [ ] **Step 5: My own adversarial review**

Read the whole diff against spec P1 to P13 with fresh eyes, one section at a time, and write the
comprehension summary for the PR: where a note comes from, who sees what, and why Renaissance
cannot change. Anything found goes back through Tasks 2 to 8 before the PR is marked ready.

- [ ] **Step 6: The PR**

Mark the draft ready, replace its body with: what it does and why; the before and after test
counts with the raw tail of `npm test`; the Renaissance proof (no snapshot changed, v1 never reads
notes, the `LineChart` prop is off by default); the edge-case table from the Task 4 commit; the
migration note (staging on my written go, production only after Jasmine approves staging). Ask Paul
to review. Nothing merges to `dev` until his review is resolved and CI is green.

```bash
gh pr ready
~/code/push-check.sh
```

---

### Task 10: Staging (only on my written go)

Nothing here starts without my written go, and each numbered step that writes needs it.

- [ ] **Step 1: Host guard and preflight, read only**

Write `~/.claude/organic-social-work/probes/staging-0025-preflight.ts` (private, never
committed), modelled on `probes/staging-f3-delete-2026-09-24.ts`: refuse any host that is not the
staging database, list the migration tags whose hash is missing from
`drizzle.__drizzle_migrations` (must be exactly `0025_chart_notes`), print Renaissance's `clients`
row md5, and write nothing.

```bash
npx tsx --env-file=.env.staging ~/.claude/organic-social-work/probes/staging-0025-preflight.ts
```

- [ ] **Step 2: Apply 0025 to staging**

Only if the preflight says staging and only 0025 is pending:

```bash
CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts
```

Expected: `apply  0025_chart_notes (4 stmt) ... done`, then `applied 1 migration(s)`.

- [ ] **Step 3: Read it back**

Extend the preflight with a `--after` mode: `chart_notes` exists with the Task 1 columns; `pg_indexes`
shows both indexes, the unique one with its `WHERE` clause; the check constraint exists; the ledger
has the 0025 row; the table list differs from before by `chart_notes` only; Renaissance's md5 is
unchanged. Record the output in `MIGRATIONS-PENDING.md` ("staging applied <date>").

- [ ] **Step 4: Promote**

After the PR is merged to `dev` (Paul's review resolved, CI green, my go), open `dev → staging`
and merge it with `gh pr merge --merge --match-head-commit <sha>` once its checks pass.

- [ ] **Step 5: Verify on staging, as the team**

Coordinate with Jasmine's QA first so a test note never surprises her. On one platform tab of one
client's closed month:
- Add a draft on a day that is not a peak, with one picked post. It shows as `8/14` with
  `Draft: ...`, no dot, and no hover line. Export PDF leaves it out.
- If I am on `COMMENTARY_APPROVERS` in staging's environment, approve it: the dot and the hover
  line appear. Revoke it: they go.
- Delete the draft. It is gone.
- Two tabs saving on the same day: the second edits the first's open draft (last save wins). That
  is the designed behaviour, and it cannot produce the index conflict, because the second save
  finds the draft first.
- **The real error shape for `isOpenDraftConflict`** (unverified until now): a private probe,
  `~/.claude/organic-social-work/probes/staging-0025-conflict-shape.ts`, host-guarded like Step 1,
  runs `db.batch([insert draft, insert the same draft])` for a made-up day far in the past
  (2000-01-01) through the repo's own `db`. The batch is one transaction, so the failure rolls both
  back. It prints `isOpenDraftConflict(e)` and the error's `code` and `constraint` fields, nothing
  else, then reads back that no row for that day exists. Expected: `true`. If it prints `false`, fix
  `isOpenDraftConflict` to the shape it shows, with a test, before going on.
- **Unverified on staging:** what a client role sees, because staging has no client logins. The
  redaction is proven by the Task 5 and Task 8 tests only; say so in the staging report.

- [ ] **Step 6: Renaissance**

```bash
REPO=$PWD ~/.claude/renaissance-baseline/check-drift.sh
```

Judge the `REN.*` lines only (the production leg is blocked by the classifier, which is fine).
Then click through Renaissance's Organic Social tabs on staging: no Add note button, no dots, no
change.

- [ ] **Step 7: Stop**

Report to me. Nothing goes to production: that waits for Jasmine's approval on staging and my
written go, and `0025` goes to production first, the same way as Steps 1 to 3.
