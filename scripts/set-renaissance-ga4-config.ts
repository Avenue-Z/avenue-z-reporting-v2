// scripts/set-renaissance-ga4-config.ts
//
// Sets clients.ga4_config.leadEvents for `renaissance` — the allowlist that
// switches the Executive Overview's Conversions/Conversion Rate from GA4's
// raw "key event" flag (16,824 for August 2026, ~93% outbound_click/pdf_view/
// contact_link_click, not leads) to an explicit list of real lead events.
//
// WHY THIS SCRIPT EXISTS, not a hand-typed SQL edit: the allowlist is 17 GA4
// event names across 15 reported rows, and a typo in any one of them is a
// silent under-count with no error (GA4's inListFilter returns 200 with zero
// rows for a name that doesn't exist) — see docs/qa/renaissance-ga4-conversions/
// notes.md for the full 90-day inventory this list was built from. Committing
// it here means the list is reviewed on the PR, and every environment (dev,
// staging, prod) applies the exact same values by running the same script,
// rather than the allowlist being re-typed by hand at each stage.
//
// Verified against August 2026 (a closed month, the same month the turnover
// doc used): this exact allowlist sums to 107 real leads, not the 81-82 the
// doc's own passing mention implied. That 81-82 figure was never a complete
// count — it came from GA4's `keyEvents` metric, which returns 0 for any
// event not already flagged as a key event, so it structurally excluded the
// 7 event types below (contact_provider_lead + the 6 employer_group_*
// events) that were real leads sitting outside the flag (see notes.md's
// "Ground truth, corrected" section for the full reconciliation, including a
// checked bound on possible double-counting inside the form_submission
// merge). 107 is the number that includes them.
//
// Idempotent read-modify-write; safe to re-run.
//
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/set-renaissance-ga4-config.ts
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { Ga4LeadEvent } from '@/lib/db/schema'

const SLUG = 'renaissance'

const LEAD_EVENTS: Ga4LeadEvent[] = [
  { name: 'contact_individual_lead',       sourceEvents: ['contact_individual_lead'] },
  { name: 'contact_employee_lead',         sourceEvents: ['contact_employee_lead'] },
  { name: 'contact_employer_lead',         sourceEvents: ['contact_employer_lead'] },
  { name: 'contact_provider_lead',         sourceEvents: ['contact_provider_lead'] },
  { name: 'broker_group_lead',             sourceEvents: ['broker_group_lead'] },
  { name: 'broker_individual_lead',        sourceEvents: ['broker_individual_lead'] },
  { name: 'contact_broker_lead',           sourceEvents: ['contact_broker_lead'] },
  { name: 'employer_group_vision_lead',    sourceEvents: ['employer_group_vision_lead'] },
  { name: 'employer_group_dental_lead',    sourceEvents: ['employer_group_dental_lead'] },
  { name: 'employer_group_disability_lead', sourceEvents: ['employer_group_disability_lead'] },
  { name: 'employer_group_supplemental_lead', sourceEvents: ['employer_group_supplemental_lead'] },
  { name: 'employer_group_accident_lead',  sourceEvents: ['employer_group_accident_lead'] },
  { name: 'employer_group_pfml_lead',      sourceEvents: ['employer_group_pfml_lead'] },
  { name: 'employer_group_life_lead',      sourceEvents: ['employer_group_life_lead'] },
  // Merged per an internal working decision (not yet confirmed with
  // Renaissance/their GTM owner — see notes.md "Open questions"): these three
  // were ambiguous individually but are grouped here as one reported line.
  { name: 'form_submission',               sourceEvents: ['via_form', 'whitelabel_form', 'contact_other_lead'] },
]

const sameEvents = (a: Ga4LeadEvent[], b: Ga4LeadEvent[]) =>
  a.length === b.length && a.every((x, i) => x.name === b[i]?.name && sameNames(x.sourceEvents, b[i]?.sourceEvents ?? []))
const sameNames = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  // Array.isArray, not `?? []` — same round-two/round-three finding as
  // lib/ga4/lead-events.ts: a hand-edited row where leadEvents is present
  // but the wrong type (e.g. a string) would otherwise throw here, on
  // exactly the input this script exists to repair.
  const before = Array.isArray(row.ga4Config?.leadEvents) ? row.ga4Config.leadEvents : []
  if (sameEvents(before, LEAD_EVENTS)) {
    console.log(`No change — ${SLUG} already has this exact ga4Config.leadEvents (${LEAD_EVENTS.length} rows).`)
    return
  }

  // Merge, not overwrite — same reason set-renaissance-campaign-scope.ts
  // spreads salesforceConfig before setting campaignNames. Ga4Config has
  // exactly one key today (leadEvents), so this is inert right now, but it
  // stays correct if a second key gets added later instead of silently
  // erasing it.
  // Same guard as `before` above, at the merge site this time: a wrongly-typed
  // ga4Config (e.g. a bare string) would otherwise spread into garbage keys
  // (`{...'oops'}` -> `{"0":"o","1":"o",...}`) and get written back verbatim.
  const cfg = row.ga4Config && typeof row.ga4Config === 'object' && !Array.isArray(row.ga4Config) ? row.ga4Config : {}
  await db
    .update(clients)
    .set({ ga4Config: { ...cfg, leadEvents: LEAD_EVENTS }, updatedAt: new Date() })
    .where(eq(clients.slug, SLUG))

  console.log(`Set ${SLUG} ga4Config.leadEvents to ${LEAD_EVENTS.length} rows (${LEAD_EVENTS.flatMap((e) => e.sourceEvents).length} source events):`)
  for (const e of LEAD_EVENTS) console.log(`  ${e.name}${e.sourceEvents.length > 1 ? ` (= ${e.sourceEvents.join(' + ')})` : ''}`)
  console.log(before.length ? `Previous: ${before.length} rows` : 'Previous: unconfigured (raw GA4 conversions metric)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
