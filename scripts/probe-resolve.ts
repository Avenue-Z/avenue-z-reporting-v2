import { getDashboardConfig } from '@/lib/db/queries'
import { resolveBlock } from '@/lib/dashboard/resolve'

const SLUG = process.argv[2] ?? 'avenue-z'

async function main() {
  const cfg = await getDashboardConfig(SLUG)
  if (!cfg) {
    console.log(`no config for ${SLUG}`)
    return
  }
  console.log(`config has ${cfg.blocks.length} blocks; defaultRange =`, cfg.defaultRange)
  for (const block of cfg.blocks) {
    const result = await resolveBlock(block, cfg.defaultRange, { slug: SLUG })
    console.log(`  ${block.id} (${block.name}) →`, result)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
