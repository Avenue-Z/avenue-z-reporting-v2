// lib/peec/url-citations.test.ts
// Run: npx tsx lib/peec/url-citations.test.ts
import { strict as assert } from 'node:assert'
import {
  resolveYourBrandIds,
  mergeUrlCitations,
  aggregateDomainCoverage,
  domainPromptIds,
  domainTagIds,
  type ApiUrlRow,
} from './url-citations'

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

// aggregateDomainCoverage: group prompt/tag-dimensioned URL rows by host
const row = (url: string, extra: Partial<ApiUrlRow>): ApiUrlRow => ({
  url, classification: 'LISTICLE', title: null, channel_title: null,
  usage_count: 1, citation_count: 1, citation_avg: 1, retrievals: 1,
  retrieval_count: 1, citation_rate: 1, mentioned_brands: [], ...extra,
})
const promptRows: ApiUrlRow[] = [
  row('https://www.forbes.com/a', { prompt: { id: 'pr_1' } }),
  row('https://forbes.com/b',     { prompt: { id: 'pr_2' } }),   // same host, www-stripped
  row('https://forbes.com/c',     { prompt: { id: 'pr_1' } }),   // duplicate prompt → deduped
  row('https://edelman.com/x',    { prompt: { id: 'pr_3' } }),
  row('https://edelman.com/y',    {}),                            // no prompt id → ignored
]
const tagRows: ApiUrlRow[] = [
  row('https://www.forbes.com/a', { tag: { id: 'tg_1' } }),
  row('https://forbes.com/b',     { tag: { id: 'tg_2' } }),
  row('https://forbes.com/d',     { tag: { id: 'tg_1' } }),       // duplicate theme → deduped
]
const cov = aggregateDomainCoverage(promptRows, tagRows)
assert.deepEqual(domainPromptIds(cov, 'forbes.com').sort(), ['pr_1', 'pr_2'])
assert.deepEqual(domainPromptIds(cov, 'www.Forbes.com').sort(), ['pr_1', 'pr_2']) // lookup normalizes
assert.deepEqual(domainPromptIds(cov, 'edelman.com'), ['pr_3'])
assert.deepEqual(domainPromptIds(cov, 'unknown.com'), [])         // missing domain → []
assert.deepEqual(domainTagIds(cov, 'forbes.com').sort(), ['tg_1', 'tg_2'])
assert.deepEqual(domainTagIds(cov, 'edelman.com'), [])            // no tag rows → []
// Coverage %: forbes cited in 2 of 4 tracked prompts → 50%
assert.equal(Math.round(domainPromptIds(cov, 'forbes.com').length / 4 * 100), 50)

console.log('url-citations.test.ts: all assertions passed')
