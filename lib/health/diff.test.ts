import { strict as assert } from 'node:assert'
import { diffHealth, formatTransitions } from './diff'
import type { ProbeResult, StoredHealth } from './types'

const obs = (key: string, status: 'ok' | 'down', detail?: string): ProbeResult => {
  const [surface, clientSlug, section] = key.split(':')
  return { key, surface: surface as 'portal' | 'dashboard', clientSlug, section, status, detail }
}

// first sighting → no transition, but it IS upserted (silent seed)
{
  const { transitions, upserts } = diffHealth([], [obs('portal:acme:ga4', 'down', 'boom')])
  assert.equal(transitions.length, 0)
  assert.equal(upserts.length, 1)
}

// ok -> down → one transition with detail
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'ok', detail: null }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'down', 'Missing token')])
  assert.equal(transitions.length, 1)
  assert.equal(transitions[0].from, 'ok')
  assert.equal(transitions[0].to, 'down')
  assert.equal(transitions[0].detail, 'Missing token')
}

// down -> ok → recovery transition
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'down', detail: 'x' }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'ok')])
  assert.equal(transitions.length, 1)
  assert.equal(transitions[0].to, 'ok')
}

// no change → no transition
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'ok', detail: null }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'ok')])
  assert.equal(transitions.length, 0)
}

// formatter: null when empty, formatted lines otherwise
assert.equal(formatTransitions([]), null)
{
  const msg = formatTransitions([
    { key: 'portal:acme:ga4', surface: 'portal', clientSlug: 'acme', section: 'ga4', from: 'ok', to: 'down', detail: 'Missing token' },
    { key: 'dashboard:globex:meta-ads', surface: 'dashboard', clientSlug: 'globex', section: 'meta-ads', from: 'down', to: 'ok' },
  ])!
  assert.match(msg, /acme · portal · ga4 — Missing token/)
  assert.match(msg, /globex · dashboard · meta-ads — recovered/)
  assert.match(msg, /🔴/)
  assert.match(msg, /✅/)
}

console.log('diff.test.ts: all assertions passed')
