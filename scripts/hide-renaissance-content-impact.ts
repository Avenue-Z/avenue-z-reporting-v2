// scripts/hide-renaissance-content-impact.ts
//
// Hides the "Content Impact" tab under AEO for `renaissance`, by adding
// 'content-impact' to clients.hidden_reports. Requested by Danielle via Maddie,
// 2026-08-31, described as "for now", so this is a reversible visibility flag,
// not a removal. Nothing is deleted.
//
// WHY A SCRIPT AND NOT A CONSOLE UPDATE. Two reasons, both about traceability:
//
//   1. There is no audit trail for a bare SQL edit. `clients.updated_at` has no
//      $onUpdate and no database trigger, there is no audit table, and no admin
//      UI writes hidden_reports. A console UPDATE leaves no record anywhere of
//      who hid this, when, or why. Committing it makes git the record.
//   2. This has to run against THREE databases (dev / staging / production are
//      separate Neon endpoints holding separate rows). A guarded, idempotent
//      script can be run three times safely; three hand-typed statements cannot.
//
// WHAT IT AFFECTS. Both sidebars drop the link and a direct URL falls back to
// the AEO Overview, because every surface reads hidden_reports through
// visibleSubsections (lib/constants.ts) or the route guard
// (app/{dashboard,portal}/[clientSlug]/reports/page.tsx). The subsection is
// nulled before the component is built, so the tab's data fetching never runs
// either. Renaissance already hides 'technical-audit' by this exact mechanism.
//
// WHAT IT ALSO AFFECTS, less obviously: renaissance has commentary saved against
// the `peec-ai:content-impact` view, including approved entries. The only render
// path for those is inside the Content Impact tab, and no admin surface lists
// commentary, so hiding the tab makes them invisible to the client and to us.
// They are not deleted and they return intact on reversal. Danielle owns that
// commentary and was told before this ran.
//
// Idempotent read-modify-write; safe to re-run. Equivalent raw SQL:
//
//   UPDATE clients
//   SET hidden_reports = array_append(hidden_reports, 'content-impact'),
//       updated_at = now()
//   WHERE slug = 'renaissance'
//     AND NOT ('content-impact' = ANY(hidden_reports));
//
// To reverse:
//
//   UPDATE clients
//   SET hidden_reports = array_remove(hidden_reports, 'content-impact'),
//       updated_at = now()
//   WHERE slug = 'renaissance';
//
// Run (dev):  npx tsx --env-file=.env.local scripts/hide-renaissance-content-impact.ts
// Staging/prod: same script, with DATABASE_URL pointed at that environment.
//
// The three endpoints differ only by name (dev ep-still-tree, staging
// ep-restless-union, production ep-green-violet), so the script prints the host
// it is about to write to. On production, verify rather than read: set
// EXPECT_DB_HOST and it refuses to run, before issuing any query, unless the
// connection actually points there.
//
//   EXPECT_DB_HOST=ep-green-violet \
//     npx tsx --env-file=.env.production scripts/hide-renaissance-content-impact.ts
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients, type ReportSlug } from '@/lib/db/schema'

const SLUG = 'renaissance'

// The AEO subsection id from AEO_SUBSECTIONS (lib/constants.ts). hidden_reports
// is a flat, unscoped string array matched by `hidden.has(s.id)`, and this id is
// unique across every subsection list, so it cannot collide with another tab.
//
// The cast is deliberate. The column is annotated $type<ReportSlug[]> but
// ReportSlug is the union of top-level report slugs, and subsection ids are not
// members of it. The underlying Postgres column is a plain text[] with no CHECK
// constraint, and every reader compares raw strings, which is why the existing
// 'technical-audit' entry works. Widening ReportSlug to admit subsection ids
// would be the wrong fix: it is a report-slug type, not a tab-id type.
const SUBSECTION = 'content-impact' as ReportSlug

/** Host only, never the credentials, so the target is checkable in the output. */
function targetHost(): string {
  const raw = process.env.DATABASE_URL ?? ''
  return raw.match(/@([^/:?]+)/)?.[1] ?? '(DATABASE_URL not set)'
}

/**
 * Refuses to run unless the connection points where the operator says it should.
 *
 * Printing the host is not much of a safeguard on the run that matters: the
 * command for production is character-for-character the command for staging
 * apart from an endpoint id nobody reliably eyeballs, which is the same reason
 * scripts/migrate-staging.sh allow-lists its target instead of trusting the
 * reader. This cannot be a fixed allow-list, because the script is meant to run
 * against all three environments, so the expectation is supplied per run:
 *
 *   EXPECT_DB_HOST=ep-green-violet npx tsx --env-file=.env.production scripts/...
 *
 * Matched as a substring so the endpoint id alone is enough and the full
 * pooler hostname does not have to be typed. Unset skips the check and keeps
 * the original behaviour, so existing invocations are unaffected.
 */
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

  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const before = row.hiddenReports ?? []
  if (before.includes(SUBSECTION)) {
    console.log(`No change. "${SUBSECTION}" is already hidden for ${SLUG}.`)
    console.log(`  hidden_reports: [${before.join(', ')}]`)
    return
  }

  // Append rather than assign a literal array, so anything hidden concurrently
  // (or hidden in this environment but not the others) is preserved instead of
  // being silently reverted.
  const after = [...before, SUBSECTION]

  await db
    .update(clients)
    .set({ hiddenReports: after, updatedAt: new Date() })
    .where(eq(clients.slug, SLUG))

  console.log(`Hid the AEO "Content Impact" tab for ${SLUG}.`)
  console.log(`  before: [${before.join(', ') || '(none)'}]`)
  console.log(`  after:  [${after.join(', ')}]`)
  console.log('Client lookups are cached for 5 minutes, so allow up to that long to see it.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
