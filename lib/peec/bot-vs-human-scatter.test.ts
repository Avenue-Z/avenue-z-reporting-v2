// lib/peec/bot-vs-human-scatter.test.ts
// Run: npx tsx lib/peec/bot-vs-human-scatter.test.ts
import { strict as assert } from 'node:assert'
import { computeBotVsHumanScatter, botVsHumanState } from './bot-vs-human-scatter'

// ── Empty input ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map(),
    pathHumans: new Map(),
  })
  assert.deepEqual(result.points, [])
  assert.equal(result.medianBot, 0)
  assert.equal(result.medianHuman, 0)
}

// ── (0, 0) points excluded ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 0], ['/b', 5]]),
    pathHumans: new Map([['/a', 0], ['/b', 0]]),
  })
  assert.equal(result.points.length, 1)
  assert.equal(result.points[0].path, '/b')
  assert.equal(result.points[0].bots, 5)
  assert.equal(result.points[0].humans, 0)
}

// ── Union of keys: path in only one map appears with the other value as 0 ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/only-bot', 3]]),
    pathHumans: new Map([['/only-human', 7]]),
  })
  const paths = result.points.map((p) => p.path).sort()
  assert.deepEqual(paths, ['/only-bot', '/only-human'])
  const onlyBot = result.points.find((p) => p.path === '/only-bot')!
  const onlyHuman = result.points.find((p) => p.path === '/only-human')!
  assert.equal(onlyBot.bots, 3)
  assert.equal(onlyBot.humans, 0)
  assert.equal(onlyHuman.bots, 0)
  assert.equal(onlyHuman.humans, 7)
}

// ── Median computation (odd count) ──
{
  // bots: 1, 2, 3, 4, 5  → median 3
  // humans: 10, 20, 30, 40, 50 → median 30
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 1], ['/b', 2], ['/c', 3], ['/d', 4], ['/e', 5]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 30], ['/d', 40], ['/e', 50]]),
  })
  assert.equal(result.medianBot, 3)
  assert.equal(result.medianHuman, 30)
}

// ── Median computation (even count) ──
{
  // bots: 1, 2, 3, 4 → median (2+3)/2 = 2.5
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 1], ['/b', 2], ['/c', 3], ['/d', 4]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 30], ['/d', 40]]),
  })
  assert.equal(result.medianBot, 2.5)
  assert.equal(result.medianHuman, 25)
}

// ── Quadrant assignment + boundary tie goes to 'low' ──
{
  // Construct so medians fall exactly on a point and verify it lands in 'low'
  // bots: 0, 0, 10, 10 → 4 nonzero needed; (0,0) drops. Use 5 points.
  // bots: 1, 2, 5, 8, 9 → median 5  → /c with bots=5 should be 'low-bot'
  // humans: 10, 20, 50, 80, 90 → median 50 → /c with humans=50 should be 'low-human'
  const result = computeBotVsHumanScatter({
    pathBots:   new Map([['/a', 1], ['/b', 2], ['/c', 5], ['/d', 8], ['/e', 9]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 50], ['/d', 80], ['/e', 90]]),
  })
  assert.equal(result.medianBot, 5)
  assert.equal(result.medianHuman, 50)
  const a = result.points.find((p) => p.path === '/a')!
  const c = result.points.find((p) => p.path === '/c')!
  const e = result.points.find((p) => p.path === '/e')!
  assert.equal(a.quadrant, 'low-bot-low-human')   // 1 < 5, 10 < 50
  assert.equal(c.quadrant, 'low-bot-low-human')   // ties go low (strict >)
  assert.equal(e.quadrant, 'high-bot-high-human') // 9 > 5, 90 > 50
}

// ── Mixed quadrants ──
{
  // bots median 5, humans median 50.
  // /low-low: 1, 10  → low-bot-low-human
  // /high-low: 9, 10 → high-bot-low-human
  // /low-high: 1, 90 → low-bot-high-human
  // /high-high: 9, 90 → high-bot-high-human
  const result = computeBotVsHumanScatter({
    pathBots:   new Map([['/ll', 1], ['/hl', 9], ['/lh', 1], ['/hh', 9], ['/mid1', 5], ['/mid2', 5]]),
    pathHumans: new Map([['/ll', 10], ['/hl', 10], ['/lh', 90], ['/hh', 90], ['/mid1', 50], ['/mid2', 50]]),
  })
  const byPath = Object.fromEntries(result.points.map((p) => [p.path, p.quadrant]))
  assert.equal(byPath['/ll'], 'low-bot-low-human')
  assert.equal(byPath['/hl'], 'high-bot-low-human')
  assert.equal(byPath['/lh'], 'low-bot-high-human')
  assert.equal(byPath['/hh'], 'high-bot-high-human')
}

// ── botVsHumanState: classify renderability so the chart can show an honest
//    empty state instead of a degenerate strip when one axis has no data ──
{
  // No points at all → 'empty'.
  assert.equal(botVsHumanState(computeBotVsHumanScatter({ pathBots: new Map(), pathHumans: new Map() })), 'empty')

  // Humans only (the Renaissance case: GA4 pages exist, Peec bot data is 0) →
  // 'no-bots'. Without this the chart plotted every point at x=0.
  const humansOnly = computeBotVsHumanScatter({
    pathBots: new Map(),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 30]]),
  })
  assert.equal(humansOnly.points.length, 3, 'points exist (so length-0 guard would miss it)')
  assert.equal(botVsHumanState(humansOnly), 'no-bots')

  // Bots only (no GA4 human sessions) → 'no-humans'.
  const botsOnly = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 4], ['/b', 7]]),
    pathHumans: new Map(),
  })
  assert.equal(botVsHumanState(botsOnly), 'no-humans')

  // Both axes have data → 'ok'.
  const both = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 1], ['/b', 5]]),
    pathHumans: new Map([['/a', 10], ['/b', 50]]),
  })
  assert.equal(botVsHumanState(both), 'ok')
}

console.log('bot-vs-human-scatter.test.ts: all assertions passed')
