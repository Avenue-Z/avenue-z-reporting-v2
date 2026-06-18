import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'

async function main() {
  const rows = await db.select({ slug: clients.slug, name: clients.name }).from(clients).limit(30)
  console.log(JSON.stringify(rows, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
