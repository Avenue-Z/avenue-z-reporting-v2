import { strict as assert } from 'node:assert'
import { parseBeacon, deriveStatus } from './derive'
import type { HealthBeacon } from './types'

function html(beacon: HealthBeacon): string {
  const json = JSON.stringify(beacon).replace(/</g, '\\u003c')
  return `<html><body><script id="report-health" type="application/json">${json}</script></body></html>`
}

const okBeacon: HealthBeacon = {
  surface: 'portal', clientSlug: 'acme', section: 'ga4',
  sources: [{ vendor: 'ga4', fn: 'getSessions', ok: true }],
}

// parseBeacon round-trips
assert.deepEqual(parseBeacon(html(okBeacon)), okBeacon)
// parseBeacon returns null when absent
assert.equal(parseBeacon('<html></html>'), null)

// HTTP failure → down regardless of beacon
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 500, html: '' })
  assert.equal(r.status, 'down')
  assert.equal(r.key, 'portal:acme:ga4')
  assert.match(r.detail!, /HTTP 500/)
}

// fetch threw (null status) → down
{
  const r = deriveStatus({ surface: 'dashboard', clientSlug: 'acme', section: 'ga4', httpStatus: null, html: '' })
  assert.equal(r.status, 'down')
}

// 200 but no beacon → down
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: '<html></html>' })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /no health beacon/)
}

// 200 + failed source → down with detail
{
  const bad: HealthBeacon = { surface: 'portal', clientSlug: 'acme', section: 'ga4',
    sources: [{ vendor: 'ga4', fn: 'getSessions', ok: false, error: 'Missing env var' }] }
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(bad) })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /ga4\.getSessions: Missing env var/)
}

// 200 + renderError → down
{
  const errd: HealthBeacon = { surface: 'portal', clientSlug: 'acme', section: 'ga4', sources: [], renderError: 'kaboom' }
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(errd) })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /kaboom/)
}

// 200 + all sources ok → ok
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(okBeacon) })
  assert.equal(r.status, 'ok')
}

console.log('derive.test.ts: all assertions passed')
