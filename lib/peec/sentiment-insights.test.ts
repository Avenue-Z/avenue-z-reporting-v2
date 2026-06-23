// lib/peec/sentiment-insights.test.ts
// Run: npx tsx lib/peec/sentiment-insights.test.ts
// FB-026: unit tests for the Sentiment Insights helper. Two parts:
//   - applyEnginesFilter:  per-engine filter, drops URLs with no engines
//                          when a filter is active, no-op when models=null.
//   - modelKeyOf:          stable cache key fragment.
import { strict as assert } from 'node:assert'
import { applyEnginesFilter, modelKeyOf } from './sentiment-insights'
import type { UrlCitation } from './url-citations'

function makeCitation(over: Partial<UrlCitation>): UrlCitation {
  return {
    url: 'https://example.com/a',
    urlKey: 'example.com/a',
    domain: 'example.com',
    classification: 'editorial',
    title: null,
    citationCount: 1,
    citationRate: 0,
    citationAvg: 0,
    engines: [],
    mentionedBrandIds: [],
    competitorBrandNames: [],
    mentionsYourBrand: false,
    ...over,
  }
}

// --- applyEnginesFilter ---

// models=null returns input unchanged
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: [] })
  const out = applyEnginesFilter([a, b], null)
  assert.equal(out.length, 2)
}

// models=[] (empty array) is treated like null and returns input unchanged
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const out = applyEnginesFilter([a], [])
  assert.equal(out.length, 1)
}

// models=[ChatGPT] keeps only citations cited by ChatGPT
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: ['Perplexity'] })
  const c = makeCitation({ url: 'c', engines: ['ChatGPT', 'Gemini'] })
  const out = applyEnginesFilter([a, b, c], ['ChatGPT'])
  assert.deepEqual(out.map(x => x.url), ['a', 'c'])
}

// models=[ChatGPT, Gemini] keeps citations matching ANY of the selected
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: ['Gemini'] })
  const c = makeCitation({ url: 'c', engines: ['Perplexity'] })
  const out = applyEnginesFilter([a, b, c], ['ChatGPT', 'Gemini'])
  assert.deepEqual(out.map(x => x.url), ['a', 'b'])
}

// citations with no engines at all are DROPPED when a filter is active
// (no model-specific signal — same rule as filteredMatchbackRows in pr-influence.tsx)
{
  const noEngines = makeCitation({ url: 'a', engines: [] })
  const out = applyEnginesFilter([noEngines], ['ChatGPT'])
  assert.deepEqual(out, [])
}

// --- modelKeyOf ---

// null → 'all'
assert.equal(modelKeyOf(null), 'all')

// empty array → 'all'
assert.equal(modelKeyOf([]), 'all')

// single model → that model name
assert.equal(modelKeyOf(['ChatGPT']), 'ChatGPT')

// multiple models → sorted comma-join (stable cache key)
assert.equal(modelKeyOf(['Perplexity', 'ChatGPT']), 'ChatGPT,Perplexity')
assert.equal(modelKeyOf(['ChatGPT', 'Perplexity']), 'ChatGPT,Perplexity')

console.log('lib/peec/sentiment-insights.test.ts: all assertions passed')
