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
