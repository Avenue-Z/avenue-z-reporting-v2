import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Every save invalidates the db-tagged client cache with updateTag('db'), never revalidateTag with a
// profile. From next 16.2, revalidateTag('db', 'max') serves the stale entry to the router.refresh()
// that follows a save, so the page shows the old value until the next navigation (tried side by side
// on 16.1.6 and 16.3.6 before this upgrade). updateTag expires the entries at once and only works
// inside a Server Action; the admin-queries writers are called only from 'use server' files
// (app/actions/client-access.ts and app/actions/team.ts).
const WRITERS: Record<string, number> = {
  'app/actions/chart-notes.ts': 4,
  'app/actions/commentary.ts': 4,
  'app/actions/dashboard.ts': 1,
  'app/actions/organic-social.ts': 2,
  'app/actions/report-sections.ts': 2,
  'app/actions/reports.ts': 1,
  'lib/db/admin-queries.ts': 4,
}

test.each(Object.entries(WRITERS))('%s expires the db tag with updateTag, %i times, and never revalidateTag', (file, n) => {
  const src = readFileSync(file, 'utf8')
  expect(src.match(/\bupdateTag\('db'\)/g) ?? []).toHaveLength(n)
  expect(src).not.toMatch(/\brevalidateTag\(/)
})
