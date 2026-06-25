// lib/peec/slope-chart.test.ts
// Run: npx tsx lib/peec/slope-chart.test.ts
import { strict as assert } from 'node:assert'
import { computeSlopeChart } from './slope-chart'

const emptyInput = {
  aiReferralByPath: new Map(),
  organicByPath: new Map(),
  citationShareByUrlKey: new Map(),
}

// Empty input -> empty points, metric preserved.
{
  const r = computeSlopeChart('ai-referral', emptyInput)
  assert.deepEqual(r.points, [])
  assert.equal(r.metric, 'ai-referral')
}

// Each metric reads its own source map.
{
  const input = {
    aiReferralByPath: new Map([['/a', [10, 20] as [number, number]]]),
    organicByPath:    new Map([['/b', [50, 30] as [number, number]]]),
    citationShareByUrlKey: new Map([['/c-key', { prior: 1, current: 4, url: 'https://example.com/c' }]]),
  }
  const ai = computeSlopeChart('ai-referral', input)
  assert.equal(ai.points.length, 1)
  assert.equal(ai.points[0].url, '/a')
  assert.equal(ai.points[0].prior, 10)
  assert.equal(ai.points[0].current, 20)
  assert.equal(ai.points[0].delta, 10)
  assert.equal(ai.points[0].direction, 'gainer')

  const org = computeSlopeChart('organic', input)
  assert.equal(org.points.length, 1)
  assert.equal(org.points[0].url, '/b')
  assert.equal(org.points[0].delta, -20)
  assert.equal(org.points[0].direction, 'loser')

  const cit = computeSlopeChart('citation-share', input)
  assert.equal(cit.points.length, 1)
  assert.equal(cit.points[0].url, 'https://example.com/c')
  assert.equal(cit.points[0].prior, 1)
  assert.equal(cit.points[0].current, 4)
  assert.equal(cit.points[0].direction, 'gainer')
}

// (0, 0) entries are dropped; (n, 0) and (0, n) are kept.
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/dead', [0, 0]],
      ['/new',  [0, 5]],
      ['/gone', [5, 0]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const urls = r.points.map((p) => p.url).sort()
  assert.deepEqual(urls, ['/gone', '/new'])
}

// Direction classification: gainer / loser / flat
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/up',   [10, 20]],
      ['/down', [20, 10]],
      ['/flat', [10, 10]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const byUrl = Object.fromEntries(r.points.map((p) => [p.url, p.direction]))
  assert.equal(byUrl['/up'],   'gainer')
  assert.equal(byUrl['/down'], 'loser')
  assert.equal(byUrl['/flat'], 'flat')
}

// Ranking: top 15 by absolute delta, descending.
{
  // 17 pages with deltas 1, 2, 3, ..., 17. Top 15 should be deltas 3..17 (15 entries).
  const pairs: Array<[string, [number, number]]> = []
  for (let i = 1; i <= 17; i++) {
    pairs.push([`/p${i}`, [0, i]])
  }
  const input = { ...emptyInput, aiReferralByPath: new Map(pairs) }
  const r = computeSlopeChart('ai-referral', input)
  assert.equal(r.points.length, 15)
  // First point should be the biggest mover (delta = 17).
  assert.equal(r.points[0].delta, 17)
  // Last point should be the smallest mover that made the cut (delta = 3).
  assert.equal(r.points[14].delta, 3)
  // Pages with deltas 1 and 2 dropped.
  const urls = new Set(r.points.map((p) => p.url))
  assert.ok(!urls.has('/p1'))
  assert.ok(!urls.has('/p2'))
}

// Ranking treats absolute value of delta: a loser of -50 beats a gainer of +10.
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/big-loss',  [100, 50]],   // delta = -50, |delta| = 50
      ['/small-win', [10, 20]],    // delta = +10, |delta| = 10
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  assert.equal(r.points[0].url, '/big-loss')
  assert.equal(r.points[1].url, '/small-win')
}

// Topic derives via labelFromPath from `@/lib/url`. Root path is "Home".
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/blog/foo-bar', [0, 5]],
      ['/',             [0, 3]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const byUrl = Object.fromEntries(r.points.map((p) => [p.url, p.topic]))
  assert.equal(byUrl['/blog/foo-bar'], 'Foo Bar')
  assert.equal(byUrl['/'],             'Home')
}

console.log('slope-chart.test.ts: all assertions passed')
