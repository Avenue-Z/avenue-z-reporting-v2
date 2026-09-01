// scripts/set-renaissance-campaign-scope.ts
//
// Sets clients.salesforce_config.campaignNames for `renaissance` to the three
// agency-sourced campaigns, which is what switches every CRM figure on the
// Executive Overview from whole-org to agency-scoped.
//
// WHY THIS SCRIPT EXISTS. campaignNames is client config, so it lives in the DB
// and not in code — but it is also the single value that decides whether the
// client sees $174M of their own renewal book or the ~$52K the agency actually
// sourced. Leaving it to a hand-typed SQL edit puts a client-facing number three
// orders of magnitude wide behind one un-reviewed keystroke, and an exact-match
// filter turns any typo into a silent $0 rather than an error. So the names are
// committed here, reviewed on the PR, and applied by running this.
//
// The three names were confirmed live on 2026-08-31 against the Campaigns report
// type: they are the only campaigns in the org whose name mentions prospecting.
// `- Brokers` currently carries no opportunities and no leads, so including it
// changes no tile today; it is in scope so the first deal it produces is counted
// without another deploy.
//
// Idempotent read-modify-write; safe to re-run. Equivalent raw SQL:
//
//   UPDATE clients SET salesforce_config = salesforce_config || jsonb_build_object(
//     'campaignNames', '["2026 - Inbound Prospecting",
//                        "2026 - Inbound Prospecting - Brokers",
//                        "2026 - Inbound Prospecting - Employers"]'::jsonb)
//   WHERE slug = 'renaissance';
//
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/set-renaissance-campaign-scope.ts
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'

const SLUG = 'renaissance'
const CAMPAIGN_NAMES = [
  '2026 - Inbound Prospecting',
  '2026 - Inbound Prospecting - Brokers',
  '2026 - Inbound Prospecting - Employers',
]

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  // Never create the config from nothing. An absent salesforce_config means this
  // client has no CRM wired at all, and writing campaignNames onto it would leave
  // a half-built config behind salesforceAccountId, which every query needs.
  const cfg = row.salesforceConfig
  if (!cfg) throw new Error(`client "${SLUG}" has no salesforce_config — wire the CRM first`)

  const before = cfg.campaignNames ?? []
  if (same(before, CAMPAIGN_NAMES)) {
    console.log(`No change — ${SLUG} is already scoped to:\n  ${CAMPAIGN_NAMES.join('\n  ')}`)
    return
  }

  await db
    .update(clients)
    .set({ salesforceConfig: { ...cfg, campaignNames: CAMPAIGN_NAMES }, updatedAt: new Date() })
    .where(eq(clients.slug, SLUG))

  console.log(`Scoped ${SLUG} CRM reporting to ${CAMPAIGN_NAMES.length} campaigns:`)
  for (const n of CAMPAIGN_NAMES) console.log(`  ${n}`)
  console.log(before.length ? `Previous scope: ${before.join(', ')}` : 'Previous scope: whole org (unscoped)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
