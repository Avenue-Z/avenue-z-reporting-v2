import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The migration is the one change here that reaches a shared database, so what it does is pinned as text: five new
// tables and their indexes, nothing else touched. Same approach as lib/organic-social/chart-notes/migration.test.ts.
// (This lives here, not in lib/db/, because vitest.config.ts includes no lib/db/** tests.)
const dir = join(process.cwd(), 'drizzle')
const file = readdirSync(dir).find((f) => f.startsWith('0030_'))
const sql = file ? readFileSync(join(dir, file), 'utf8') : ''
const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)

const TABLES = [
  'social_listening_uploads',
  'social_listening_history',
  'social_listening_posts',
  'social_listening_post_images',
  'social_listening_trends',
]

test('0030 exists and holds its place in the journal', () => {
  expect(file).toBe('0030_social_listening.sql')
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  expect(journal.entries[30]?.tag).toBe('0030_social_listening')
  expect(journal.entries).toHaveLength(31)
})

test('it creates exactly the five tables and touches no other table', () => {
  const created = [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1])
  expect(created.sort()).toEqual([...TABLES].sort())
  for (const s of statements) {
    expect(TABLES.some((t) => s.includes(`"${t}"`))).toBe(true)
  }
  expect(sql).not.toMatch(/DROP|CREATE TYPE|ALTER TYPE/)
  // Every ALTER TABLE is a foreign key on one of the new tables.
  for (const m of sql.matchAll(/ALTER TABLE "([a-z_]+)"/g)) expect(TABLES).toContain(m[1])
})

test('a post has at most one open draft edit (partial unique index, R2-10)', () => {
  expect(sql).toContain(
    `CREATE UNIQUE INDEX "social_listening_posts_one_open_draft" ON "social_listening_posts" USING btree ("replaces_id") WHERE status = 'draft' AND deleted_at IS NULL;`,
  )
})

test('only a draft post is ever soft deleted, as Commentary enforces', () => {
  expect(sql).toContain(
    `CONSTRAINT "social_listening_posts_no_deleted_approved" CHECK ("social_listening_posts"."deleted_at" IS NULL OR "social_listening_posts"."status" = 'draft')`,
  )
})

test('uploads keep the file as bytes and the before-open flag', () => {
  expect(sql).toContain(`"raw" "bytea" NOT NULL`)
  expect(sql).toContain(`"before_open" boolean NOT NULL`)
  expect(sql).toContain(`"sha256" text NOT NULL`)
  expect(sql).toContain(`CREATE INDEX "social_listening_uploads_client_month_topic_idx" ON "social_listening_uploads" USING btree ("client_id","month","topic");`)
})

test('images hold the screen and print copies as bytes, keyed by uuid', () => {
  expect(sql).toMatch(/"id" uuid PRIMARY KEY DEFAULT gen_random_uuid\(\) NOT NULL,\s+"post_id" uuid NOT NULL,\s+"bytes" "bytea" NOT NULL,\s+"print_bytes" "bytea" NOT NULL/)
})

test('history and trends are one row per client and month (and topic)', () => {
  expect(sql).toContain(`CONSTRAINT "social_listening_history_client_month_topic_key" UNIQUE("client_id","month","topic")`)
  expect(sql).toContain(`CONSTRAINT "social_listening_trends_client_month_key" UNIQUE("client_id","month")`)
})

test('trends keep approved lists beside the draft (R2-11) and reuse the commentary status enum', () => {
  for (const col of ['approved_emerging', 'approved_decreasing', 'approved_new']) expect(sql).toContain(`"${col}" jsonb,`)
  expect(sql).toContain(`"status" "commentary_status" DEFAULT 'draft' NOT NULL`)
})

test('every new table is removed with its client', () => {
  const cascades = [...sql.matchAll(/REFERENCES "public"\."([a-z_]+)"\("id"\) ON DELETE cascade/g)].map((m) => m[1])
  expect(cascades.filter((t) => t === 'clients')).toHaveLength(4)
  expect(cascades).toContain('social_listening_posts')
})

test('bytea values round-trip through the hex text form and a driver Buffer', async () => {
  const { byteaToDriver, byteaFromDriver } = await import('@/lib/db/schema')
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10])
  expect(byteaToDriver(bytes)).toBe('\\xffd8ff0010')
  expect(byteaFromDriver(byteaToDriver(bytes))).toEqual(bytes)
  expect(byteaFromDriver(Buffer.from(bytes))).toEqual(bytes)
  expect(() => byteaFromDriver('ffd8')).toThrow()
  expect(() => byteaFromDriver(42)).toThrow()
})
