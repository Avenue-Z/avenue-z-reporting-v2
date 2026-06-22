/**
 * HTTP-based Drizzle migrator (works around drizzle-kit's WebSocket hang on Neon).
 * Applies every pending migration in drizzle/ (in journal order) over the neon()
 * HTTP driver and records each in drizzle.__drizzle_migrations so the journal stays
 * consistent with drizzle-kit. Additive "already exists" errors are treated as
 * already-applied (so it also reconciles a hand-patched DB).
 *
 * Usage:
 *   DATABASE_URL_UNPOOLED='<target-direct-url>' npx tsx --env-file=.env.local scripts/migrate-http.ts
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'

interface JournalEntry { idx: number; when: number; tag: string }

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL_UNPOOLED (direct, non-pooler) for the target DB')
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '')
  console.log('target host:', host)

  const sql = neon(url)
  const dir = join(process.cwd(), 'drizzle')
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] }

  await sql.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  await sql.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)')

  const appliedRows = (await sql.query('SELECT hash FROM drizzle.__drizzle_migrations')) as { hash: string }[]
  const applied = new Set(appliedRows.map((r) => r.hash))

  let appliedCount = 0
  for (const entry of journal.entries) {
    const content = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8')
    const hash = createHash('sha256').update(content).digest('hex')
    if (applied.has(hash)) { console.log(`  skip   ${entry.tag} (recorded)`); continue }

    const statements = content.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
    process.stdout.write(`  apply  ${entry.tag} (${statements.length} stmt) ... `)
    for (const stmt of statements) {
      try {
        await sql.query(stmt)
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? ''
        if (/already exists/i.test(msg)) continue // additive object already present — treat as applied
        throw new Error(`failed on ${entry.tag}: ${msg}`)
      }
    }
    await sql.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, entry.when])
    appliedCount++
    console.log('done')
  }
  console.log(appliedCount === 0 ? 'already up to date' : `applied ${appliedCount} migration(s)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('MIGRATE ERROR:', e.message); process.exit(1) })
