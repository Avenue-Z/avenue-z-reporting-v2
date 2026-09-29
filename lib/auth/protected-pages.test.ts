// @vitest-environment node
// Every page under /portal, /dashboard and /tools checks access itself, first, before it loads
// anything (lib/auth/page-access.ts). A layout can be skipped on a navigation, so a page that
// forgets this, or loads data before it, is open to any signed-in account. This reads the source,
// so a new page is covered the day it is added.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = process.cwd()
const pagesUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('page.tsx'))
    .map((f) => join(dir, f))

/** Every `await <name>` in the page's default export, except reading its own URL. */
function awaitsInPage(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const start = src.indexOf('export default')
  expect(start, `${file} has no default export`).toBeGreaterThanOrEqual(0)
  return [...src.slice(start).matchAll(/await\s+([A-Za-z_$][\w$.]*)/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'params' && name !== 'searchParams')
}

const portal = pagesUnder('app/portal')
const staff = [...pagesUnder('app/dashboard'), ...pagesUnder('app/tools')]

test('the walk finds the pages it is meant to guard', () => {
  expect(portal).toContain(join('app/portal', '[clientSlug]', 'reports', 'page.tsx'))
  expect(staff).toContain(join('app/dashboard', '[clientSlug]', 'access', 'page.tsx'))
  expect(staff).toContain(join('app/tools', 'reporting', 'page.tsx'))
  expect(portal.length + staff.length).toBeGreaterThanOrEqual(17)
})

test.each(portal.map((f) => [relative(ROOT, join(ROOT, f))]))('%s checks its own slug before anything else', (file) => {
  expect(awaitsInPage(file)[0]).toBe('requirePortalAccess')
  expect(readFileSync(join(ROOT, file), 'utf8')).toMatch(/await requirePortalAccess\(clientSlug\)/)
})

test.each(staff.map((f) => [relative(ROOT, join(ROOT, f))]))('%s checks for staff before anything else', (file) => {
  expect(awaitsInPage(file)[0]).toBe('requireStaff')
})
