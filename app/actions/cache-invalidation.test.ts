import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Every save invalidates the db-tagged client cache with updateTag('db'), never revalidateTag with a
// profile. From next 16.2, revalidateTag('db', 'max') serves the stale entry to the router.refresh()
// that follows a save, so the page shows the old value until the next navigation (tried side by side
// on 16.1.6 and 16.3.6 before this upgrade). updateTag expires the entries at once and only works
// inside a Server Action, so it is called from the action files, never from a plain module.

/** Every non-test source file the app can run, so a new file is covered the day it is added. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}
const ALL_SOURCE = [...['app', 'lib', 'components', 'scripts'].flatMap(sourceFiles), 'auth.ts', 'proxy.ts']

test('nothing in the app calls revalidateTag, so no save can bring back the stale refresh', () => {
  expect(ALL_SOURCE.filter((f) => /\brevalidateTag\(/.test(readFileSync(f, 'utf8')))).toEqual([])
})

// The files that write client rows: each expires the tag at least once. app/actions/client-access-invalidation.test.ts
// pins when the client-access and team actions do it (once, after a write that took effect).
const WRITERS = [
  'app/actions/chart-notes.ts',
  'app/actions/client-access.ts',
  'app/actions/commentary.ts',
  'app/actions/dashboard.ts',
  'app/actions/organic-social.ts',
  'app/actions/report-sections.ts',
  'app/actions/reports.ts',
  'app/actions/team.ts',
]

test.each(WRITERS)('%s expires the db tag with updateTag', (file) => {
  expect(readFileSync(file, 'utf8')).toMatch(/\bupdateTag\('db'\)/)
})

test('the client-access writers in lib/db/admin-queries.ts leave invalidation to their callers', () => {
  expect(readFileSync('lib/db/admin-queries.ts', 'utf8')).not.toMatch(/from ['"]next\/cache['"]/)
})
