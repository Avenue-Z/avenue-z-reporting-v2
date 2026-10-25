// scripts/unhide-renaissance-content-impact.ts
//
// Reverses scripts/hide-renaissance-content-impact.ts: removes 'content-impact'
// from renaissance's clients.hidden_reports, putting the AEO "Content Impact"
// tab back.
//
// WHY IT EXISTS SEPARATELY FROM THE HIDE. The hide was applied to all three
// databases on 2026-09-03. Danielle then needed the tab back to review it and
// outline the tweaks she owes, which she cannot do while it is hidden. The plan
// is to un-hide on STAGING ONLY so she can work, and leave production hidden
// until she has the changes she wants. So the two environments are meant to
// disagree for a while, and that is deliberate rather than drift.
//
// Because production is explicitly out of scope for this run, use EXPECT_DB_HOST
// every time. It refuses before issuing any query if the connection does not
// point where you said, which is the difference between a typo being caught and
// a typo un-hiding a tab on the client's live report.
//
//   EXPECT_DB_HOST=ep-restless-union \
//     npx tsx --env-file=.env.staging scripts/unhide-renaissance-content-impact.ts
//
// Leaves 'technical-audit' alone. That was hidden long before this work and is
// unrelated. Danielle's approved commentary on the peec-ai:content-impact view
// was never deleted and becomes visible again automatically wherever this runs.
//
// Idempotent read-modify-write; safe to re-run. Equivalent raw SQL:
//
//   UPDATE clients
//   SET hidden_reports = array_remove(hidden_reports, 'content-impact'),
//       updated_at = now()
//   WHERE slug = 'renaissance';
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients, type ReportSlug } from '@/lib/db/schema'

const SLUG = 'renaissance'
// See the hide script for why this is cast: ReportSlug is the union of top-level
// report slugs, and subsection ids are not members of it.
const SUBSECTION = 'content-impact' as ReportSlug

/** Host only, never the credentials, so the target is checkable in the output. */
function targetHost(): string {
  const raw = process.env.DATABASE_URL ?? ''
  return raw.match(/@([^/:?]+)/)?.[1] ?? '(DATABASE_URL not set)'
}

/** Refuses to run unless the connection points where the operator says it should. */
function assertExpectedHost(host: string): void {
  const expected = process.env.EXPECT_DB_HOST
  if (!expected) {
    console.log('EXPECT_DB_HOST not set, so the target is not being verified.')
    return
  }
  if (!host.includes(expected)) {
    throw new Error(
      `REFUSING: expected a host containing "${expected}" but connected to "${host}". ` +
      'Nothing was written. Check which --env-file you passed.',
    )
  }
  console.log(`Host matches EXPECT_DB_HOST ("${expected}").`)
}

async function main() {
  const host = targetHost()
  console.log(`Target database: ${host}`)
  // Before any query, so a wrong target costs nothing and writes nothing.
  assertExpectedHost(host)

  // Select only hidden_reports. A whole-row read fails on any database behind
  // the current schema, over columns this script neither reads nor writes.
  const [row] = await db
    .select({ hiddenReports: clients.hiddenReports })
    .from(clients)
    .where(eq(clients.slug, SLUG))
    .limit(1)
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const before = row.hiddenReports ?? []
  if (!before.includes(SUBSECTION)) {
    console.log(`No change. "${SUBSECTION}" is already visible for ${SLUG}.`)
    console.log(`  hidden_reports: [${before.join(', ') || '(none)'}]`)
    return
  }

  // Filter rather than assign a literal, so anything else hidden in this
  // environment is preserved instead of being silently un-hidden too.
  const after = before.filter((s) => s !== SUBSECTION)

  await db
    .update(clients)
    .set({ hiddenReports: after, updatedAt: new Date() })
    .where(eq(clients.slug, SLUG))

  console.log(`Un-hid the AEO "Content Impact" tab for ${SLUG}.`)
  console.log(`  before: [${before.join(', ')}]`)
  console.log(`  after:  [${after.join(', ') || '(none)'}]`)
  console.log('Client lookups are cached for 5 minutes, so allow up to that long to see it.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
