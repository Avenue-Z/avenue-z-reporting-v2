// scripts/hide-renaissance-pipeline-stages.ts
//
// Sets clients.hidden_journey_stages for `renaissance` to ['inbound', 'pipeline'],
// dropping the Inbound Funnel and Pipeline cards from the top of the Executive
// Overview until those are fixed separately. Deliberately unrelated to the GA4
// conversions fix (see scripts/set-renaissance-ga4-config.ts) — kept as its own
// script/migration/commit so either can be reverted independently.
//
// hidden_journey_stages only supports removing a TRAILING run of the fixed
// stage order (aeo, ga4, inbound, pipeline) — components/report-sections/
// executive-overview/stages.ts validates this and ignores an invalid value
// rather than risk a connector arrow describing a stage that's no longer
// next. ['inbound', 'pipeline'] is exactly the trailing two, so this is safe.
//
// Idempotent; safe to re-run.
//
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/hide-renaissance-pipeline-stages.ts
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { DemandJourneyStageKey } from '@/lib/db/schema'

const SLUG = 'renaissance'
const HIDDEN_STAGES: DemandJourneyStageKey[] = ['inbound', 'pipeline']

const sameStages = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const before = row.hiddenJourneyStages ?? []
  if (sameStages(before, HIDDEN_STAGES)) {
    console.log(`No change — ${SLUG} already hides: ${HIDDEN_STAGES.join(', ')}`)
    return
  }

  await db
    .update(clients)
    .set({ hiddenJourneyStages: HIDDEN_STAGES, updatedAt: new Date() })
    .where(eq(clients.slug, SLUG))

  console.log(`Hid journey stages for ${SLUG}: ${HIDDEN_STAGES.join(', ')}`)
  console.log(before.length ? `Previous: ${before.join(', ')}` : 'Previous: none hidden')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
