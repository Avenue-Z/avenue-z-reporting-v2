// @vitest-environment node
// Every API route in the app, listed by hand. Adding a route means adding it here on purpose, and removing one means
// taking it off. This reads the source tree, so a route is covered the day it lands, wherever it is under app/.
import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, sep } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = process.cwd()
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx|mjs)$/

/** Every route handler under app/, named by its folder relative to app/ (for example 'api/cache-warm'). A colocated
 *  test such as route.test.ts is not a route. */
function routesUnderApp(): string[] {
  return readdirSync(join(ROOT, 'app'), { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .filter((f) => ROUTE_FILE.test(posix.basename(f)))
    .map((f) => posix.dirname(f))
    .sort()
}

const ROUTES = [
  // AEO Outbound (Tools > New Business): each checks the session itself, outside the proxy matcher; snapshot/[token] is
  // the public, no-login link a prospect opens.
  'api/aeo-outbound/generate',
  'api/aeo-outbound/progress',
  'api/aeo-outbound/projects',
  'api/aeo-outbound/reports',
  'api/aeo-outbound/reports/[id]/slots',
  'api/aeo-outbound/reports/[id]/view',
  'snapshot/[token]',
  'api/auth/[...nextauth]',
  'api/auth/supermetrics-callback',
  'api/cache-warm',
  'api/discovery/sm-dimension-values',
  'api/export/pdf',
  'api/health/sweep',
  'api/lock-sweep',
  'api/perf/boundary',
  'api/shopify/callback',
  'api/shopify/install',
]

test('every API route is listed here, so adding one is deliberate', () => {
  expect(routesUnderApp()).toEqual([...ROUTES].sort())
})

// A scheduled job calls its route every hour or so. Removing that route while the job stays in vercel.json would leave
// the job failing on every run, so each cron path has to be on the list above.
test('every cron in vercel.json calls a route on this list', () => {
  const crons = (JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).crons ?? []) as { path: string }[]
  // vercel.json has crons today; if they are ever all removed, delete this line.
  expect(crons.length).toBeGreaterThan(0)
  const paths = crons.map((c) => c.path.replace(/^\//, '').split('?')[0])
  expect(paths.filter((p) => !ROUTES.includes(p))).toEqual([])
})
