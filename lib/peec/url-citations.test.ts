// lib/peec/url-citations.test.ts
// Run: npx tsx lib/peec/url-citations.test.ts
import { strict as assert } from 'node:assert'
import { resolveYourBrandIds, mergeUrlCitations, type ApiUrlRow } from './url-citations'

// resolveYourBrandIds: match brand name (case-insensitive) → id(s)
const brands = [
  { brand: { id: 'kw_self', name: 'Avenue Z' } },
  { brand: { id: 'kw_comp', name: 'Edelman' } },
]
assert.deepEqual(resolveYourBrandIds(brands, 'avenue z'), ['kw_self'])
assert.deepEqual(resolveYourBrandIds(brands, 'Unknown'), [])
assert.deepEqual(resolveYourBrandIds(brands, ''), [])

// mergeUrlCitations: base rows + per-engine rows → UrlCitation[]
const base: ApiUrlRow[] = [{
  url: 'https://www.avenuez.com/Blog/Post/', classification: 'LISTICLE', title: 'T',
  channel_title: null, usage_count: 10, citation_count: 30, citation_avg: 3,
  retrievals: 10, retrieval_count: 10, citation_rate: 3,
  mentioned_brands: [{ id: 'kw_self' }, { id: 'kw_comp' }],
}]
const perEngine: ApiUrlRow[] = [
  { ...base[0], model_channel: { id: 'openai-0' } },
  { ...base[0], model_channel: { id: 'perplexity-0' } },
]
const brandNameById = new Map([['kw_self', 'Avenue Z'], ['kw_comp', 'Edelman']])
const merged = mergeUrlCitations(base, perEngine, ['kw_self'], brandNameById)
assert.equal(merged.length, 1)
assert.equal(merged[0].urlKey, 'avenuez.com/blog/post')
assert.equal(merged[0].domain, 'avenuez.com')
assert.equal(merged[0].citationCount, 30)
assert.equal(merged[0].mentionsYourBrand, true)
assert.deepEqual(merged[0].engines.sort(), ['ChatGPT', 'Perplexity'])
// competitor names exclude your own brand
assert.deepEqual(merged[0].competitorBrandNames, ['Edelman'])

// competitor-only URL → mentionsYourBrand false, your brand absent
const compRow: ApiUrlRow[] = [{ ...base[0], url: 'https://edelman.com/x', mentioned_brands: [{ id: 'kw_comp' }] }]
const compMerged = mergeUrlCitations(compRow, [], ['kw_self'], brandNameById)
assert.equal(compMerged[0].mentionsYourBrand, false)
assert.deepEqual(compMerged[0].competitorBrandNames, ['Edelman'])

console.log('url-citations.test.ts: all assertions passed')
