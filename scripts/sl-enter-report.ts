/**
 * Enter a delivered Social Listening report's media counts and top authors onto its history row (plan
 * docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit D). The numbers are read off the delivered deck and
 * kept in a private file outside the repo; this script holds no client data.
 *
 *   npx tsx --env-file=<env file> scripts/sl-enter-report.ts --client <slug> --month YYYY-MM --file <private.json> --host <db host> [--apply]
 *
 * The file: { "media": [{ "media": "<Talkwalker name>", "count": <n> }], "authors": [{ "name": "...", "network": "...", "posts": <n> }] }
 *
 * - Runs only against the database whose host is exactly --host, so the target is always stated, never assumed.
 * - Checks every name against that month's current brand upload (checkReportEntry) and lists every problem; writes nothing then.
 * - Without --apply it only prints what it would write. With --apply it fills the two columns on the brand history row,
 *   only where both are still empty; it never overwrites, deletes or touches any other row or column.
 * - The page reads through a 5-minute cache, so the change shows within 5 minutes.
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { checkReportEntry, type ReportEntryInput } from '@/lib/organic-social/social-listening/report-entry'
import type { SlExport } from '@/lib/organic-social/social-listening/types'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function fail(message: string): never {
  console.error(`REFUSED: ${message}`)
  process.exit(1)
}

async function main() {
  const slug = arg('client'), month = arg('month'), file = arg('file'), host = arg('host')
  const apply = process.argv.includes('--apply')
  if (!slug || !month || !file || !host) fail('needs --client, --month, --file and --host')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('--month must be YYYY-MM')
  const url = process.env.DATABASE_URL
  if (!url) fail('DATABASE_URL is not set (pass --env-file)')
  const actual = new URL(url).hostname
  if (actual !== host) fail(`the database host is ${actual}, not the --host given`)

  const input = JSON.parse(readFileSync(file, 'utf8')) as ReportEntryInput
  const sql = neon(url)
  const monthDate = `${month}-01`
  const [client] = await sql`SELECT id FROM clients WHERE slug = ${slug}`
  if (!client) fail(`no client ${slug}`)
  const [upload] = await sql`SELECT data FROM social_listening_uploads WHERE client_id = ${client.id} AND month = ${monthDate} AND topic = 'brand' ORDER BY uploaded_at DESC LIMIT 1`
  if (!upload) fail(`no brand upload for ${month}, so the names cannot be checked`)
  const [row] = await sql`SELECT media, authors FROM social_listening_history WHERE client_id = ${client.id} AND month = ${monthDate} AND topic = 'brand'`
  if (!row) fail(`no brand history row for ${month}; enter the report's row first`)
  if (row.media !== null || row.authors !== null) fail(`the ${month} row already has media or authors; this script never overwrites`)

  const checked = checkReportEntry(input, upload.data as SlExport)
  if (!checked.ok) fail(`the file does not match the ${month} upload:\n  ${checked.errors.join('\n  ')}`)

  console.log(`target: ${actual}, client ${slug}, ${month}, brand`)
  console.log(`media (${checked.media.length}): ${checked.media.map((m) => `${m.media} ${m.count}`).join(', ')}`)
  console.log(`authors (${checked.authors.length}): ${checked.authors.map((a) => `${a.name} on ${a.network} ${a.posts}`).join(', ')}`)
  if (!apply) { console.log('DRY RUN: nothing written. Add --apply to write.'); return }

  const updated = await sql`UPDATE social_listening_history SET media = ${JSON.stringify(checked.media)}::jsonb, authors = ${JSON.stringify(checked.authors)}::jsonb
    WHERE client_id = ${client.id} AND month = ${monthDate} AND topic = 'brand' AND media IS NULL AND authors IS NULL RETURNING id`
  console.log(updated.length === 1 ? 'WRITTEN: 1 row.' : `NOT WRITTEN: ${updated.length} rows matched (the row changed since the check).`)
  if (updated.length !== 1) process.exit(1)
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
