// scripts/hide-sentiment-renaissance.ts
//
// Hides the `sentiment-insights` body part on the peec-ai PR Influence view for
// the `renaissance` client, by merging a body `hidden` entry into
// clients.report_section_config['peec-ai:pr-influence']. Idempotent read-modify-write;
// safe to re-run. Mirrors scripts/enable-commentary-renaissance.ts.
//
// Note: today this is a no-op visually, because the sentiment-insights part
// already self-gates to clientSlug === 'avenue-z' (Profound is a single-account
// feed), so renaissance never renders it. This config hide makes the exclusion
// explicit and config-driven, and remains correct if that gate is ever relaxed.
//
// Equivalent raw SQL (deep-merges into the existing key, preserving sharedParts):
//   UPDATE clients SET report_section_config = jsonb_set(
//     COALESCE(report_section_config, '{}'::jsonb),
//     '{peec-ai:pr-influence,hidden}', '["sentiment-insights"]'::jsonb, true)
//   WHERE slug = 'renaissance';
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { ReportSectionConfig } from '@/lib/report-sections/types'

const SLUG = 'renaissance'
const KEY = 'peec-ai:pr-influence'
const PART = 'sentiment-insights'

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const cfg: ReportSectionConfig = { ...(row.reportSectionConfig ?? {}) }
  // `existing` is defined for renaissance because it already carries a commentary
  // sharedParts opt-in on this key (see enable-commentary-renaissance.ts). A future
  // hide script for a client WITHOUT a prior override on this key must use
  // `existing?.hidden` and tolerate a missing override object; do not copy the
  // non-optional form forward unchanged.
  const existing = cfg[KEY] ?? {}
  const already = (existing.hidden ?? []).includes(PART)

  if (already) {
    console.log(`No change: ${PART} already hidden on ${KEY} for ${SLUG}.`)
  } else {
    // set-union on hidden (survives a future entry); spread preserves sharedParts.
    const hidden = [...new Set([...(existing.hidden ?? []), PART])]
    cfg[KEY] = { ...existing, hidden }
    await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
    console.log(`Hid ${PART} on ${KEY} for ${SLUG}.`)
  }
  console.log(`Final ${KEY} override: ${JSON.stringify(cfg[KEY] ?? {})}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
