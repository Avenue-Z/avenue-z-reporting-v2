import { db } from '@/lib/db/client'
import { sectionTemplates } from '@/lib/db/schema'
import { PEEC_TEMPLATE } from '@/components/report-sections/peec-ai/template'

async function main() {
  await db
    .insert(sectionTemplates)
    .values({ sectionSlug: 'peec-ai', composition: PEEC_TEMPLATE })
    .onConflictDoNothing({ target: sectionTemplates.sectionSlug })
  console.log('Seeded section_templates (insert-if-absent).')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
