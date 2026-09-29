// @vitest-environment node
// Every page under /portal, /dashboard and /tools checks access itself, first, before it does
// anything else (lib/auth/page-access.ts). A layout can be skipped on a navigation, so a page that
// forgets this, or starts work before it, is open to any signed-in account. This reads the source,
// so a new page is covered the day it is added.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = process.cwd()
const AREAS = ['app/portal', 'app/dashboard', 'app/tools']
const filesUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).filter((f) => /\.[jt]sx?$/.test(f)).map((f) => join(dir, f))

/** The only statements a page may run before its check: reading its own URL. */
const URL_READ = /^ {2}const \{\s*[\w$]+(\s*,\s*[\w$]+)*\s*\} = await (params|searchParams)$/

/** The lines of the default export's body before the first line of the check, or null when the check
 *  is not a statement of its own at the top level of the body (inside a try, a condition, a callback). */
function beforeCheck(src: string, check: RegExp): string[] | null {
  const lines = src.split('\n')
  const start = lines.findIndex((l) => l.startsWith('export default'))
  if (start < 0) return null
  const bodyStart = lines.findIndex((l, i) => i >= start && /\) \{$/.test(l)) + 1
  const at = lines.findIndex((l, i) => i >= bodyStart && check.test(l))
  return at < 0 ? null : lines.slice(bodyStart, at)
}

const CHECKS = {
  portal: /^ {2}await requirePortalAccess\(clientSlug\)$/,
  staff: /^ {2}await requireStaff\(\)$/,
}

function assertGuarded(file: string, check: RegExp) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const before = beforeCheck(src, check)
  expect(before, `${file}: no top-level access check in the default export`).not.toBeNull()
  const extra = before!.filter((l) => l.trim() !== '' && !URL_READ.test(l))
  expect(extra, `${file}: runs something before its access check`).toEqual([])
}

const all = AREAS.flatMap(filesUnder)
const pages = all.filter((f) => /\/page\.[jt]sx?$/.test(f))
/** The three layouts that exist today, each checked by lib/portal/portal-layout.test.tsx or by the
 *  shared rule it calls. A new layout would run beside the page, so it needs its own review first. */
const LAYOUTS = ['app/portal/[clientSlug]/layout.tsx', 'app/dashboard/layout.tsx', 'app/tools/layout.tsx']
const SPECIAL = /\/(route|template|default|error|global-error|not-found|forbidden|unauthorized|opengraph-image|twitter-image|icon|apple-icon|sitemap)\.[jt]sx?$/
const PARALLEL_OR_INTERCEPT = /\/@|\/\(\.{1,3}\)/

test('the only route files in the protected areas are pages, layouts and static loading skeletons', () => {
  // Next runs these file names as routes. A route handler, template, parallel or intercepting route
  // would run without the page check, so any of them here needs its own check before it is allowed.
  expect(all.filter((f) => SPECIAL.test(f) || PARALLEL_OR_INTERCEPT.test(f))).toEqual([])
  expect(all.filter((f) => /\/layout\.[jt]sx?$/.test(f)).sort()).toEqual([...LAYOUTS].sort())
  for (const f of all.filter((x) => /\/loading\.[jt]sx?$/.test(x))) {
    expect(readFileSync(join(ROOT, f), 'utf8'), `${f} must not load data`).not.toMatch(/await|fetch\(|get\w*Client|auth\(|\buse\(/)
  }
  for (const f of [...pages, ...LAYOUTS]) {
    expect(readFileSync(join(ROOT, f), 'utf8'), `${f}: metadata or viewport code runs outside the page body`).not.toMatch(/generate(Metadata|Viewport)/)
  }
})

test('the walk finds the pages it is meant to guard', () => {
  expect(pages).toContain(join('app/portal', '[clientSlug]', 'reports', 'page.tsx'))
  expect(pages).toContain(join('app/dashboard', '[clientSlug]', 'access', 'page.tsx'))
  expect(pages).toContain(join('app/tools', 'reporting', 'page.tsx'))
  expect(pages.length).toBeGreaterThanOrEqual(17)
})

test.each(pages.filter((f) => f.startsWith('app/portal')).map((f) => [f]))('%s checks its own slug before anything else', (file) => {
  assertGuarded(file, CHECKS.portal)
})

test.each(pages.filter((f) => !f.startsWith('app/portal')).map((f) => [f]))('%s checks for staff before anything else', (file) => {
  assertGuarded(file, CHECKS.staff)
})

test('the guard itself catches the ways a check can be defeated', () => {
  const page = (body: string) => `export default async function P({\n  params,\n}: {\n  params: Promise<{ clientSlug: string }>\n}) {\n${body}\n}`
  const ok = page('  const { clientSlug } = await params\n  await requirePortalAccess(clientSlug)\n  const c = await getClientBySlug(clientSlug)')
  expect(beforeCheck(ok, CHECKS.portal)!.filter((l) => l.trim() && !URL_READ.test(l))).toEqual([])
  for (const bad of [
    '  const { clientSlug } = await params\n  try { await requirePortalAccess(clientSlug) } catch {}',
    '  const { clientSlug } = await params\n  const p = getClientBySlug(clientSlug)\n  await requirePortalAccess(clientSlug)',
    '  const { clientSlug } = await params\n  const c = await (getClientBySlug(clientSlug))\n  await requirePortalAccess(clientSlug)',
    '  const { clientSlug } = await params\n  console.log(clientSlug)\n  await requirePortalAccess(clientSlug)',
    '  const { clientSlug } = await params\n  if (x) {\n    await requirePortalAccess(clientSlug)\n  }',
    '  const { clientSlug, x = loadAll() } = await params\n  await requirePortalAccess(clientSlug)',
    '  const { r = await getAllClients() } = await searchParams\n  const { clientSlug } = await params\n  await requirePortalAccess(clientSlug)',
  ]) {
    const before = beforeCheck(page(bad), CHECKS.portal)
    expect(before === null || before.some((l) => l.trim() && !URL_READ.test(l)), bad).toBe(true)
  }
})

test('the route-file rules match the files they are meant to catch', () => {
  for (const f of ['app/portal/[clientSlug]/route.ts', 'app/dashboard/template.tsx', 'app/tools/x/default.jsx', 'app/portal/[clientSlug]/error.tsx'])
    expect(SPECIAL.test(f), f).toBe(true)
  for (const f of ['app/portal/[clientSlug]/@slot/page.tsx', 'app/dashboard/(.)photo/page.tsx', 'app/dashboard/(..)(..)x/page.tsx', 'app/tools/(...)y/page.tsx'])
    expect(PARALLEL_OR_INTERCEPT.test(f), f).toBe(true)
  for (const f of ['app/portal/[clientSlug]/reports/page.tsx', 'app/portal/[clientSlug]/team/team-panel.tsx', 'app/dashboard/(group)/x/page.tsx'])
    expect(SPECIAL.test(f) || PARALLEL_OR_INTERCEPT.test(f), f).toBe(false)
  expect(['app/portal/x/page.ts', 'app/portal/x/page.jsx', 'app/portal/x/page.js'].every((f) => /\/page\.[jt]sx?$/.test(f))).toBe(true)
})
