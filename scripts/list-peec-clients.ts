// scripts/list-peec-clients.ts
export {} // module scope
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/list-peec-clients.ts
// Read-only release check (F-1): lists every client with a Peec project set and
// 'peec-ai' enabled, with each one's peec-ai override order/hidden (M8). Exits 1 if
// any client other than 'renaissance' is listed, so the "only Renaissance" claim
// cannot pass silently.

import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'

async function main() {
  const rows = await db.select().from(clients)
  const listed = rows
    .filter((c) => !!c.peecCustomerProjectId && (c.enabledReports as string[]).includes('peec-ai'))
    .sort((a, b) => a.slug.localeCompare(b.slug))

  console.log('=== Clients with Peec set up (peec_customer_project_id set AND peec-ai enabled) ===')
  if (listed.length === 0) console.log('(none)')
  for (const c of listed) {
    const hidden = (c.hiddenReports as string[]).includes('content-impact')
    const cfg = c.reportSectionConfig as Record<string, { frozen?: unknown; order?: string[]; hidden?: string[] }> | null
    const override = cfg?.['peec-ai']
    const frozen = !!override?.frozen
    console.log(`- ${c.slug}: content-impact hidden=${hidden ? 'yes' : 'no'}, peec-ai layout frozen=${frozen ? 'yes' : 'no'}`)
    // M8: the new competitor parts sit before 'footer' in the template; a per-client order
    // that lists 'footer' puts them after it instead.
    console.log(`    peec-ai override order=${override?.order ? JSON.stringify(override.order) : '(none)'}, hidden=${override?.hidden ? JSON.stringify(override.hidden) : '(none)'}`)
    if (override?.order?.includes('footer')) {
      console.log(`    WARN: ${c.slug}'s peec-ai order lists 'footer'; the competitor parts would render after it.`)
    }
  }
  console.log(`Total listed: ${listed.length} (of ${rows.length} clients)`)

  const others = listed.filter((c) => c.slug !== 'renaissance').map((c) => c.slug)
  if (others.length > 0) {
    console.log(`\nFAIL: clients other than renaissance have Peec set up: ${others.join(', ')}`)
    console.log('The F-1 claim ("only Renaissance") does not hold; review each before release.')
    process.exit(1)
  }
  console.log('\nOK: only renaissance (or nobody) has Peec set up.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2) })
