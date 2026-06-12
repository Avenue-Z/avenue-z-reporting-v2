// lib/peec/agent-analytics.test.ts
// Run: npx tsx --env-file=.env.local lib/peec/agent-analytics.test.ts
// (--env-file is required: importing ./agent-analytics transitively loads the DB
//  client, which throws at module init without DATABASE_URL. The helpers under
//  test are pure and need no network.)
import { strict as assert } from 'node:assert'
import { bucketBotType, aggregateVisitsByPath, type RawVisitRow } from './agent-analytics'

// 4 API types → 3 columns
assert.equal(bucketBotType('training'), 'training')
assert.equal(bucketBotType('search'), 'indexing')
assert.equal(bucketBotType('userQuery'), 'indexing')
assert.equal(bucketBotType('other'), 'other')
assert.equal(bucketBotType(null), 'other')

const catalog = new Map<string, { provider: string; type: string }>([
  ['GPTBot', { provider: 'OpenAI', type: 'training' }],
  ['OAI-SearchBot', { provider: 'OpenAI', type: 'search' }],
])
const visits: RawVisitRow[] = [
  { bot_id: 'GPTBot', request_path: '/Guide/', time_bucket: '2026-06-01 00:00:00', visits: 5 },
  { bot_id: 'GPTBot', request_path: '/Guide/', time_bucket: '2026-06-03 00:00:00', visits: 2 },
  { bot_id: 'OAI-SearchBot', request_path: '/guide', time_bucket: '2026-06-02 00:00:00', visits: 4 },
]
const byPath = aggregateVisitsByPath(visits, catalog)
// '/Guide/' and '/guide' canonicalize to the same key
const entry = byPath['/guide']
assert.equal(entry.totalVisits, 11)
assert.equal(entry.byType.training, 7)
assert.equal(entry.byType.indexing, 4)
assert.equal(entry.byType.other, 0)
// dominant bot first (most visits), lastSeen = max day
assert.equal(entry.bots[0].botId, 'GPTBot')
assert.equal(entry.bots[0].visits, 7)
assert.equal(entry.bots[0].lastSeen, '2026-06-03')
assert.equal(entry.bots[0].provider, 'OpenAI')

console.log('agent-analytics.test.ts: all assertions passed')
