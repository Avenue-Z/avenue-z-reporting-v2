import { isDeepStrictEqual } from 'node:util'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sectionTemplates } from '@/lib/db/schema'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { parseSectionTemplate } from '@/lib/report-sections/validate'
import { PEEC_TEMPLATE } from '@/components/report-sections/peec-ai/template'
import type { SectionTemplate } from '@/lib/report-sections/types'

// Insert-if-absent by design (spec 1 §6). The code constant is a first-boot fallback;
// once a row exists, promoteToTemplate + manual SQL are authoritative. Add a row here
// ONLY when every part it references exists (M4 adds organic-social).
const SEED: { slug: string; template: SectionTemplate }[] = [
  { slug: 'peec-ai', template: PEEC_TEMPLATE },
]

async function main() {
  const check = process.argv.includes('--check')
  let drift = 0

  for (const { slug, template } of SEED) {
    const reg = REGISTRIES[slug]
    if (!reg) throw new Error(`no registry registered for section '${slug}'`)
    // Parse-before-insert: a constant referencing a missing/unpublished pin fails here, loudly.
    parseSectionTemplate(template, reg)

    const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, slug))
    const existing = rows[0]?.composition
    if (existing) {
      // Structural deep-equal, NOT JSON.stringify: `existing` is a jsonb value whose keys
      // Postgres normalizes to its own order, while `template` is in source declaration order —
      // string comparison would report phantom drift the moment those orders differ.
      const diverged = !isDeepStrictEqual(existing, template)
      if (diverged) {
        drift++
        console.warn(`[drift] '${slug}' row differs from the code constant (promotion or manual edit).`)
      }
      continue // never overwrite — promoteToTemplate owns divergence
    }
    if (check) {
      // --check is READ-ONLY: it never writes. An absent row is drift the report surfaces
      // (exit 1 below), not something --check silently inserts.
      drift++
      console.warn(`[drift] '${slug}' row is absent (a non-check run would insert it).`)
      continue
    }
    await db.insert(sectionTemplates)
      .values({ sectionSlug: slug, composition: template })
      .onConflictDoNothing({ target: sectionTemplates.sectionSlug })
    console.log(`Seeded '${slug}' (insert-if-absent).`)
  }

  if (check && drift > 0) {
    console.error(`--check: ${drift} row(s) diverge from / are absent vs code constants (see [drift] above).`)
    process.exit(1)
  }
  console.log('Seed complete.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
