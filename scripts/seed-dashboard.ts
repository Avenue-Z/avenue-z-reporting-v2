import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { DashboardConfig } from '@/lib/dashboard/types'

const SLUG = process.argv[2] ?? 'avenue-z'

async function main() {
  const action = process.argv[3] ?? 'seed'
  if (action === 'clear') {
    await db.update(clients).set({ dashboardConfig: null }).where(eq(clients.slug, SLUG))
    console.log(`cleared dashboardConfig for ${SLUG}`)
    return
  }
  const cfg: DashboardConfig = {
    defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
    blocks: [
      { id: 'a', name: 'Blended ROAS', format: 'number',   binding: { source: 'triplewhale', metric: 'blended_roas' }, range: null },
      { id: 'b', name: 'Ad Spend',     format: 'currency', binding: { source: 'triplewhale', metric: 'ad_spend' },     range: null },
      { id: 'c', name: 'Conv Rate',    format: 'percent',  binding: { source: 'triplewhale', metric: 'conv_rate' },    range: { dateRange: 'last_7_days', compareRange: null } },
      { id: 'd', name: 'Sessions',     format: 'count',    binding: { source: 'triplewhale', metric: 'sessions' },     range: null },
    ],
  }
  await db.update(clients).set({ dashboardConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
  console.log(`seeded dashboardConfig for ${SLUG}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
