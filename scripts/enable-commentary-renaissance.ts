// scripts/enable-commentary-renaissance.ts
//
// Enables commentary (a shared part) on all 7 in-scope views for the `renaissance`
// client, by merging sharedParts opt-ins into clients.report_section_config.
// Idempotent read-modify-write; safe to re-run. Equivalent raw SQL:
//
//   UPDATE clients SET report_section_config = (
//     COALESCE(report_section_config, '{}'::jsonb)
//     || '{"peec-ai":{"sharedParts":[{"id":"commentary","version":1}]},
//          "peec-ai:pr-influence":{"sharedParts":[{"id":"commentary","version":1}]},
//          ... all 7 ...}'::jsonb )
//   WHERE slug = 'renaissance';
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { ReportSectionConfig } from '@/lib/report-sections/types'

const SLUG = 'renaissance'
const VIEW_KEYS = [
  'peec-ai', 'peec-ai:pr-influence', 'peec-ai:content-impact',
  'paid-search', 'meta-ads', 'linkedin-ads', 'organic-social',
] as const
const PIN = { id: 'commentary', version: 1 }

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const cfg: ReportSectionConfig = { ...(row.reportSectionConfig ?? {}) }
  const touched: string[] = []
  for (const vk of VIEW_KEYS) {
    const existing = cfg[vk] ?? {}
    const already = (existing.sharedParts ?? []).some((p) => p.id === PIN.id && p.version === PIN.version)
    if (!already) {
      cfg[vk] = { ...existing, sharedParts: [...(existing.sharedParts ?? []), PIN] }
      touched.push(vk)
    }
  }

  if (touched.length === 0) {
    console.log(`No change — commentary already enabled on all ${VIEW_KEYS.length} views for ${SLUG}.`)
  } else {
    await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
    console.log(`Enabled commentary on: ${touched.join(', ')}`)
  }
  console.log(`Final commentary-enabled views: ${VIEW_KEYS.filter((vk) => (cfg[vk]?.sharedParts ?? []).some((p) => p.id === PIN.id)).join(', ')}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
