// lib/peec/winners-losers.test.ts
// Run: npx tsx lib/peec/winners-losers.test.ts
// FB-023: unit tests for the Winners/Losers compute. Two parts:
//   - applyModelFilter:    per-model filter + averaging across selected models.
//   - computeWinnersLosers: rank-delta split (winners vs losers), sort + cap.
import { strict as assert } from 'node:assert'
import { applyModelFilter, computeWinnersLosers } from './winners-losers'
import type { TrackedPrompt } from './client'

function makePrompt(over: Partial<TrackedPrompt>): TrackedPrompt {
  return {
    text: 'p',
    sources: [],
    visibility: 0,
    sov: 0,
    position: 0,
    positionByModel: {},
    priorPositionByModel: {},
    group: 'g',
    topicSource: 'inferred',
    ...over,
  }
}

// --- applyModelFilter ---

// with models=null, averages position across all model entries (current period)
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      { ChatGPT: 4, Perplexity: 8, Gemini: 6 },
    priorPositionByModel: { ChatGPT: 10, Perplexity: 12, Gemini: 14 },
  })
  const out = applyModelFilter([p], null)
  assert.equal(out.length, 1)
  assert.equal(out[0].position, 6)
  assert.equal(out[0].priorPosition, 12)
}

// with models=[ChatGPT], averages only ChatGPT entries
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      { ChatGPT: 4, Perplexity: 20 },
    priorPositionByModel: { ChatGPT: 10, Perplexity: 30 },
  })
  const out = applyModelFilter([p], ['ChatGPT'])
  assert.equal(out[0].position, 4)
  assert.equal(out[0].priorPosition, 10)
}

// with models=[ChatGPT, Gemini] averages across both
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      { ChatGPT: 4, Perplexity: 20, Gemini: 6 },
    priorPositionByModel: { ChatGPT: 10, Perplexity: 30, Gemini: 12 },
  })
  const out = applyModelFilter([p], ['ChatGPT', 'Gemini'])
  assert.equal(out[0].position, 5)
  assert.equal(out[0].priorPosition, 11)
}

// skips a prompt entirely when none of the selected models have data for it
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      { Perplexity: 5 },
    priorPositionByModel: { Perplexity: 8 },
  })
  const out = applyModelFilter([p], ['ChatGPT'])
  assert.deepEqual(out, [])
}

// outputs priorPosition=null when the prompt has no prior data for selected models
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      { ChatGPT: 4 },
    priorPositionByModel: {},
  })
  const out = applyModelFilter([p], ['ChatGPT'])
  assert.equal(out[0].position, 4)
  assert.equal(out[0].priorPosition, null)
}

// drops the prompt when current data is empty for selected models, even if prior has data
{
  const p = makePrompt({
    text: 'a',
    positionByModel:      {},
    priorPositionByModel: { ChatGPT: 10 },
  })
  const out = applyModelFilter([p], ['ChatGPT'])
  assert.deepEqual(out, [])
}

// --- computeWinnersLosers ---

// returns empty arrays when input is empty
{
  const { winners, losers } = computeWinnersLosers([])
  assert.deepEqual(winners, [])
  assert.deepEqual(losers, [])
}

// returns empty arrays when no prompts have priorPosition
{
  const { winners, losers } = computeWinnersLosers([
    { text: 'a', position: 5, priorPosition: null },
    { text: 'b', position: 10, priorPosition: null },
  ])
  assert.deepEqual(winners, [])
  assert.deepEqual(losers, [])
}

// classifies a prompt that improved (lower position number) as a winner
{
  const { winners, losers } = computeWinnersLosers([
    { text: 'improved', position: 3, priorPosition: 10 },
  ])
  assert.equal(winners.length, 1)
  assert.deepEqual(winners[0], { text: 'improved', rank: 3, delta: 7 })
  assert.deepEqual(losers, [])
}

// classifies a prompt that declined (higher position number) as a loser
{
  const { winners, losers } = computeWinnersLosers([
    { text: 'declined', position: 15, priorPosition: 8 },
  ])
  assert.equal(losers.length, 1)
  assert.deepEqual(losers[0], { text: 'declined', rank: 15, delta: -7 })
  assert.deepEqual(winners, [])
}

// drops prompts with zero delta (no change)
{
  const { winners, losers } = computeWinnersLosers([
    { text: 'flat', position: 5, priorPosition: 5 },
  ])
  assert.deepEqual(winners, [])
  assert.deepEqual(losers, [])
}

// sorts winners by largest delta first
{
  const { winners } = computeWinnersLosers([
    { text: 'small-win', position: 8, priorPosition: 10 },
    { text: 'big-win',   position: 2, priorPosition: 30 },
    { text: 'mid-win',   position: 5, priorPosition: 15 },
  ])
  assert.deepEqual(winners.map(w => w.text), ['big-win', 'mid-win', 'small-win'])
}

// sorts losers by most-negative delta first
{
  const { losers } = computeWinnersLosers([
    { text: 'small-loss', position: 12, priorPosition: 10 },
    { text: 'big-loss',   position: 40, priorPosition:  5 },
    { text: 'mid-loss',   position: 20, priorPosition:  8 },
  ])
  assert.deepEqual(losers.map(l => l.text), ['big-loss', 'mid-loss', 'small-loss'])
}

// caps winners and losers at 20 rows each by default
{
  const prompts = Array.from({ length: 30 }, (_, i) =>
    ({ text: `w${i}`, position: 1, priorPosition: 30 - i })
  )
  const { winners } = computeWinnersLosers(prompts)
  assert.equal(winners.length, 20)
}

// honors a custom limit
{
  const prompts = Array.from({ length: 30 }, (_, i) =>
    ({ text: `w${i}`, position: 1, priorPosition: 30 - i })
  )
  const { winners } = computeWinnersLosers(prompts, { limit: 5 })
  assert.equal(winners.length, 5)
}

// rounds position and delta to the nearest integer for display
{
  const { winners } = computeWinnersLosers([
    { text: 'frac', position: 3.7, priorPosition: 10.2 },
  ])
  assert.equal(winners[0].rank, 4)
  assert.equal(winners[0].delta, 7)
}

console.log('lib/peec/winners-losers.test.ts: all assertions passed')
