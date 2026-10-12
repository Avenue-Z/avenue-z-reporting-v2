// @vitest-environment node
// Every API route in the app, listed by hand. Adding a route means adding it here on purpose, and removing one means
// taking it off. This reads the source tree, so a route is covered the day it lands, wherever it is under app/.
import { readdirSync } from 'node:fs'
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
