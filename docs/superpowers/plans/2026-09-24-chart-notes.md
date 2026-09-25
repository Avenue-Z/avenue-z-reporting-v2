# Written notes on the annotated graphs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, inline in this session, task by task. No subagents and no background tasks (my standing rule). Steps use checkbox (`- [ ]`) syntax for tracking.

Written by me (Thomas) on 2026-09-24. Every file, function and line this plan names was read on
`dev` at `df2cf05`. Seven things were proven by running them on 2026-09-24, in scratch copies or
throwaway tests that were then deleted:
1. The exact SQL `drizzle-kit generate` produces for the new table (Task 1 shows it), and that it
   touches nothing else.
2. The hover box component type-checks against the installed Recharts 3.7.0 under `strict`.
3. Passing the Tooltip `content={undefined}` draws exactly what leaving it out draws, idle and on
   hover (Task 7).
4. Recharts puts day `i` of `n` at `plot.x + i / (n - 1) * plot.width` and a value at
   `plot.y + (1 - (v - lo) / (hi - lo)) * plot.height`: three dots matched to the pixel (Task 8).
5. A plain component inside the chart can call `usePlotArea()` and gets the real plot area (Task 8).
6. The test DOM has no `window.matchMedia`, and nothing in the repo uses it, so every existing test
   keeps rendering the callout row (Task 9).
7. Drizzle sends `eq(chartNotes.postIds, [11, 12])` as `"post_ids" = $n` with `'{11,12}'` (and `'{}'`
   for none), so approve matches the whole list of picked posts (Task 3).

**Goal:** Let the team put a short, approved note on any day of a v2 Organic Social graph, with up
to 2 of that day's posts, shown on the callout and in the chart's hover box; and pin every callout
(the automatic top days and the notes) to its dot, the way the team's deck does.

**Architecture:** A new additive table, `chart_notes`, holds notes with Commentary's draft and
approve lifecycle. The two v2 graph parts read them once per platform and merge them into the
annotation list they already build, before the existing hides layer runs, so a hide still wins.
Four server actions write them, each checking the role and the email. The shared `LineChart` gains
two optional props, one for the hover box and one for cards pinned to their dots; with both absent
it renders exactly what it renders today. On a phone-width screen the callouts stay in the row
above the chart, as Phase 1 shows them now.

**Tech Stack:** Next.js 16 App Router, React 19.2.3, TypeScript strict, Drizzle ORM 0.45.2 on Neon
(`drizzle-orm/neon-http`), Recharts 3.7.0, Vitest 3 with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-chart-annotations-design.md`, section "Phase 2:
written notes" (P1 to P13). The team confirmed the reading on 2026-09-24 (Kyleah): any day, the
team picks that day's posts, a short note, shown on the callout and on hover, approved before a
client sees it.

## Global Constraints

- **Renaissance is untouched.** Its graphs are v1 and never call the notes code. Every existing
  golden snapshot stays byte-identical: `git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'` prints
  nothing at the end. The Renaissance drift check's `REN.*` lines stay identical on staging.
- **Commentary is copied, never edited.** Notes follow Commentary's logic and import its guard
  functions (`lib/commentary/mutations.ts`, `lib/commentary/permissions.ts`) as they are. No file
  under `lib/commentary/`, `app/actions/commentary.ts`, `components/report-sections/commentary/`,
  and no `report_commentary` column or row, changes. Renaissance runs Commentary. Two additions of
  our own, both in the new files only: one open draft per day, and approve matching what the
  approver was shown (Task 3, `approveNote`; approved by me 2026-09-24).
- **No note can be written or read for Renaissance.** Every action refuses a client that is not on
  locked months (`hasReportingMonths`, `lib/organic-social/reporting-months.ts:75-79`), and
  `withNotes` skips one before reading. Renaissance's `dash_social_config` holds only `brandId` in
  dev, staging and prod (the 2026-09-17 baselines in `~/.claude/renaissance-baseline/`).
- **The Renaissance stop**, run at the end of every task before its commit. It must pass, or the
  task is not done:

  ```bash
  npx vitest run components/report-sections/organic-social/v1-render.golden.test.tsx components/report-sections/organic-social/render-invariant.test.tsx components/report-sections/organic-social/parts/composition.golden.test.tsx components/report-sections/organic-social/parts/follower-graph.golden.test.tsx components/report-sections/organic-social/parts/engagement-trend.golden.test.tsx
  git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap' 'lib/commentary/' 'app/actions/commentary.ts' 'components/report-sections/commentary/'
  ```

  Expected: every test passes, and the second command prints nothing. It compares against where
  this branch left `dev`, so other work merging to `dev` meanwhile cannot show up here. Each task
  also says, in one line, what it touches that Renaissance could reach and why it cannot.
- **An environment without 0025** (dev until I choose to migrate it, production until the
  production step) shows no notes and logs `chart notes unreadable ...` from the v2 graphs: that is
  the fail-closed path, by design. Renaissance never reads the table, so it logs nothing.
- **Every shared change is optional and off by default:** the `LineChart` `notes` and `pins`
  props, the `email` field on `OrganicSocialCtx`, the new optional fields on `Annotation` and
  `ChartAnnotation`, the `noteControls` prop on the two chart components, the `LineChart`
  `pinHeight` prop, and the `onEdit` prop on `AnnotationCallouts`.
- **Layout: option B, approved 2026-09-24 (the sketch).** On a wide screen every callout a client
  may see is a card on the chart joined by a red line to its dot: the date and number on the first
  line, the note on its own line under it, and the post picture(s). Always visible, printed as it
  appears; the Annotations button shows or hides them all. The team's buttons (Hide from client or
  Unhide, Add or Edit note, Approve, Revoke, Delete draft) sit on each card; the team's hidden and
  draft cards are pinned too, faded, never printed, with no dot. The Add note and Edit form opens
  above the chart. On a phone-width screen (under 640px) the row above the chart, as today, with
  the same buttons. A note needs 1 to 80 characters of text, even when posts are picked.
- **Front end:** use the chart's existing styles (`CHART_COLORS` in `lib/constants.ts`, the card
  classes already in `annotation-callouts.tsx`); load the `frontend:brand-coherence` skill before
  Tasks 8 and 9.
- **Notes:** 1 to 80 characters after trimming, counted as characters (an emoji counts once), one
  line, plain text rendered as text. Up to 2 post ids. A day that is not after today in UTC.
- **Who:** team or client by role (`viewerForRole`); write needs `canEditCommentary(email)`;
  approve and revoke need `canApproveCommentary(email, ...)` checked against the notes' own
  `CHART_NOTES_APPROVERS` list, never Commentary's `COMMENTARY_APPROVERS` (decided by me
  2026-09-24: the organic social approvers differ from Commentary's). Unset means nobody can
  approve a note: fail closed. A client role is refused whatever its email.
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

1. **A note on a day that lost followers, or had none.** The card must read `8/14` with the note
   under it, never `+-3 Followers`. Pinned in Task 5 (`a day that lost followers keeps its note and never
   gets a signed number`).
2. **A picked post that is from another day, or that Dash no longer returns.** It must never show;
   when every pick is gone the card keeps the day's top post. Pinned in Task 5.
3. **A team session with no email, or with an email outside `@avenuez.com`.** It must get exactly
   the client view: approved notes only, no drafts, no ids, no controls. Pinned in Tasks 2 and 5.
4. **Two saves racing for the same day** (a double click, or two people). The second must come back
   as a clear message, not a thrown error. Pinned in Task 4.
5. **The live month.** The form must never offer a day after today, and the server must refuse one
   sent directly. Pinned in Tasks 2 and 5.
6. **Neighbouring top days, and the first and last day of the month.** Pinned cards must never
   overlap and never leave the plot: neighbours stack into rows, edge days clamp inside. Pinned in
   Task 8 (`neighbouring days stack into rows`, `the first and last days stay inside the plot`), and
   the connector must end exactly on Recharts' own dot (`each connector ends exactly on its dot`).
7. **A draft edited after the approver opened the page.** Approving must not publish words the
   approver never saw. Pinned in Task 4 (`a note edited after the approver opened the page is not
   approved`), with the database match proven offline (proof 7 above).

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Keep the plan in reach, then cut the branch from dev**

The plan and the spec live on PR #272's branch, not on `dev`, so they leave the working copy when
the branch switches. Unless #272 has merged to `dev`, keep private read-only copies first:

```bash
git status --porcelain
git fetch origin
git show origin/docs/annotation-notes-spec:docs/superpowers/plans/2026-09-24-chart-notes.md > ~/.claude/organic-social-work/build-plan-chart-notes.md
git show origin/docs/annotation-notes-spec:docs/superpowers/specs/2026-09-18-chart-annotations-design.md > ~/.claude/organic-social-work/build-spec-chart-annotations.md
git switch -c feat/os-chart-notes origin/dev
git log --oneline -1
```

Expected: the first command prints nothing (a clean tree), and the tip is `origin/dev`.

- [ ] **Step 2: Record the baseline**

```bash
npm test 2>&1 | tail -6
```

Expected: every test passes. Write the "Test Files" and "Tests" counts into the PR description
later, as the before numbers.

- [ ] **Step 3: Renaissance stop, as the green start**

Run the Renaissance stop (Global Constraints). Every later stop compares against this.

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

- [ ] **Step 7: Renaissance stop, then commit**

Renaissance: One new table; no existing table, column or row changes. The migration test proves every statement is about `chart_notes`. No Renaissance code or data is involved. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

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
    `isNoteId(id: unknown): id is string`, `isSeenNote(seen: unknown)`, `todayUtc(now?: Date): string`.
  - `permissions.ts`: `noteCapabilities(role: unknown, email: string | null | undefined, env?: string): { canEdit: boolean; canApprove: boolean }`.
  - `pick.ts`: `latestApproved`, `notesByDay(rows, { chart, from, to, canEdit }): Map<string, DayNote>`, type `DayNote`.

- [ ] **Step 1: Write the failing tests**

`lib/organic-social/chart-notes/validate.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isNoteId, isSeenNote, todayUtc, validateNoteInput } from './validate'

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

test('what an approver was shown is a text and at most 2 post ids', () => {
  expect(isSeenNote({ text: 'Went live', postIds: [11] })).toBe(true)
  expect(isSeenNote({ text: '', postIds: [] })).toBe(true)
  for (const bad of [null, 'x', { text: 1, postIds: [] }, { text: 'x' }, { text: 'x', postIds: [1, 2, 3] }, { text: 'x', postIds: [0] }]) {
    expect(isSeenNote(bad)).toBe(false)
  }
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

test('notes read their own list: Commentary\'s COMMENTARY_APPROVERS grants nothing here', () => {
  process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com'
  delete process.env.CHART_NOTES_APPROVERS
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: false })
  process.env.CHART_NOTES_APPROVERS = 'approver@avenuez.com'
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: true })
  delete process.env.COMMENTARY_APPROVERS
  delete process.env.CHART_NOTES_APPROVERS
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

In `interface ChartAnnotation` (`:108-115`), change the `thumb` line to `thumb: ChartThumb | null`
and add after it:

```ts
  /** Phase 2: the approved note, shown on its own line under the label. */
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

/** What an approver was shown: the draft's text and picked posts, sent back with Approve. Shape
 *  only; the database match does the rest (approveNote). */
export function isSeenNote(seen: unknown): seen is { text: string; postIds: number[] } {
  if (!seen || typeof seen !== 'object') return false
  const { text, postIds } = seen as { text?: unknown; postIds?: unknown }
  return typeof text === 'string' && Array.isArray(postIds) && postIds.length <= NOTE_MAX_POSTS
    && postIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
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
 *  its email; a team role writes with an @avenuez.com email and approves only when that email is
 *  on the notes' OWN allowlist, CHART_NOTES_APPROVERS. Not COMMENTARY_APPROVERS: the organic
 *  social approvers differ from Commentary's (decided 2026-09-24), and neither list grants the
 *  other's approvals. Unset means nobody approves: fail closed. `env` is only for tests. */
export function noteCapabilities(
  role: unknown,
  email: string | null | undefined,
  env: string | undefined = process.env.CHART_NOTES_APPROVERS,
): { canEdit: boolean; canApprove: boolean } {
  if (viewerForRole(role) !== 'team') return { canEdit: false, canApprove: false }
  // env ?? '' and never a bare env: canApproveCommentary's own default argument falls back to
  // COMMENTARY_APPROVERS when it is passed undefined (lib/commentary/permissions.ts:25), which
  // would hand Commentary's approvers the notes whenever the notes' var is unset. Proven by
  // running it, 2026-09-24: the test "notes read their own list" fails on a bare env.
  return { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email, env ?? '') }
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

- [ ] **Step 7: Renaissance stop, then commit**

Renaissance: New files, plus two edits on shared files that change no behaviour: `isRealDay` gains `export`, and `annotationLabel` builds its date with `dayLabel` (identical output, pinned by `annotations.test.ts:97-116`). v1 never builds annotation labels. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

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
  - `approveNote(id: string, by: string, seen: { text: string; postIds: number[] }): Promise<boolean>`
  - `revokeNote(id: string): Promise<boolean>`
  - `softDeleteDraft(id: string, by: string): Promise<boolean>`
  - `OPEN_DRAFT_INDEX = 'chart_notes_one_open_draft'`, `isOpenDraftConflict(e: unknown): boolean`

The database writes are exercised through the action tests (Task 4, mocked) and on staging
(Task 11). Only the pure error check has a unit test, the same split the hides module uses
(`setAnnotationHidden` has no unit test; `authorizeAnnotationHide` does).

- [ ] **Step 1: Write the failing test**

`lib/organic-social/chart-notes/mutations.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isOpenDraftConflict } from './mutations'

// Unverified until staging (Task 11): the exact shape neon-http gives a unique violation. The
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

/** Approve exactly what the approver was shown. Editing a draft changes that same row, so without
 *  the text and posts in the match an edit made after the approver opened the page would be
 *  approved unread, and a client would see words nobody approved. Commentary approves by id
 *  alone (approveCommentary, app/actions/commentary.ts:122, its update at :136-140); this check is
 *  one of the two additions of our own, and lives only in the notes code. */
export async function approveNote(id: string, by: string, seen: { text: string; postIds: number[] }): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ status: 'approved', approvedBy: by, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(chartNotes.id, id), isNull(chartNotes.deletedAt),
      eq(chartNotes.body, seen.text), eq(chartNotes.postIds, seen.postIds),
    ))
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

- [ ] **Step 6: Renaissance stop, then commit**

Renaissance: New files only. Nothing Renaissance runs imports them. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

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
  - `approveChartNoteAction(clientSlug: string, id: string, seen: { text: string; postIds: number[] })`
  - `revokeChartNoteAction(clientSlug: string, id: string)`
  - `deleteChartNoteDraftAction(clientSlug: string, id: string)`

- [ ] **Step 1: Write the failing tests**

`app/actions/chart-notes.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
// An October-shaped client: on locked months. Renaissance's config has no reportingMonths.
// vi.hoisted, because vi.mock is hoisted above every plain const in the file.
const { ON } = vi.hoisted(() => ({ ON: { id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } } }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ON) }))
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
// What the approver was shown on the card: the draft's text and picked posts.
const SEEN = { text: 'Influencer post went live', postIds: [11] }
const FORBIDDEN = { ok: false, error: 'forbidden' }
const writes = () => [m.insertDraft, m.updateDraft, m.approveNote, m.revokeNote, m.softDeleteDraft]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
  process.env.CHART_NOTES_APPROVERS = 'approver@avenuez.com'
})
afterEach(() => { vi.useRealTimers(); delete process.env.CHART_NOTES_APPROVERS })

test('a client role is refused by every action, even with an @avenuez.com email', async () => {
  as('CLIENT_ADMIN', 'approver@avenuez.com')
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(FORBIDDEN)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(FORBIDDEN)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(FORBIDDEN)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('a client not on locked months, shaped like Renaissance, is refused by every action; nothing is read or written', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  const renaissanceShaped = { id: 'another-uuid', dashSocialConfig: { brandId: 1 } }
  for (let i = 0; i < 4; i++) vi.mocked(getClientBySlug).mockResolvedValueOnce(renaissanceShaped as never)
  const NOT_ON = { ok: false, error: 'Notes are not on for this client.' }
  expect(await saveChartNoteAction(INPUT)).toEqual(NOT_ON)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(NOT_ON)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(NOT_ON)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(NOT_ON)
  expect(m.findOpenDraft).not.toHaveBeenCalled()
  expect(m.findChartNote).not.toHaveBeenCalled()
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
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(FORBIDDEN)
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: a malformed id, another client\'s note or a deleted note is "not found"', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  expect(await approveChartNoteAction('a-client', 'nope', SEEN)).toEqual({ ok: false, error: 'not found' })
  expect(m.findChartNote).not.toHaveBeenCalled()
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, clientId: 'someone-else' } as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'not found' })
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, deletedAt: new Date() } as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'not found' })
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: a malformed "what I saw" is refused before any read', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  for (const bad of [null, { text: 1, postIds: [] }, { text: 'x', postIds: [1, 2, 3] }, { text: 'x', postIds: ['1'] }]) {
    expect(await approveChartNoteAction('a-client', ID, bad as never)).toEqual({ ok: false, error: 'not found' })
  }
  expect(m.findChartNote).not.toHaveBeenCalled()
})

test('approve: an approver approves exactly what they were shown, stamped with their email', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: true })
  expect(m.approveNote).toHaveBeenCalledWith(ID, 'approver@avenuez.com', SEEN)
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})

test('approve: a note edited after the approver opened the page is not approved', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  vi.mocked(m.approveNote).mockResolvedValueOnce(false)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'This note changed since you opened the page. Reload to see it.' })
  expect(revalidateTag).not.toHaveBeenCalled()
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
import { isNoteId, isSeenNote, todayUtc, validateNoteInput } from '@/lib/organic-social/chart-notes/validate'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import {
  approveNote, findChartNote, findOpenDraft, insertDraft, isOpenDraftConflict,
  revokeNote, softDeleteDraft, updateDraft, type NoteKey,
} from '@/lib/organic-social/chart-notes/mutations'
import type { AnnotationChart } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'

type Result = { ok: true } | { ok: false; error: string }

const FORBIDDEN: Result = { ok: false, error: 'forbidden' }
const NOT_FOUND: Result = { ok: false, error: 'not found' }
// Notes are only for clients on locked months (the October set). Renaissance is not on locked
// months, so no action here can ever write a row for it, whoever calls the action.
const NOT_ON: Result = { ok: false, error: 'Notes are not on for this client.' }

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
  if (!hasReportingMonths(client)) return NOT_ON

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
 *  must not be deleted, and it must still hold exactly what the approver was shown (`seen`, see
 *  approveNote). An older approval of the same day stays in the table, superseded, so a revoke
 *  falls back to it, as Commentary does. */
export async function approveChartNoteAction(clientSlug: string, id: string, seen: { text: string; postIds: number[] }): Promise<Result> {
  const v = await viewer()
  if (!v.canApprove) return FORBIDDEN
  if (!isNoteId(id) || !isSeenNote(seen)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!hasReportingMonths(client)) return NOT_ON
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const alive = guardNotDeleted(row)
  if (!alive.ok) return { ok: false, error: alive.error! }
  if (!(await approveNote(id, v.email!, seen))) {
    return { ok: false, error: 'This note changed since you opened the page. Reload to see it.' }
  }
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
  if (!hasReportingMonths(client)) return NOT_ON
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
  if (!hasReportingMonths(client)) return NOT_ON
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

- [ ] **Step 5: Renaissance stop, then commit**

Renaissance: A new actions file, with the locked-months stop. The test "a client not on locked months, shaped like Renaissance, is refused by every action" proves no note can be written for Renaissance. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

This change crosses a process boundary and takes untrusted input, so the commit body carries the
six-category list (my global rule):

```bash
git add app/actions/chart-notes.ts app/actions/chart-notes.test.ts
git commit -F - <<'EOF'
feat(organic-social): server actions to save, approve, revoke and delete chart notes

## Edge cases

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | a database error mid-write | app/actions/chart-notes.ts | fix: the index race returns a message; anything else throws to the caller, which shows a generic retry line (Task 9) |
| 2 | operator visibility | a refused or failed action is not logged server-side | app/actions/chart-notes.ts | file: Commentary's actions do not log either; add both together |
| 3 | bounds | note length and post count | lib/organic-social/chart-notes/validate.ts | fix: 80 characters, 2 posts |
| 4 | input boundaries | every field of the payload, and the note id | validate.ts, isNoteId | fix: validated before any read; a bad id never reaches a uuid cast |
| 5 | state and concurrency | two drafts on one day; a row deleted between read and write; a draft edited after the approver opened the page | chart_notes_one_open_draft, mutations.ts, approveNote | fix: the index plus a clear message; every write reports whether it hit a row; approve matches the text and posts the approver saw |
| 6 | security | a client role, a team role without an @avenuez.com email, or a client not on locked months (Renaissance), calling an action directly | viewer() and hasReportingMonths in chart-notes.ts | fix: role, email and locked months all checked before any read; the author is taken from the session |

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
  // On locked months, like the October clients. Renaissance's config has no reportingMonths.
  getClientBySlug.mockReset().mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })
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

test('a client not on locked months, shaped like Renaissance, never reads notes and gets no controls', async () => {
  getClientBySlug.mockResolvedValue({ id: 'another-uuid', dashSocialConfig: { brandId: 1 } })
  expect(await withNotes(EDITOR)).toEqual({ items: [PEAK] })
  expect(getChartNotes).not.toHaveBeenCalled()
  expect(err).not.toHaveBeenCalled()
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

In `lib/organic-social/annotations.ts`, replace `toChartAnnotations` (`:118-127`, the end of the file) with:

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
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
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
    // Notes are only for clients on locked months. Renaissance is not, so its graphs never read
    // the table, whoever renders them. Not an error: nothing to log.
    if (!hasReportingMonths(client)) return { items: args.items }
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

- [ ] **Step 6: Renaissance stop, then commit**

Renaissance: `toChartAnnotations` gains fields that appear only when a note exists, and v1 never calls it. `withNotes` is new and skips a client not on locked months before any read (its test proves it). Run the Renaissance stop (Global Constraints); it must pass before the commit below.

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
  `noteControls` prop only; the chart uses it in Task 9)
- Modify: `components/report-sections/organic-social/parts/annotations-wiring.test.tsx`

**Interfaces:**
- Consumes: `withNotes` (Task 5), `todayUtc` (Task 2).
- Produces: `OrganicSocialCtx.email?: string`; `FollowerGraph`, `EngagementTrend` and
  `ChannelTrendChart` accept `noteControls?: NoteControls`.

- [ ] **Step 1: Write the failing tests**

In `annotations-wiring.test.tsx`, change the client mock at `:14` so the fixture client is on
locked months, like the October clients (the hides layer only reads its `id`, so nothing else in
the file changes):

```ts
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })),
}))
```

After the hides mock (`:12-13`) add:

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
the props TYPE of `ChannelTrendChart` (`:33`) without destructuring it yet (Task 9 does), so nothing
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
`git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'` prints nothing.

- [ ] **Step 8: Renaissance stop, then commit**

Renaissance: `OrganicSocialBody` is on Renaissance's path: it now also reads the email in the same guarded call and adds it only when present. No part Renaissance renders reads `email`, and the new test "v1 never reads notes" pins that its graph never touches the notes read. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

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
Expected: all pass, and `git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'` prints nothing.
`content={undefined}` was proven identical to leaving the prop out, idle and on hover, on
2026-09-24; if a snapshot still changes, stop and find out why before going on.

- [ ] **Step 5: Renaissance stop, then commit**

Renaissance: `LineChart` is shared with Renaissance's v1 graphs and its Paid Media trend. With `notes` absent it renders the same Tooltip; the goldens, including the Paid Media shaped chart, prove it byte for byte. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

```bash
git add components/charts/line-chart.tsx components/charts/line-chart.test.tsx
git commit -m "feat(charts): an optional note in the line chart's hover box" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: Callout cards pinned to their dots (the shared chart)

The deck layout: each card sits in a band above the plot, joined by a line down to its day's dot.
This task only teaches the shared `LineChart` to draw that when it is given `pins`; Task 9 decides
what goes in them.

Two facts it rests on were proven by running them on 2026-09-24 against the installed Recharts
3.7.0, in throwaway tests that were then deleted:
- A category x axis puts day `i` of `n` at `plot.x + i / (n - 1) * plot.width`, and a value `v`
  at `plot.y + (1 - (v - lo) / (hi - lo)) * plot.height`. At 800 by 300, three `ReferenceDot`s drew
  at exactly those points (60, 279.6 and 792 across a plot 60 to 792).
- A plain component placed inside the chart can call `usePlotArea()` (exported,
  `node_modules/recharts/types/index.d.ts:119`) and gets the real plot area, top margin included.

**Files:**
- Create: `components/charts/pins.ts`
- Modify: `components/charts/line-chart.tsx` (imports `:3-15`, props `:24-32`, body `:87-152`)
- Modify: `components/charts/line-chart.test.tsx` (append; mock `ResponsiveContainer` at the top)

**Interfaces:**
- Produces: `ChartPin { x: string; content: ReactNode }` and the `LineChart` prop
  `pins?: ChartPin[]`; from `pins.ts`: `layoutPins(dots, plot, width?, gap?): PinPlace[]`,
  `pinBand(tiers, height?): number`, `PIN_CARD_WIDTH = 280`, `PIN_CARD_HEIGHT = 80`,
  `PIN_TEAM_CARD_HEIGHT = 112`, `PIN_GAP = 8`, `PIN_LINE_COLOR = '#E24B4A'`,
  `PinPlace { x: string; left: number; tier: number }`; the `LineChart` props `pinHeight?: number`
  and `ChartPin.muted?: boolean`.

- [ ] **Step 1: Write the failing tests**

At the top of `components/charts/line-chart.test.tsx`, after the existing imports, add the same
fixed-size mock the goldens use (`v1-render.golden.test.tsx:7-15`), since Recharts draws nothing
at 0 by 0:

```tsx
import type { ReactElement } from 'react'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})
```

Add `vi` to the file's `vitest` import, `LineChart` to its `./line-chart` import, `screen` to the
`@testing-library/react` import Task 7 added, and `import { layoutPins, PIN_CARD_WIDTH } from './pins'`.
Then append:

```tsx
describe('layoutPins', () => {
  const PLOT = { x: 60, width: 732 }

  test('cards far apart share the top row, each centred on its dot', () => {
    expect(layoutPins([{ x: 'a', px: 300 }, { x: 'b', px: 700 }], PLOT)).toEqual([
      { x: 'a', left: 160, tier: 0 }, { x: 'b', left: 512, tier: 0 },
    ])
  })

  test('neighbouring days stack into rows instead of overlapping', () => {
    const r = layoutPins([{ x: 'a', px: 400 }, { x: 'b', px: 424 }, { x: 'c', px: 448 }], PLOT)
    expect(r.map((p) => p.tier)).toEqual([0, 1, 2])
  })

  test('the first and last days stay inside the plot', () => {
    const r = layoutPins([{ x: 'first', px: 60 }, { x: 'last', px: 792 }], PLOT)
    expect(r).toEqual([{ x: 'first', left: 60, tier: 0 }, { x: 'last', left: 792 - PIN_CARD_WIDTH, tier: 0 }])
  })

  test('the order they arrive in does not matter', () => {
    const a = layoutPins([{ x: 'b', px: 700 }, { x: 'a', px: 300 }], PLOT)
    expect(a.map((p) => p.x)).toEqual(['a', 'b'])
  })

  test('a plot narrower than a card puts each card at its left edge, one per row', () => {
    const r = layoutPins([{ x: 'a', px: 100 }, { x: 'b', px: 150 }], { x: 60, width: 200 })
    expect(r).toEqual([{ x: 'a', left: 60, tier: 0 }, { x: 'b', left: 60, tier: 1 }])
  })
})

describe('LineChart pins', () => {
  // Invented values. Day i of 31 sits at 60 + i / 30 * 732 in an 800 wide chart.
  const DAYS = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
  const DATA = DAYS.map((date, i) => ({ date, v: 3 + ((i * 7) % 11) }))
  const AT = [DAYS[0], DAYS[9], DAYS[30]]
  const draw = () => render(
    <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={AT.map((x) => ({ x }))}
      pins={AT.map((x) => ({ x, content: <span>{`card ${x}`}</span> }))} />,
  )
  const num = (el: Element, a: string) => Number(el.getAttribute(a))

  test('each connector ends exactly on its dot', () => {
    const { container } = draw()
    const dots = [...container.querySelectorAll('.recharts-reference-dot circle, .recharts-reference-dot-dot')]
    const lines = [...container.querySelectorAll('line[data-pin-line]')]
    expect(lines).toHaveLength(3)
    lines.forEach((l, i) => {
      expect(num(l, 'x2')).toBeCloseTo(num(dots[i], 'cx'), 1)
      expect(num(l, 'y2')).toBeCloseTo(num(dots[i], 'cy'), 1)
    })
  })

  test('cards sit above the plot, inside it, stacked only where they would overlap', () => {
    const { container } = draw()
    const cards = [...container.querySelectorAll<HTMLElement>('[data-pin-card]')]
    expect(cards.map((c) => c.dataset.pinCard)).toEqual(AT)
    expect(cards.map((c) => parseFloat(c.style.left))).toEqual([60, expect.closeTo(139.6, 1), 512])
    expect(cards.map((c) => c.style.top)).toEqual(['0px', '88px', '0px'])
  })

  test('a card shows what it was given', () => {
    draw()
    expect(screen.getByText(`card ${DAYS[9]}`)).toBeTruthy()
  })

  test("a muted pin (the team's hidden or draft card) has a faded line, and neither line nor card prints", () => {
    const { container } = render(
      <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} pins={[{ x: DAYS[9], muted: true, content: <span>m</span> }]} />,
    )
    const line = container.querySelector('line[data-pin-line]')!
    expect(line.getAttribute('class')).toContain('no-print')
    expect(line.getAttribute('stroke-opacity')).toBe('0.4')
    expect(container.querySelector('[data-pin-card]')!.className).toContain('no-print')
  })

  test('the line is the red of the approved sketch', () => {
    const { container } = draw()
    expect(container.querySelector('line[data-pin-line]')!.getAttribute('stroke')).toBe('#E24B4A')
  })

  test("the team's taller cards stack by their own height", () => {
    const { container } = render(
      <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} pinHeight={112}
        pins={AT.map((x) => ({ x, content: <span>{x}</span> }))} />,
    )
    expect([...container.querySelectorAll<HTMLElement>('[data-pin-card]')].map((c) => c.style.top)).toEqual(['0px', '120px', '0px'])
  })

  test('with no pins there is no card, no connector and no extra wrapper', () => {
    const { container } = render(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={[{ x: DAYS[9] }]} />)
    expect(container.querySelector('[data-pin-card]')).toBeNull()
    expect(container.querySelector('line[data-pin-line]')).toBeNull()
    expect(container.querySelector('.relative')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/charts/line-chart.test.tsx`
Expected: FAIL, `./pins` cannot be resolved.

- [ ] **Step 3: Write the layout**

`components/charts/pins.ts`:

```ts
/** Callout cards pinned above a chart, the way the team's deck lays them out: each card in a band
 *  above the plot, joined by a line down to its day's dot. */
export const PIN_CARD_WIDTH = 280
export const PIN_CARD_HEIGHT = 80
/** The team's cards carry a row of buttons under the picture: 64 + 8 gap + 22 + 12 padding + 2
 *  border is 108, rounded up. */
export const PIN_TEAM_CARD_HEIGHT = 112
export const PIN_GAP = 8
/** The connecting line: red, as in the approved sketch and the team's deck. */
export const PIN_LINE_COLOR = '#E24B4A'

/** Where one card goes: its left edge, and its row in the band (0 is the top row). */
export interface PinPlace { x: string; left: number; tier: number }

/** Left to right by dot, each card centred on its dot and kept inside the plot, on the first row
 *  where it overlaps no card already placed. Clamping keeps the lefts in order, so each row only
 *  needs its last card's right edge. Pure, so it is tested without a chart. */
export function layoutPins(
  dots: { x: string; px: number }[],
  plot: { x: number; width: number },
  width = PIN_CARD_WIDTH,
  gap = PIN_GAP,
): PinPlace[] {
  const minLeft = plot.x
  const maxLeft = Math.max(plot.x, plot.x + plot.width - width)
  const rowEnds: number[] = []
  return [...dots].sort((a, b) => a.px - b.px).map((d) => {
    const left = Math.min(Math.max(d.px - width / 2, minLeft), maxLeft)
    let tier = rowEnds.findIndex((end) => left >= end + gap)
    if (tier === -1) tier = rowEnds.length
    rowEnds[tier] = left + width
    return { x: d.x, left, tier }
  })
}

/** The height of the band above the plot for this many rows of cards of this height. */
export function pinBand(tiers: number, height = PIN_CARD_HEIGHT): number {
  return tiers * (height + PIN_GAP)
}
```

- [ ] **Step 4: Teach `LineChart` to draw pins**

In `components/charts/line-chart.tsx`:

1. Imports: add `usePlotArea`, `useYAxisDomain` to the `recharts` import; change the React type
   import from Task 7 to `import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'`;
   add `import { layoutPins, pinBand, PIN_CARD_HEIGHT, PIN_CARD_WIDTH, PIN_GAP, PIN_LINE_COLOR, type PinPlace } from './pins'`.
2. Add after `ChartMark` (`:22`):

```tsx
/** A callout card drawn in a band above the plot, joined by a line to the dot of day `x`. Optional
 *  everywhere: a chart given no pins renders exactly as it did before this prop existed. */
export interface ChartPin {
  /** Must equal an x value present in `data`, or the pin is skipped. */
  x: string
  content: ReactNode
  /** The team's hidden or draft card: its line is faded, and neither line nor card prints. */
  muted?: boolean
}

type PinLayout = { places: PinPlace[]; tiers: number }
```

3. Add `pins?: ChartPin[]` to `LineChartProps`, with the doc line "Callout cards pinned to their
   dots, like the deck. Absent: no band, no cards, no connectors, and the chart is unchanged.", and
   `pinHeight?: number` with "Card height; the team's cards are taller to fit their buttons.
   Defaults to PIN_CARD_HEIGHT."
4. Add above `export function LineChart`:

```tsx
/** Inside the chart, where Recharts knows the plot area and the y domain. A category point sits at
 *  plot.x + i / (n - 1) * plot.width and a value at plot.y + (1 - (v - lo) / (hi - lo)) * plot.height
 *  (proven against Recharts' own ReferenceDot, line-chart.test.tsx "each connector ends exactly on
 *  its dot"). Draws each card's connector and reports where the cards go. Pins ride the first series,
 *  as the marks do. */
function PinLayer({ pins, data, xKey, yKey, height, onLayout }: {
  pins: ChartPin[]
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  height: number
  onLayout: (layout: PinLayout) => void
}) {
  const plot = usePlotArea()
  const domain = useYAxisDomain()
  const n = data.length
  const lo = Array.isArray(domain) ? Number(domain[0]) : NaN
  const hi = Array.isArray(domain) ? Number(domain[domain.length - 1]) : NaN
  const dots = plot
    ? pins.flatMap((p) => {
        const i = data.findIndex((d) => d[xKey] === p.x)
        if (i < 0) return []
        const px = plot.x + (n > 1 ? (i / (n - 1)) * plot.width : plot.width / 2)
        const v = Number(data[i][yKey])
        const py = Number.isFinite(v) && hi > lo ? plot.y + (1 - (v - lo) / (hi - lo)) * plot.height : plot.y + plot.height
        return [{ x: p.x, px, py, muted: !!p.muted }]
      })
    : []
  const places = plot ? layoutPins(dots, plot) : []
  const tiers = places.reduce((m, p) => Math.max(m, p.tier + 1), 0)
  const key = JSON.stringify(places)
  // `key` describes places and tiers completely; onLayout is a state setter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onLayout({ places, tiers }) }, [key])
  return (
    <g>
      {dots.map((d) => {
        const at = places.find((p) => p.x === d.x)!
        return (
          <line key={d.x} data-pin-line={d.x} x1={d.px} y1={at.tier * (height + PIN_GAP) + height}
            x2={d.px} y2={d.py} stroke={PIN_LINE_COLOR} strokeWidth={1.5}
            strokeOpacity={d.muted ? 0.4 : 1} className={d.muted ? 'no-print' : undefined} />
        )
      })}
    </g>
  )
}
```

5. Replace the body of `LineChart` (`:87-152`) so the chart element is built once and wrapped only
   when there are pins. Everything inside `RechartsLineChart` stays as it is (Task 7's `Tooltip`
   included), plus the `PinLayer` line:

```tsx
export function LineChart({ data, xKey, yKeys, marks, notes, pins, pinHeight = PIN_CARD_HEIGHT, height = 300, valueFormat }: LineChartProps) {
  const yDomain = niceYDomain(data, yKeys)
  const fmt =
    valueFormat === 'currency-cents' ? (v?: number | string) => (v !== undefined ? money(Number(v)) : '') : undefined
  const [pinLayout, setPinLayout] = useState<PinLayout | null>(null)
  const pinned = !!pins && pins.length > 0 && yKeys.length > 0
  // The band above the plot grows by one row of cards per tier; 0 without pins, so the margin and
  // the height are exactly today's.
  const band = pinned ? pinBand(Math.max(1, pinLayout?.tiers ?? 1), pinHeight) : 0
  const chart = (
    <ResponsiveContainer width="100%" height={height + band}>
      <RechartsLineChart data={data} margin={{ top: 8 + band, right: 8, bottom: 0, left: 0 }}>
        {/* CartesianGrid, XAxis, YAxis, Tooltip, Legend, the Lines and the marks: unchanged */}
        {pinned && <PinLayer pins={pins!} data={data} xKey={xKey} yKey={yKeys[0].key} height={pinHeight} onLayout={setPinLayout} />}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {pinned ? (
        <div className="relative">
          {chart}
          {pinLayout?.places.map((p) => {
            const pin = pins!.find((q) => q.x === p.x)
            return pin ? (
              <div key={p.x} data-pin-card={p.x} className={pin.muted ? 'absolute no-print' : 'absolute'}
                style={{ left: p.left, top: p.tier * (pinHeight + PIN_GAP), width: PIN_CARD_WIDTH, height: pinHeight }}>
                {pin.content}
              </div>
            ) : null
          })}
        </div>
      ) : chart}
    </div>
  )
}
```

The comment line inside `RechartsLineChart` stands for the existing children, which move over
unchanged; do not write that comment into the file.

- [ ] **Step 5: Run the tests and the Renaissance goldens**

Run: `npx vitest run components/charts/line-chart.test.tsx components/report-sections/organic-social/v1-render.golden.test.tsx components/report-sections/organic-social/render-invariant.test.tsx`
Expected: all pass, and `git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'` prints nothing.

- [ ] **Step 6: Renaissance stop, then commit**

Renaissance: `LineChart` draws Renaissance's v1 graphs and its Paid Media trend, and none of them
passes `pins`. Without pins the band is 0, so the margin and height are exactly today's, there is
no wrapper, no `PinLayer` and no card; the new state never reaches the page. The goldens, including
the Paid Media shaped chart, prove it byte for byte. Run the Renaissance stop (Global
Constraints); it must pass before the commit below.

```bash
git add components/charts/pins.ts components/charts/line-chart.tsx components/charts/line-chart.test.tsx
git commit -m "feat(charts): callout cards pinned to their dots, like the deck" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 9: The cards on their dots, the team's buttons, and the forms

This is option B as approved on 2026-09-24 (the sketch: each card on the chart, joined by a line to
its dot, the date and number on the first line and the note on its own line under it). By screen:
- **Wide screen, a client:** every callout they may see is a card pinned to its dot (Task 8). No
  buttons.
- **Wide screen, the team:** the same cards with the team's buttons on each one (Hide from client
  or Unhide, Add or Edit note, Approve, Revoke, Delete draft), plus the team's hidden and draft
  cards pinned too, faded, never printed and with no dot. Team cards are taller, to fit the
  buttons.
- **Phone-width screen:** the row above the chart, as Phase 1 shows it today, with the same
  buttons on each card for the team.
- **A callout whose day has no point on the series** has no dot to join, so it goes in the row above
  the chart on any screen.
- **The Add note and Edit form** opens above the chart, never inside a card.

The pinned card and the row card are one component (`AnnotationItem`), so the Hide behaviour Phase 1
already tests (optimistic, puts itself back on failure, never printed) is the same in both places.
The test DOM has no `matchMedia` (checked 2026-09-24), so every existing Phase 1 test keeps
rendering the row and keeps passing unchanged.

**Files:**
- Create: `components/report-sections/organic-social/note-form.tsx`
- Create: `components/report-sections/organic-social/note-actions.tsx`
- Create: `components/report-sections/organic-social/use-wide-chart.ts`
- Modify: `components/report-sections/organic-social/annotation-callouts.tsx:46-54`, `:60-122`
- Modify: `components/report-sections/organic-social/trends.tsx:31-139`
- Create: `components/report-sections/organic-social/chart-notes-ui.test.tsx`

**Interfaces:**
- Consumes: the four actions (Task 4); `NOTE_MAX_CHARS`, `NOTE_MAX_POSTS` (Task 2); `dayLabel`,
  `thumbSrc`, `NoteControls`, `ChartAnnotation`, `ChartThumb`, `AnnotationControls` (Tasks 2 and
  5); `LineChart.notes` (Task 7); `LineChart.pins`, `LineChart.pinHeight`, `ChartPin`,
  `PIN_TEAM_CARD_HEIGHT` (Task 8).
- Produces: `NoteForm({ controls, fixedDay?, initial?, onClose })`;
  `NoteActions({ annotation, controls, pinned?, onEdit })`; `PinnedCallout(props)`;
  the `onEdit` prop on `AnnotationCallouts`; `useWideChart(): boolean`.

- [ ] **Step 1: Write the failing tests**

`components/report-sections/organic-social/chart-notes-ui.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
import { PIN_TEAM_CARD_HEIGHT } from '@/components/charts/pins'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import { ChannelTrendChart } from './trends'
import type { AnnotationControls, ChartAnnotation, ChartThumb, NoteControls } from '@/lib/organic-social/annotations'
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
const DRAFT = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } }
const CONTROLS: NoteControls = {
  clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', canApprove: true,
  days: [
    { day: '2026-08-10', posts: [{ id: 11, thumb: IMG(1) }, { id: 12, thumb: IMG(2) }, { id: 13, thumb: IMG(3) }] },
    { day: '2026-08-14', posts: [] },
  ],
}
const HIDES: AnnotationControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements' }
const chart = () => vi.mocked(LineChart).mock.lastCall![0]
const draw = (annotations: ChartAnnotation[], noteControls?: NoteControls, annotationControls?: AnnotationControls) =>
  render(<ChannelTrendChart title="T" series={SERIES} annotations={annotations} noteControls={noteControls} annotationControls={annotationControls} />)

beforeEach(() => vi.clearAllMocks())

describe('on a phone-width screen: the row above the chart', () => {
  test('an approved note sits on its own line under the date and number', () => {
    draw([{ ...PEAK, note: 'Influencer post went live' }])
    const label = screen.getByText('8/10 | 50 Engagements')
    const note = screen.getByText('Influencer post went live')
    expect(label).not.toBe(note)
    expect(note.closest('li')).toBe(label.closest('li'))
  })

  test('a note-only day shows the date and the note, and no number', () => {
    draw([QUIET({ note: 'Event' })])
    expect(screen.getByText('8/14')).toBeTruthy()
    expect(screen.getByText('Event')).toBeTruthy()
    expect(screen.queryByText(/-3/)).toBeNull()
  })

  test('picked posts replace the top post on the card', () => {
    const { container } = draw([{ ...PEAK, note: 'x', thumbs: [IMG(2), IMG(3)] }])
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      'https://cdn.example.com/t2.jpg', 'https://cdn.example.com/t3.jpg',
    ])
  })

  test('a dot marks top days and approved note days; a draft-only or hidden day gets none', () => {
    draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }, { x: '2026-08-14' }])
  })

  test('the hover box gets approved notes on shown days only, and nothing when there are none', () => {
    const first = draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().notes).toEqual({ '2026-08-14': 'Event' })
    first.unmount()
    draw([PEAK])
    expect(chart().notes).toBeUndefined()
  })

  test('a draft-only card is faded and never reaches a PDF; an approved note-only card does', () => {
    draw([QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT })], CONTROLS)
    expect(screen.getByText('Event').closest('li')?.className).not.toContain('no-print')
    const draftCard = screen.getByText('8/20').closest('li')?.className ?? ''
    expect(draftCard).toContain('no-print')
    expect(draftCard).toContain('opacity-40')
    expect(screen.getByText('Draft: Soon').className).toContain('no-print')
  })

  test('a client sees no buttons and no draft text', () => {
    draw([{ ...PEAK, note: 'Event' }])
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide from client' })).toBeNull()
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

  test('a note cannot be saved without text, even with posts picked', () => {
    draw([PEAK], CONTROLS)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-08-10' } })
    fireEvent.click(screen.getByLabelText('Post 1'))
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(true)
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

  test('Edit opens the form above the chart, fixed to that day and filled with the draft', () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } } }], CONTROLS)
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    expect((screen.getByLabelText('Note text') as HTMLInputElement).value).toBe('New')
    const day = screen.getByLabelText('Day') as HTMLSelectElement
    expect(day.value).toBe('2026-08-10')
    expect(day.disabled).toBe(true)
    expect(screen.getByRole('group', { name: 'Note' }).closest('li')).toBeNull()
  })

  test('an approver gets Approve on a draft and Revoke on an approved note; an editor gets neither', async () => {
    const ed = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } }
    const approver = draw([{ ...PEAK, note: 'Old', noteEditor: ed }], CONTROLS)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'did', { text: 'New', postIds: [] }))
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
    approver.unmount()

    draw([{ ...PEAK, note: 'Old', noteEditor: ed }], { ...CONTROLS, canApprove: false })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })
})

describe('on a wide screen: option B, cards pinned to their dots', () => {
  // The test DOM has no matchMedia, so a chart renders the row by default; these stub a wide screen.
  const real = window.matchMedia
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  })
  afterEach(() => { window.matchMedia = real })
  const cardOf = (i: number) => render(<>{chart().pins![i].content}</>).container

  test('a client gets every callout they may see pinned to its dot, no row and no buttons', () => {
    draw([PEAK, QUIET({ note: 'Event' })])
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', false], ['2026-08-14', false]])
    expect(chart().pinHeight).toBeUndefined()
    expect(screen.queryByRole('list', { name: 'Annotations' })).toBeNull()
    expect(cardOf(0).querySelector('button')).toBeNull()
  })

  test('a pinned card shows the date and number, and the note on its own line', () => {
    draw([{ ...PEAK, note: 'JOL Fortune Cookie' }])
    const card = cardOf(0)
    expect(within(card).getByText('8/10 | 50 Engagements')).not.toBe(within(card).getByText('JOL Fortune Cookie'))
  })

  test("the team's buttons are on each pinned card, and team cards are taller to fit them", () => {
    draw([PEAK], CONTROLS, HIDES)
    const card = cardOf(0)
    expect(within(card).getByRole('button', { name: 'Hide from client' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Add note' })).toBeTruthy()
    expect(chart().pinHeight).toBe(PIN_TEAM_CARD_HEIGHT)
  })

  test('the team also gets its hidden and draft cards pinned, faded and never printed, with no dot', () => {
    draw([PEAK, QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', label: '8/22', note: 'Hidden one', hidden: true })], CONTROLS, HIDES)
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', false], ['2026-08-20', true], ['2026-08-22', true]])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }])
  })

  test('Hide on a pinned card fades it, takes its dot at once, and makes one call', async () => {
    draw([PEAK], CONTROLS, HIDES)
    fireEvent.click(within(cardOf(0)).getByRole('button', { name: 'Hide from client' }))
    expect(chart().marks).toEqual([])
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', true]])
    await waitFor(() => expect(setAnnotationHiddenAction).toHaveBeenCalledWith({ ...HIDES, day: '2026-08-10', hidden: true }))
  })

  test('a callout whose day has no point goes in the row above the chart, since it has no dot', () => {
    draw([PEAK, QUIET({ date: '2026-08-31', label: '8/31', note: 'Late' })])
    expect(chart().pins?.map((p) => p.x)).toEqual(['2026-08-10'])
    expect(screen.getByText('Late')).toBeTruthy()
  })

  test('the Annotations button takes the pinned cards away too', () => {
    draw([PEAK])
    fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
    expect(chart().pins).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/report-sections/organic-social/chart-notes-ui.test.tsx`
Expected: FAIL: no note line, no buttons, no `pins`.

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

- [ ] **Step 4: Write the per-card note buttons**

`components/report-sections/organic-social/note-actions.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction } from '@/app/actions/chart-notes'
import type { ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'

const BUTTON = 'no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** A card's note buttons, for someone who can edit: add or edit the note, delete a draft, and for an
 *  approver, approve a draft or revoke an approved note. Each action re-checks the session. The form
 *  itself opens above the chart (`onEdit`), never inside the card. On a pinned card the visible
 *  words are shorter to fit; the accessible names stay the same everywhere. */
export function NoteActions({ annotation, controls, pinned, onEdit }: {
  annotation: ChartAnnotation
  controls: NoteControls
  pinned?: boolean
  onEdit: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ed = annotation.noteEditor
  const say = (full: string, short: string) => (pinned ? short : full)

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
      <button type="button" className={BUTTON} disabled={pending} aria-label={ed ? 'Edit note' : 'Add note'}
        onClick={() => onEdit(annotation.date, initial)}>
        {ed ? say('Edit note', 'Edit') : say('Add note', 'Note')}
      </button>
      {ed?.draft && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Approve"
          onClick={() => run(() => approveChartNoteAction(controls.clientSlug, ed.draft!.id, { text: ed.draft!.text, postIds: ed.draft!.postIds }))}>Approve</button>
      )}
      {ed?.approvedId && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Revoke"
          onClick={() => run(() => revokeChartNoteAction(controls.clientSlug, ed.approvedId!))}>Revoke</button>
      )}
      {ed?.draft && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Delete draft"
          onClick={() => run(() => deleteChartNoteDraftAction(controls.clientSlug, ed.draft!.id))}>
          {say('Delete draft', 'Delete')}
        </button>
      )}
      {error && <span role="alert" className="no-print text-[11px] text-red-400">{error}</span>}
    </>
  )
}
```

- [ ] **Step 5: One card for the row and the pin**

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

3. `AnnotationItem` (`:60-104`): add to its props `noteControls?: NoteControls`,
   `onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void`,
   `as?: 'li' | 'div'` and `pinned?: boolean`. Keep its hide logic (`:66-82`) exactly as it is, and
   replace the returned `<li>` (`:87-102`) with:

```tsx
  // A day shown only for its note, with no approved note yet, has nothing for a client: like a
  // hidden card it is faded for the team and must not reach a PDF exported from the team's view.
  const draftOnly = !!annotation.noteOnly && !annotation.note
  const thumbs = annotation.thumbs ?? (annotation.thumb ? [annotation.thumb] : [])
  const draft = annotation.noteEditor?.draft
  const Tag = as ?? 'li'

  // Export PDF is window.print() of the page in front of you, so anything staff-only has to
  // carry `no-print` or it lands in a PDF exported from a client's view: a hidden card is shown
  // to staff only so they can unhide it, and the toggle is a control rather than content.
  return (
    <Tag className={cn(
      'flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2',
      pinned && 'h-full content-start overflow-hidden bg-bg-surface p-1.5',
      hidden && 'opacity-40 no-print',
      !hidden && draftOnly && 'opacity-40 no-print',
    )}>
      {thumbs.map((t, i) => <Thumb key={i} thumb={t} alt={annotation.label} />)}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold text-white">{annotation.label}</span>
        {annotation.note && <span className={cn('text-xs text-white', pinned && 'line-clamp-2')}>{annotation.note}</span>}
        {draft && <span className="no-print text-[11px] text-text-muted">Draft: {draft.text}</span>}
        {hidden && <span className="text-[11px] text-text-muted">Hidden from client</span>}
      </span>
      {controls && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={hidden ? 'Unhide' : 'Hide from client'}
          className="no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
        >
          {hidden ? 'Unhide' : pinned ? 'Hide' : 'Hide from client'}
        </button>
      )}
      {noteControls && onEdit && <NoteActions annotation={annotation} controls={noteControls} pinned={pinned} onEdit={onEdit} />}
    </Tag>
  )
```

   The label keeps its own element, so every Phase 1 test that finds a card by its label text
   (`annotation-callouts.test.tsx`) still finds it; the note is a second line under it.

4. Replace `AnnotationCallouts` (`:106-122`) with:

```tsx
/** The row of callouts: above the chart on a phone-width screen, and on any screen for a callout
 *  whose day has no point on the series (trends.tsx). On a wide screen every other callout is a
 *  card pinned to its dot (PinnedCallout). */
export function AnnotationCallouts({ items, controls, noteControls, onToggle, onEdit }: {
  items: ChartAnnotation[]
  controls?: AnnotationControls
  noteControls?: NoteControls
  onToggle?: (day: string, hidden: boolean) => void
  onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  if (items.length === 0) return null
  // Hiding every card is not enough: the list is a non-last child of the chart's section, so
  // Tailwind still gives it a margin and the printed page keeps a gap where the row was. A
  // draft-only day prints nothing either.
  const nothingPrintable = items.every((a) => a.hidden || (a.noteOnly && !a.note))
  return (
    <ul aria-label="Annotations" className={cn('flex flex-wrap gap-3', nothingPrintable && 'no-print')}>
      {items.map((a) => (
        <AnnotationItem key={a.date} annotation={a} controls={controls} noteControls={noteControls} onToggle={onToggle} onEdit={onEdit} />
      ))}
    </ul>
  )
}

/** One callout as a card pinned to its dot, option B (trends.tsx, LineChart pins): the same card as
 *  the row, so hiding, notes and print rules are identical, sized to the pin with the note cut at
 *  two lines (the full note is in the hover box). */
export function PinnedCallout(props: {
  annotation: ChartAnnotation
  controls?: AnnotationControls
  noteControls?: NoteControls
  onToggle?: (day: string, hidden: boolean) => void
  onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  return <AnnotationItem {...props} as="div" pinned />
}
```

- [ ] **Step 6: The chart: where each card goes, dots, hover notes and the form**

Write `components/report-sections/organic-social/use-wide-chart.ts`:

```ts
import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 640px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const m = window.matchMedia(WIDE)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

/** True on a screen wide enough to pin callouts to their dots, option B (Tailwind's `sm`, 640px).
 *  The server renders wide, which is what a desktop gets; a phone switches to the row once it
 *  hydrates. A browser without matchMedia, such as the test DOM, gets the row. */
export function useWideChart(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches,
    () => true,
  )
}
```

In `trends.tsx`:

1. Imports: `import { NoteForm } from './note-form'`, `import { useWideChart } from './use-wide-chart'`,
   `import { PIN_TEAM_CARD_HEIGHT } from '@/components/charts/pins'`, and `PinnedCallout` beside
   `AnnotationCallouts` in the `./annotation-callouts` import; add `NoteControls` to the type import
   at `:9`.
2. In `ChannelTrendChart`, add `noteControls` to the destructured props (`:32`), and with the other
   hooks after `showAnnotations` (`:43`):

```tsx
  // The Add note or Edit form, open above the chart: {} for a new note, or the day and its text.
  const [form, setForm] = useState<{ day?: string; initial?: { text: string; postIds: number[] } } | null>(null)
  const wide = useWideChart()
```

3. Replace `:74` (`const visible = ...`) with:

```tsx
  const visible = hasAnnotations && showAnnotations && !activeEmpty ? current : undefined
  // A dot marks what a client sees: a top day, or a day with an approved note. A draft-only day and a
  // hidden day get none, so the team's chart matches the client's.
  const shown = visible?.filter((a) => !a.hidden && (!a.noteOnly || !!a.note))
  const noted = shown?.filter((a) => a.note)
  const notes = noted && noted.length > 0 ? Object.fromEntries(noted.map((a) => [a.date, a.note!])) : undefined
  // Option B: on a wide screen every callout this viewer may see is pinned to its dot. A client's
  // list holds only what they may see (the server removes the rest); the team's also holds its
  // hidden and draft cards, pinned faded and never printed. A callout whose day has no point has no
  // dot to join, so it goes in the row above the chart, as every callout does on a phone.
  const onSeries = new Set(series.points.map((p) => String(p.date)))
  const pinned = wide ? visible?.filter((a) => onSeries.has(a.date)) : undefined
  const inRow = wide ? visible?.filter((a) => !onSeries.has(a.date)) : visible
  const team = !!annotationControls || !!noteControls
  const onEdit = (day: string, initial?: { text: string; postIds: number[] }) => setForm({ day, initial })
```

4. After the Annotations button block (after `:124`, still inside the button row `div`), add:

```tsx
            {noteControls && noteControls.days.length > 0 && (
              <button
                type="button"
                onClick={() => setForm((f) => (f ? null : {}))}
                aria-expanded={!!form}
                className="no-print flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted transition-colors hover:text-white"
              >
                Add note
              </button>
            )}
```

5. Replace `:126` and the `LineChart` at `:130-135` with:

```tsx
          {form && noteControls && (
            <NoteForm key={form.day ?? 'new'} controls={noteControls} fixedDay={form.day} initial={form.initial} onClose={() => setForm(null)} />
          )}
          {inRow && inRow.length > 0 && (
            <AnnotationCallouts items={inRow} controls={annotationControls} noteControls={noteControls} onToggle={setHidden} onEdit={onEdit} />
          )}
```

```tsx
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={shown?.map((a) => ({ x: a.date }))}
              notes={notes}
              pins={pinned && pinned.length > 0
                ? pinned.map((a) => ({
                    x: a.date,
                    muted: !!a.hidden || (!!a.noteOnly && !a.note),
                    content: <PinnedCallout annotation={a} controls={annotationControls} noteControls={noteControls} onToggle={setHidden} onEdit={onEdit} />,
                  }))
                : undefined}
              pinHeight={pinned && pinned.length > 0 && team ? PIN_TEAM_CARD_HEIGHT : undefined}
            />
```

With no annotations (every v1 chart, Renaissance included), `visible`, `shown`, `notes`, `pinned`
and `inRow` are all undefined, so `LineChart` gets `marks`, `notes`, `pins` and `pinHeight` all
undefined, which Tasks 7 and 8 proved renders today's chart, and no row renders on any screen.

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run components/`
Expected: all pass, including `annotation-callouts.test.tsx`, `trends.identity.test.tsx` and every
golden, unchanged. `git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'` prints nothing.

- [ ] **Step 8: Renaissance stop, then commit**

Renaissance: `trends.tsx` and `annotation-callouts.tsx` render Renaissance's v1 graphs. With no annotations, which is every v1 chart, nothing new renders on any screen: no Add note, no form, no draft line, no pinned card, no row, and `marks`, `notes`, `pins` and `pinHeight` all undefined. The screen-width hook only decides where annotations go, and v1 has none. The goldens prove it. Run the Renaissance stop (Global Constraints); it must pass before the commit below.

```bash
git add components/report-sections/organic-social/
git status --porcelain
git commit -m "feat(organic-social): callout cards on their dots (option B), with the team's buttons and notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 10: Full verification, my own review, and the PR

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
git diff --name-only "$(git merge-base HEAD origin/dev)" -- '*.snap'
BASE="$(git merge-base HEAD origin/dev)"
git diff --name-only "$BASE" | xargs grep -nP "\x{2014}|\x{2013}" || echo "no dashes"
git diff "$BASE" --stat
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
| `PinLayer`: use `i / n` instead of `i / (n - 1)` | `line-chart.test.tsx` "each connector ends exactly on its dot" |
| `layoutPins`: drop the clamp to `maxLeft` | `line-chart.test.tsx` "the first and last days stay inside the plot" |
| `trends.tsx`: pin every shown callout, even one with no point | `chart-notes-ui.test.tsx` "a callout whose day has no point goes in the row" |
| `validateNoteInput`: drop the future-day check | `validate.test.ts` "tomorrow is refused" |
| `approveChartNoteAction`: treat a false `approveNote` as success | `chart-notes.test.ts` (actions) "a note edited after the approver opened the page is not approved" |

- [ ] **Step 4: Prove the PR merges clean with every open PR, in any order**

```bash
git fetch -q origin
git merge-tree --write-tree HEAD origin/dev >/dev/null && echo "clean with dev" || echo "CONFLICT with dev"
for b in $(gh pr list --state open --json headRefName -q '.[].headRefName'); do
  git fetch -q origin "$b"
  git merge-tree --write-tree HEAD "origin/$b" >/dev/null && echo "clean with $b" || echo "CONFLICT with $b"
done
```

`git merge-tree --write-tree` takes exactly two commits, finds their merge base itself, and exits
0 when they merge clean (git 2.54 here). Expected: "clean with" `dev` and every open branch.

- [ ] **Step 5: My own adversarial review**

Read the whole diff against spec P1 to P13 with fresh eyes, one section at a time, and write the
comprehension summary for the PR: where a note comes from, who sees what, and why Renaissance
cannot change. Anything found goes back through Tasks 2 to 9 before the PR is marked ready. If Paul
wants the Stage 1 review record from the project CLAUDE.md, it is this review written up as
`docs/qa/chart-notes-code-review.md` in its own docs PR off `dev`, changing no code.

- [ ] **Step 6: The PR**

Mark the draft ready, replace its body with: what it does and why; the before and after test
counts with the raw tail of `npm test`; the Renaissance proof (no snapshot changed, no Commentary
file changed, v1 never reads notes, every action refuses a client not on locked months, the
`LineChart` props `notes`, `pins` and `pinHeight` are off by default); the edge-case table from the Task 4 commit; the
migration note (staging on my written go, production only after Jasmine approves staging). Ask Paul
to review. Nothing merges to `dev` until his review is resolved and CI is green.

```bash
gh pr ready
~/code/push-check.sh
```

---

### Task 11: Staging (only on my written go)

Nothing here starts without my written go, and each numbered step that writes needs it.

Steps 1 to 3 run once Paul's review is resolved and before the PR merges to `dev`, so the staging
record lands in `MIGRATIONS-PENDING.md` on this branch. The table is additive, so it sitting on
staging before the code arrives changes nothing there.

- [ ] **Step 1: Host guard and preflight, read only**

Write `~/.claude/organic-social-work/probes/staging-0025-preflight.ts` (private, never
committed), modelled on `probes/staging-f3-delete-2026-09-24.ts`: take the address the migration
script will use, `DATABASE_URL_UNPOOLED` if set, else `DATABASE_URL` (`scripts/migrate-http.ts:19`),
and refuse any host that is not the staging database; list the migration tags whose hash is missing from
`drizzle.__drizzle_migrations` (must be exactly `0025_chart_notes`), print Renaissance's `clients`
row md5 and the keys of its `dash_social_config` (must be `brandId` only, so the locked-months
stop refuses it), and write nothing.

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
has the 0025 row; the table list differs from before by `chart_notes` only; `chart_notes` has no
row for Renaissance; Renaissance's md5 and config keys are unchanged. Record the output in
`MIGRATIONS-PENDING.md` ("staging applied <date>") on this branch, commit and push.

- [ ] **Step 4: Promote**

After the PR is merged to `dev` (Paul's review resolved, CI green, my go), open `dev → staging`
and merge it with `gh pr merge --merge --match-head-commit <sha>` once its checks pass.

- [ ] **Step 5: Verify on staging, as the team**

Coordinate with Jasmine's QA first so a test note never surprises her. Write a private, read-only
probe, `~/.claude/organic-social-work/probes/staging-chart-notes-readback.ts <slug> <CHANNEL>
<chart> <yyyy-mm-dd>`, host-guarded like Step 1. It prints that day's `chart_notes` rows (status,
whether deleted, text length, number of posts, who approved), then three Renaissance lines: its
`chart_notes` row count (must be 0), its `clients` row md5 (must match Step 1), and its config keys
(must be `brandId` only). Run it after every action below, so the database is checked, not only the
screen.

On one platform tab of one client's August (a locked month, which also proves notes do not lock):
- Add a draft on a day that is not a peak, with one picked post. The screen shows `8/14` with
  `Draft: ...`, no dot, and no hover line; Export PDF leaves it out. Read back: one row, `draft`,
  not deleted, 1 post. Reload the page: it is still there.
- Prerequisite for approving: `CHART_NOTES_APPROVERS` set in Vercel's staging environment with
  the notes approver(s) I name (its own list; Commentary's `COMMENTARY_APPROVERS` grants nothing
  here), and the same value mirrored into the local `.env.staging` in the same step, my
  credentials rule.
- If I am on `CHART_NOTES_APPROVERS` in staging's environment, approve it: the dot and the hover
  line appear. Read back: the row is `approved`, with my email as approver. Edit it: the card keeps
  the approved text and adds `Draft: ...`. Read back: the approved row plus one new draft row.
  Revoke the approved one after deleting the draft: the dot and hover line go. Read back: no
  approved row left.
- Delete the remaining draft. Read back: every row for that day is marked deleted, none approved.
- **The layout**, on the same tab. Desktop width: each callout is a card pinned to its dot with a
  red line down to it, the note on its own line, neighbouring days stack, the first and last days
  stay inside the chart. The team's buttons are on each card, and a hidden or draft card shows
  faded with no dot. Hide from a pinned card: it fades and its dot goes at once. Export PDF from
  the team's view: the shown cards print; the buttons, hidden cards and drafts do not. Phone width
  (the browser pane's mobile preset, reset to desktop after): the row above the chart, as Phase 1
  shows it today. Renaissance's tabs: unchanged at both widths.
- Update the line in Jasmine's staging guide that says the callouts sit in a row above the graph:
  they now sit on their dots.
- Two tabs saving on the same day: the second edits the first's open draft (last save wins). That
  is the designed behaviour, and it cannot produce the index conflict, because the second save
  finds the draft first.
- **The real error shape for `isOpenDraftConflict`** (unverified until now): a private probe,
  `~/.claude/organic-social-work/probes/staging-0025-conflict-shape.ts`, host-guarded like Step 1,
  runs one `db.insert(chartNotes).values([draft, sameDraft])` for a made-up day far in the past
  (2000-01-01), through the repo's own `db`: the same insert path `insertDraft` uses. One statement
  with two rows for the same day breaks the open-draft index, so it fails as a whole and stores
  nothing. It prints `isOpenDraftConflict(e)` and the error's `code` and `constraint` fields,
  nothing else, then reads back that no row for that day exists. Expected: `true`. If it prints
  `false`, fix `isOpenDraftConflict` to the shape it shows, with a test, before going on.
- Test notes deleted here stay in the table as deleted drafts, never shown, as Commentary keeps its
  deleted entries.
- **Unverified on staging:** what a client role sees, because staging has no client logins. The
  redaction is proven by the Task 5 and Task 9 tests only; say so in the staging report.

- [ ] **Step 6: Renaissance**

```bash
REPO=$PWD ~/.claude/renaissance-baseline/check-drift.sh
```

Judge the `REN.*` lines only (the production leg is blocked by the classifier, which is fine).
Then click through Renaissance's Organic Social tabs on staging: no Add note button, no dots, no
change. The read-back probe's three Renaissance lines must still read 0 rows, the same md5, and
`brandId` only.

- [ ] **Step 7: Stop**

Report to me. Nothing goes to production: that waits for Jasmine's approval on staging and my
written go, and `0025` goes to production first, the same way as Steps 1 to 3.

---

## Phase 2b: hover cards and the post picker (approved by me 2026-09-24, after the first local look)

**Why.** My first look on our own local app (2026-09-24, dev database, a test client copied from staging): the
pinned cards crowd the graph quickly, and the Add note day list is cluttered with days that had no
post. I approved a mockup (chat, 2026-09-24): dots only; hover or tap a dot to see its card; the Add
note panel shows the month's posts as pictures with their dates, only days with posts; editing stays
on our side, never the client's. Print: dots only (the Export PDF button is client-portal only,
`app/portal/[clientSlug]/reports/page.tsx:277`, untouched since March; its use is unverified).

**Design (binding; the approved mockup).**
- D1. Every screen size: the graph shows only dots. A dot marks every callout a client may see (a top
  day, or a day with an approved note, not hidden), as today (`trends.tsx` `shown`). No pinned cards,
  no band, no row, except a callout whose day has no point on the series, which stays in the row above
  the chart (it has no dot to hover).
- D2. Hover (mouse), focus (keyboard, Tab then Enter) or tap (touch) a dot and that day's card appears,
  joined to the dot by a short red line (`PIN_LINE_COLOR`). One card at a time. Centred on the dot and
  kept inside the plot horizontally; ABOVE the dot, as in the approved mockup, rising past the top of
  the chart box when needed (it is a popover); below only when the screen has no room above it. Room is
  measured from the top of the scrolling area the chart sits in, with the card's height measured once
  it is drawn (a layout effect), never guessed. The open card sits above the sticky report header
  (z-40 over its z-30). Amended 2026-09-24 after my local look: the first rule ("above when it fits in
  the chart") sent nearly every card below, because callouts are the top days and sit near the top of
  the chart, and a card below covers the graph.
- D3. A faded card (the team's hidden or draft-only day) stays solid over the graph: only its contents
  dim (amended 2026-09-24: fading the whole card made it see-through, and the line showed through it).
  Amended again 2026-09-24 in my local QA: a draft-only card's contents dim to 80% (at 40% the draft
  was hard to read); a hidden card keeps 40%, and a hidden day with a draft keeps 40%.
- D3a. The card is today's card (`AnnotationItem` as a div): picture(s), date and number on the first
  line, the note on its own line (two-line clamp; the full note is in the hover box). The team's
  buttons on their own row (the 9953b58 fix). 280px wide, or the chart's width when that is narrower
  (a phone's plot is about 235px), natural height: one card at a time, so no
  fixed height and nothing clipped. `PIN_TEAM_CARD_HEIGHT` and the band go.
- D4. A mouse hover opens a card, and it stays open while the pointer is on the dot or the card (a
  150ms grace to cross from dot to card); it closes when the mouse leaves both. A tap or a click only
  ever opens (never toggles: a touchscreen fires a simulated mouse-enter before the click, so a toggle
  would open and shut the card in one tap). A tap or click outside the card and dots, Escape, or
  opening another dot closes it. Opening and closing use pointer events, so a real mouse is told apart
  from touch by `pointerType`. While a card is open the Recharts hover box is hidden (`Tooltip active={false}`); otherwise it
  behaves as today (date, value, and the approved note, Task 7).
- D5. Team only: a hidden day and a draft-only day get a faint dot (hollow, dashed, `no-print`), opened
  the same way, so the team can Unhide or Approve. Clients never receive those days (server, unchanged).
- D6. Print: dots print as today; a card never prints (`no-print`).
- D7. The Add note panel (team only, above the chart): the month's posts as 56px pictures with the date
  under each, only days with at least one post, oldest first. Click a picture to pick it (accent ring,
  `aria-pressed`); up to 2, all from one day: picking a post from another day clears the earlier picks
  and moves to that day. A text box with a live `n/80` counter. Save draft needs a pick and text.
  The Add note button shows only when the month has a post. (Renamed "Add annotation" in my local QA,
  2026-09-24, commit f00ca5b: it sits beside the Annotations toggle; a card's own button keeps "Note".)
- D8. Edit (or Note) on a card opens the same panel fixed to that card's day: that day's posts with the
  current picks selected, or the line "No posts went live this day"; the text prefilled. Save needs text.
- D9. Accurate data: a card's number is the value its dot sits on (same series), pinned by a test.
- D10. Unchanged: approvals and drafts, the four actions, validation (the server still accepts a note
  on any past day, which a card's own Edit needs), hides win, posts only from that day, Renaissance.

**UX standards (binding, my review of the mockup against good hover-card practice, 2026-09-24).**
- D11. Intent: a mouse opens a card only after resting 100ms on a dot, so sweeping across the graph
  never flashes cards; focus, click and tap open at once.
- D12. Keyboard and screen readers: each dot is a focusable button named by its callout
  ("8/12 | +28 Followers"), with `aria-expanded`. Enter or Space opens it and moves focus into the card
  (`role="group"`, the same name), so the team's buttons are next in Tab order; Escape closes it and
  returns focus to the dot. A visible focus ring on the dot.
- D13. Affordance: a pointer cursor on every dot, and a 28px hit area around the 10px dot.
- D14. The picker is one row that scrolls sideways when the month has more posts than fit. Each picture
  is a button (`aria-pressed`, named "Post from 8/12"). A one-line hint, "Pick a post, then write what
  happened"; once two are picked, the day's other posts are unavailable and the hint reads "Up to 2
  posts".
- D15. The `n/80` counter is always visible and the box stops at 80, as today.
- D16. No motion, and no jumps: the card's side (above or below) is settled before it is first painted
  (a layout effect), so it never moves after it appears.

**Files.** `components/charts/line-chart.tsx`, `components/charts/pins.ts`,
`components/charts/line-chart.test.tsx`, `components/report-sections/organic-social/trends.tsx`,
`annotation-callouts.tsx`, `note-form.tsx`, `chart-notes-ui.test.tsx`, `annotation-callouts.test.tsx`
(`:117`, `:134`, `:142` rewritten on purpose: the row gave way to dots), `trends.identity.test.tsx`
(`rows()` at `:53` reads the same hidden state from the chart's callouts; every expected string kept),
`parts/chart-notes.ts` and its test (the days list), `parts/annotations-wiring.test.tsx` (D9). Delete
`use-wide-chart.ts` (no screen split any more).

### Task 12: LineChart hover callouts (replaces the pinned band)

Interfaces. `LineChart` drops `pins` and `pinHeight` and gains `callouts?: ChartCallout[]`, with
`ChartCallout { x: string; label: string; content: ReactNode; muted?: boolean }`. A `CalloutLayer`
inside the chart places a transparent hit circle (r 14) on each callout's day (the Task 8 formula,
proven to the pixel), `tabIndex={0}`, `role="button"`, `aria-label={label}`; a muted callout also draws
its faint dot. The open card renders in the relative wrapper at the computed position, `no-print`,
with the red stub from the dot to the card. `Tooltip active` is `false` only while a card is open, and
the prop is absent when `callouts` is absent. `pins.ts` keeps `PIN_CARD_WIDTH` and `PIN_LINE_COLOR`;
`layoutPins`, `pinBand`, the heights and `PinPlace` go with their tests.
Tests first (RED): no callouts renders byte-identical to dev's `line-chart.tsx` (the Task 7 harness,
5 shapes, plus the goldens); hovering a callout opens its card centred on the dot, clamped at the
edges; above when it fits, below when it does not (a measured height); leaving closes after the
grace, not before; moving into the card keeps it open; Escape closes; focus opens; a touch tap opens
and a second tap on the same dot keeps it open; a tap outside closes; one open at a time; a muted callout has a
faint `no-print` dot and opens; the Tooltip is hidden while open; the stub is red and ends on the dot;
the card carries `no-print`. Renaissance: its charts pass no `callouts`, so no hit layer, no card, no
Tooltip prop; the identity harness and goldens prove it byte for byte.

### Task 13: the chart uses hover callouts

`ChannelTrendChart`: every visible callout on the series becomes a `ChartCallout` (content: the card;
`muted` for the team's hidden and draft-only days); `marks` stay the shown days (dots as today); the
row keeps only no-point days; `useWideChart` and the pinned split go. `AnnotationItem`'s pinned styling
becomes the floating card (280px, `bg-bg-surface`, a border, no fixed height, no overflow clip).
Tests first: the three `annotation-callouts.test.tsx` chart tests and `chart-notes-ui.test.tsx`
rewritten to the dots-and-hover behaviour (each asserting the same property: the button hides the
callouts and their dots; a channel off takes them away; a client gets no buttons, no drafts, no faint
dots; a hide fades the card and takes the dot at once; Approve sends what the card shows); the identity
test's `rows()` reads the callouts. Renaissance: v1 has no annotations, so no callouts (existing guard
tests at `annotation-callouts.test.tsx:103-115` unchanged and passing).

### Task 14: the Add note panel by picture, days with posts only

Server: `withNotes` sends `controls.days` for days with at least one post only (the window, never after
today). Two `chart-notes.test.ts` tests change on purpose: the controls test expects only the days with
posts (not 31), and "in the live month the form offers no day after today" is rebuilt with posts on
today AND tomorrow, asserting only today is offered (with no posts it would pass on an empty list and
prove nothing). Client: `NoteForm` per D7 and D8. Tests first: only days with posts appear, oldest first, each
with its date; two picks from one day, a third blocked; a pick from another day moves the day and
clears the rest; the counter; Save needs a pick and text (new) or text (edit); a card's day with no
post shows "No posts went live this day"; the saved payload; a client never receives the panel.
Renaissance: never reads notes (unchanged).

### Task 15: verification

Full suite, tsc, check:rsc, lint on the touched files, the Renaissance stop at every task; the Chromium
harness (the repo's CSS) for the floating card at every content size (nothing clipped); the mutation
checks for each new behaviour; then I look on our own local app before anything else, then PR
#273 and Paul's review, then staging (my standing rule: test locally first).

## Phase 2c: my local QA findings, 2026-09-24 night (plan, then adversarial review, then build)

Reported by me after clicking through all three clients on dev. Every finding below was reproduced
before planning; nothing here is from memory.

**Findings (evidence).**
- F-C, "you have to click above the circle": on every Follower Growth Graph whose axis Recharts widens,
  the hit area sits above the dot. Measured live on one October client's Instagram tab: hit centre 17px above the
  dot, dot centre outside the 28px hit area, `elementFromPoint` at the dot = Recharts' dot, not our
  button; the Engagement Graph on the same page is aligned (0px). Cause: `CalloutLayer` places spots
  with `useYAxisDomain()` (`components/charts/line-chart.tsx:144-154`), which returns the domain we
  asked for (`niceYDomain`, e.g. -1.5..3.5); Recharts then widens the scale to whole ticks (axis -2, 0,
  2, 4) and draws `ReferenceDot` marks on the widened scale. Engagement's domain (0..45) needs no
  widening, so it agrees. The faint dots, the red line and the card use the same wrong y.
  My earlier "within a pixel" dismissal of two small follower cards on that tab was wrong: this was the signal.
- F-B, "I'm not seeing the annotation I added": notes are read uncached on every render
  (`lib/organic-social/chart-notes/select.ts:10-15`), so a save does show. It is not findable: a draft
  is a faint dashed dot, and on the follower graph hovering the dot opens nothing (F-C) while
  Recharts' hover box shows (my screenshot: the box with the note text, no card).
- F-A, "the whole screen refreshes, hard to tell what happened": a real save on dev, sampled every
  200ms: at 400ms the panel closes (`note-form.tsx:62`) and the chart jumps up by the panel's height;
  at 1600ms the new faint dot appears (`router.refresh()`, `:63`). No skeleton, no scroll change, no
  remount (the Suspense key is stable, `app/dashboard/[clientSlug]/reports/page.tsx:273`). Nothing
  says what happened.
- F-D, "two on the same day didn't take": one open draft per chart per day
  (`chart_notes_one_open_draft`); the second save edited the first draft in place
  (`app/actions/chart-notes.ts:53-57`). The dev row for that day (8/7): one row, created 03:34:39,
  updated/approved 03:35:28, body = my second text. The first text was overwritten, silently.

**Design (binding).**
- D17 (F-C). A callout's dot position comes from Recharts' own scale, the exact code that draws the
  marks: `CalloutLayer` renders one `ReferenceDot` per callout (public API) whose `shape` receives
  `cx`/`cy` (`node_modules/recharts/lib/cartesian/ReferenceDot.js:32-80`) and reports them; the hit
  areas, faint dots, red line and card all use the reported position. `ifOverflow` stays 'discard'
  (the default), so these dots never change the axis. A callout on a day with no numeric value keeps
  today's behaviour: it sits at the bottom of the plot, still reachable. Charts with no callouts render
  exactly as today (CalloutLayer is not rendered).
- D18 (F-A, F-B). Saving (Add or Edit) closes the panel and shows one status line in its place, above
  the chart, team only, `no-print`, `role="status"`: new note "Saved a draft for 8/24. It shows as a
  faint dot until it's approved."; a day that already had a note "Updated the note for 8/7. It shows as
  a draft until it's approved." When the viewer can approve, it adds "Hover its dot to approve it."
  It clears after 8 seconds, or when the panel is opened again.
- D19 (F-D). One note per chart per day stays (the schema, Commentary's lifecycle). The Add panel
  makes it visible: picking a post from a day that already has a note (a draft or an approved note)
  shows "8/7 already has a note. Saving updates it." and fills the text box with that note's text
  (its draft if any, else the approved text) if the box is empty; typed text is never overwritten.
  Picking a day without a note shows nothing extra. The existing notes come from the chart's own
  annotations (editors receive `noteEditor`), so no server change.
- Unchanged: approvals, validation, hides, print, Renaissance, the card's own Edit (already fixed to
  its day and prefilled).

**Tests first (RED before code).** line-chart.test.tsx: with a follower-like series (negatives, so
Recharts widens the axis) every hit area, faint dot and the red line sit on the dot Recharts draws for
the same day; a callout on a day with no value still gets a hit area at the plot's bottom. The existing
dot selector narrows to `.recharts-reference-dot-dot` (the marks), since callout spots are
ReferenceDots too. chart-notes-ui.test.tsx: the save status lines (new, updated, approver), cleared
after 8s and on reopening; the one-note-per-day notice and prefill, typed text kept, no notice on a
day without a note.

**Files.** `components/charts/line-chart.tsx` (+ test), `components/report-sections/organic-social/
note-form.tsx`, `trends.tsx`, `chart-notes-ui.test.tsx`.

**Renaissance.** Its graphs pass no callouts and no note controls: CalloutLayer and the panel never
render for it; the no-callout LineChart stays byte-identical to dev's (identity test, 5 shapes).
Before and after: golden stop, check-drift, ren-fingerprint.

**Adversarial review of Phase 2c (mine, before any code; no subagents).** Findings, each patched above
or here:
1. D17, hooks in `shape`: Recharts calls a function `shape` directly (`renderDot`: `option(props)`,
   `ReferenceDot.js:66-80`), so hooks inside it would run inside Recharts' component. PATCH: the shape
   returns an element (`<SpotProbe cx cy .../>`), a real component with its own effects.
2. D17, the report loop: the probe reports from a layout effect keyed on (x, cx, cy) and removes its
   entry on unmount; the layer keeps them in state and publishes only when the set changes. No loop.
3. D17, days with no value: `ReferenceDot` drops a non-numeric y (`isNumOrStr`), which would leave that
   callout unreachable. PATCH: such a callout keeps today's position (bottom of the plot), computed
   directly, not through ReferenceDot.
4. D17, test selectors: the existing "hit area on Recharts' dot" test selects
   `.recharts-reference-dot circle`, which would now also match a faint dot. PATCH: select the marks by
   `.recharts-reference-dot-dot` (Recharts' default dot class; our spots never use it).
5. D18, wrong text: "It shows as a faint dot" is false for a draft on a top day (that dot is a normal
   one). PATCH: the lines are, exactly: nothing before -> "Saved a draft for 8/24. Clients see it once
   it's approved."; a draft before -> "Updated the draft for 8/7. Clients see it once it's approved.";
   only an approved note before -> "Saved a draft for 8/7. Clients keep seeing the approved note until
   this one is approved." An approver also gets " Hover its dot to approve it."
6. D19, lost picks: filling only the text would silently drop the existing note's picked posts. PATCH:
   picking a post from a day with a note loads that note: its text (only if the box is empty) and its
   picked posts, then adds the new pick if there is room (at most 2). Notice text: a draft exists ->
   "8/7 already has a draft. Saving updates it."; only approved -> "8/7 already has an approved note.
   Saving drafts a change to it."
7. D19, scope: notes are per chart, and each chart builds the map from its own annotations, so the
   follower graph never sees the engagement graph's notes. Hidden days count (still one note per day).
8. Renaissance: no path. CalloutLayer renders only with callouts; the status line and the notice only
   with note controls. The identity test (no callouts, 5 shapes) and the golden stop guard it.
Verdict: build D17 to D19 as patched.

**Built:** commit `40f2bb4` (suite 1663 to 1676; 11 mutations caught; live on dev: the follower dots
17px off -> 0px, the notice and prefill, the save line after 0.5s, cleared by about 9s).

**Also from my local QA, each its own commit on #273:** `4aa93f5` a draft-only card's contents dim to
80%, not 40% (hidden cards stay at 40%); `f00ca5b` the button above each graph reads "Add annotation"
(a card keeps "Note"); `5554ba6` the post picker scrolls on the site's dark scrollbar (`.scrollbar-dark`,
the sidebars' style); `679f324` tests prove notes work on the Instagram, Facebook, LinkedIn and TikTok
graphs, not only Instagram (four mutations that pin Instagram passed the old tests and fail these).
