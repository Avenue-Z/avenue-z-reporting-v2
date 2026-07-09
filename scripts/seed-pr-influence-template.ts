import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sectionTemplates } from '@/lib/db/schema'
import { PR_INFLUENCE_TEMPLATE } from '@/components/report-sections/peec-ai/pr-influence/template'
import { parseSectionTemplate } from '@/lib/report-sections/validate'
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'

const KEY = 'peec-ai:pr-influence'

async function main() {
  await db.insert(sectionTemplates)
    .values({ sectionSlug: KEY, composition: PR_INFLUENCE_TEMPLATE })
    .onConflictDoUpdate({ target: sectionTemplates.sectionSlug, set: { composition: PR_INFLUENCE_TEMPLATE, updatedAt: new Date() } })

  const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, KEY)).limit(1)
  const persisted = parseSectionTemplate(rows[0]?.composition, PR_INFLUENCE_PARTS as never)
  if (JSON.stringify(persisted) !== JSON.stringify(PR_INFLUENCE_TEMPLATE)) {
    throw new Error(`seeded row diverges from PR_INFLUENCE_TEMPLATE:\n  db=${JSON.stringify(persisted)}\n  code=${JSON.stringify(PR_INFLUENCE_TEMPLATE)}`)
  }
  console.log(`Seeded and verified section_templates['${KEY}'].`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
