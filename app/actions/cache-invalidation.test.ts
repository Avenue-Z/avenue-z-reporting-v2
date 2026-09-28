import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

// updateTag throws outside a Server Action, after the database write has already landed, so the caller
// would see a failure for a save that happened. The client-access writers in lib/db/admin-queries.ts are a
// plain module; this keeps every file that calls them a 'use server' file.
const ADMIN_WRITERS = ['setClientSharedPassword', 'setClientMaxSeats', 'addClientUser', 'removeClientUser']
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

test("the client-access writers are called only from 'use server' files", () => {
  const callers = ['app', 'lib', 'components', 'scripts'].flatMap(sourceFiles).filter((f) => {
    if (f === join('lib', 'db', 'admin-queries.ts')) return false
    const src = readFileSync(f, 'utf8')
    return /from ['"]@\/lib\/db\/admin-queries['"]/.test(src) && ADMIN_WRITERS.some((w) => new RegExp(`\\b${w}\\(`).test(src))
  })
  expect(callers.sort()).toEqual(['app/actions/client-access.ts', 'app/actions/team.ts'])
  for (const f of callers) expect(readFileSync(f, 'utf8').trimStart().startsWith("'use server'")).toBe(true)
})
