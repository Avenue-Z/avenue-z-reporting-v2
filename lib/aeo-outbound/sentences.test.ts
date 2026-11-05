import { expect, test } from 'vitest'
import { LIVE_SHAPE_PULL } from './__fixtures__/sentences-live-shape'
import { buildSnapshotData, type MetricDecisions, type SnapshotData } from './metrics'
import type { PeecPull } from './pull'
import { boxesV2, countText, dataSentences, listText, OLDER_BOXES, ordinal, ownDomainText, pctText } from './sentences'
import { PILLARS } from './config'

const AT = '2026-10-14T13:00:00Z'
const DEFAULTS: MetricDecisions = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' }
const USED = { peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null }
const build = (p: PeecPull = LIVE_SHAPE_PULL, decisions: MetricDecisions = DEFAULTS, used = USED) => buildSnapshotData(p, AT, decisions, used)
// The tests below pin today's boxes, which stay as boxesV2 for rows written before version 3 (spec 2026-10-22 B3): the
// context and methodology come from today's writer, the boxes from boxesV2.
const sent = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => { const d = build(p, decisions, used); return { ...dataSentences(d), ...boxesV2(d) } }
// Today's writer (spec 2026-10-22): the boxes as Ryan worded them.
const now = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => dataSentences(build(p, decisions, used))
// A row stored before version 4 has no citations, so it keeps the version 3 Cited Sources box (spec 2026-11-02 S5).
const v3Row = (d: SnapshotData): SnapshotData => { const { citations: _c, ...rest } = d; return { ...rest, sentences: 3 } }
const v3 = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => dataSentences(v3Row(build(p, decisions, used)))

// Small pulls for the edge cases: brands by [id, name, visibility, share of voice].
const brandPull = (rows: [string, string, number, number | null][], extra: Partial<PeecPull> = {}): PeecPull => {
  const roster = rows.map(([id, name]) => ({ id, name, is_own: id === 'own', domains: [`${id}.example`] }))
  return {
    ...LIVE_SHAPE_PULL,
    roster,
    ownBrand: roster.find((r) => r.is_own)!,
    brands: rows.map(([id, name, v, s]) => ({ brand: { id, name }, visibility: v, share_of_voice: s, position: 2 })),
    domains: [{ domain: 'own.example', classification: 'OWN', retrieved_chat_count: 50, retrieval_count: 60, usage_rate: 60, citation_count: 60, cited_chat_count: 50, total_chat_count: 10000, retrieved_percentage: 0.25, mentioned_brands: [] }, { domain: 'paper.example', classification: 'EDITORIAL', retrieved_chat_count: 40, retrieval_count: 40, usage_rate: 40, citation_count: 40, cited_chat_count: 40, total_chat_count: 10000, mentioned_brands: [] }],
    ...extra,
  }
}

test('the live-shape fixture gives every sentence in Ryan\'s format, with Peec\'s numbers', () => {
  const s = sent()
  expect(s.context).toBe('Competitive context: Carefinder leads at 98% visibility / 99.8% share of voice, followed by Caringly at 1.3% / 0.1%. Example Senior Living ranks ahead of Seniorway and Petalcare.')
  expect(s.competitive_bullets).toEqual([
    { lead: 'Category position:', text: 'Example Senior Living ranks third among the five brands tracked, with 1.1% visibility and 0.1% share of voice.' },
    { lead: 'Present in the source ecosystem:', text: 'Examplesenior.com appears among the top domains at 142 retrievals.' },
    { lead: 'Source-use signal:', text: 'Example Senior Living is used as a source in 26% of tracked answers.' },
  ])
  expect(s.sources_bullets).toEqual([
    { lead: 'Leadership gap:', text: 'Example Senior Living trails Carefinder by 96.7 percentage points in visibility and 99.7 points in share of voice; it trails Caringly by 0.2 points in visibility and matches it in share of voice.' },
    { lead: 'Competitor domain gaps:', text: 'The largest gaps include caringly.example at 8 retrievals and rival-landing.example at 5.' },
    { lead: 'Limited editorial and UGC presence:', text: 'The domain mix is led by Institutional sources at 62% and Corporate sources at 22%; Editorial represents 2.7% and UGC 3.7%.' },
  ])
  expect(s.methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026: five brands compared, 104 prompts tracked, and answers from Google AI Overview, Gemini UI, and ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
})

test('Ryan\'s Ualett example, rebuilt from its numbers, reads as his page does', () => {
  const p = brandPull([['earnin', 'EarnIn', 0.26, 0.22], ['dave', 'Dave', 0.19, 0.17], ['own', 'Ualett', 0.151, 0.159], ['brigit', 'Brigit', 0.12, 0.1], ['giggle', 'Giggle', 0.08, 0.07], ['ml', 'MoneyLion', 0.07, 0.06], ['chime', 'Chime', 0.06, 0.05]])
  const s = sent(p)
  expect(s.context).toBe('Competitive context: EarnIn leads at 26% visibility / 22% share of voice, followed by Dave at 19% / 17%. Ualett ranks ahead of Brigit, Giggle, MoneyLion, and Chime.')
  expect(s.competitive_bullets[0]).toEqual({ lead: 'Strong category position:', text: 'Ualett ranks third among the seven brands tracked, with 15% visibility and 16% share of voice.' })
  expect(s.sources_bullets[0]).toEqual({ lead: 'Leadership gap:', text: 'Ualett trails EarnIn by 10.9 percentage points in visibility and 6.1 points in share of voice; it trails Dave by 3.9 and 1.1 points, respectively.' })
})

test('formatters: percents, counts, ordinals, lists', () => {
  expect([pctText(15.1), pctText(14.5), pctText(10), pctText(9.9), pctText(1.3), pctText(0), pctText(99.8), pctText(99.4), pctText(100)]).toEqual(['15%', '15%', '10%', '9.9%', '1.3%', '0.0%', '99.8%', '99%', '100%'])
  expect([countText(999), countText(1000), countText(1949), countText(9950), countText(999949), countText(999950), countText(1250000)]).toEqual(['999', '1.0K', '1.9K', '10.0K', '999.9K', '1.0M', '1.3M'])
  expect([1, 2, 3, 10, 11, 20, 21, 22, 23, 111, 112].map(ordinal)).toEqual(['first', 'second', 'third', 'tenth', 'eleventh', 'twentieth', '21st', '22nd', '23rd', '111th', '112th'])
  expect([listText(['A']), listText(['A', 'B']), listText(['A', 'B', 'C'])]).toEqual(['A', 'A and B', 'A, B, and C'])
})

test('context: the brand leads, level at the top, three level at the top', () => {
  expect(sent(brandPull([['own', 'Own', 0.4, 0.5], ['a', 'A', 0.2, 0.3], ['b', 'B', 0.1, 0.2]])).context).toBe('Competitive context: Own leads at 40% visibility / 50% share of voice, followed by A at 20% / 30%. Own also ranks ahead of B.')
  expect(sent(brandPull([['a', 'A', 0.3, 0.4], ['own', 'Own', 0.3, 0.35], ['b', 'B', 0.1, 0.2]])).context).toBe('Competitive context: A and Own lead at 30% visibility, with 40% and 35% share of voice. Own ranks ahead of B.')
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['b', 'B', 0.3, 0.3], ['c', 'C', 0.3, 0.3], ['own', 'Own', 0.1, 0.1]])).context).toBe('Competitive context: A, B, and C lead at 30% visibility. Own ranks last of the four brands tracked.')
})

test('context: last, level with the brand, more than five below, a missing share of voice', () => {
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by Own at 10% / 10%. Own ranks last of the two brands tracked.')
  expect(sent(brandPull([['a', 'A', 0.5, 0.5], ['b', 'B', 0.2, 0.2], ['own', 'Own', 0.2, 0.25], ['c', 'C', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 50% visibility / 50% share of voice, followed by B and Own at 20%. Own is level with B and ranks ahead of C.')
  const many = brandPull([['a', 'A', 0.6, 0.5], ['own', 'Own', 0.5, 0.4], ...['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i): [string, string, number, number] => [x, x.toUpperCase(), 0.4 - i * 0.05, 0.1])])
  expect(sent(many).context).toBe('Competitive context: A leads at 60% visibility / 50% share of voice, followed by Own at 50% / 40%. Own ranks ahead of B, C, D, E, F, and two more.')
  expect(sent(brandPull([['a', 'A', 0.3, null], ['own', 'Own', 0.2, 0.2], ['b', 'B', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 30% visibility, followed by Own at 20% / 20% share of voice. Own ranks ahead of B.')
})

test('context: brands with no Peec row rank below the brand, and only the brand has a row', () => {
  const noRow = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const withZed = { ...noRow, roster: [...noRow.roster, { id: 'z', name: 'Zed', is_own: false, domains: ['z.example'] }] }
  expect(sent(withZed).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by Own at 20% / 20%. Own ranks ahead of Zed.')
  const alone = { ...brandPull([['own', 'Own', 0.2, 1]]), roster: [{ id: 'own', name: 'Own', is_own: true, domains: [] }, { id: 'z', name: 'Zed', is_own: false, domains: [] }, { id: 'y', name: 'Yew', is_own: false, domains: [] }] }
  expect(sent(alone).context).toBe('Competitive context: Own leads at 20% visibility; the other two brands tracked have no data in this window.')
  const oneOther = { ...alone, roster: alone.roster.slice(0, 2) }
  expect(sent(oneOther).context).toBe('Competitive context: Own leads at 20% visibility; the other brand tracked has no data in this window.')
})

test('zero visibility: never first, strong or ahead of brands tied at zero', () => {
  const zero = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0, 0]])
  const withZed = { ...zero, roster: [...zero.roster, { id: 'z', name: 'Zed', is_own: false, domains: [] }] }
  const s = sent(withZed)
  expect(s.context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice. Own has 0.0% visibility in this window.')
  expect(s.competitive_bullets[0]).toEqual({ lead: 'Category position:', text: 'Own shows 0.0% visibility among the three brands tracked.' })
  const allZero = brandPull([['a', 'A', 0, 0], ['own', 'Own', 0, 0]])
  expect(sent(allZero).context).toBe('Competitive context: No brand tracked shows visibility in this window.')
  expect(sent(allZero).sources_bullets[0]).toEqual({ lead: 'Leadership gap:', text: 'No brand tracked shows visibility in this window.' })
})

test('no competitors: the hidden context slot, the visibility bullet, no leadership bullet, the brand alone in the methodology', () => {
  const solo = brandPull([['own', 'Own', 0.2, 1]])
  const s = sent(solo)
  expect(s.context).toBe('No competitors are tracked in this project.')
  expect(s.competitive_bullets[0]).toEqual({ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers.' })
  expect(s.sources_bullets.map((b) => b.lead)).toEqual(['Source mix:'])
  expect(s.methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026: the brand alone, 104 prompts tracked, and answers from Google AI Overview, Gemini UI, and ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
  const bare = sent(solo, DEFAULTS, { ...USED, methodologyStatesPromptsAndModels: false })
  expect(bare.methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026, for the brand alone. Results are directional and intended to identify areas for deeper analysis.')
})

test('strong category position needs rank 3 or better, the top half, and half the leader\'s visibility', () => {
  const lead = (rows: [string, string, number, number | null][]) => sent(brandPull(rows)).competitive_bullets[0].lead
  expect(lead([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2], ['b', 'B', 0.1, 0.1]])).toBe('Strong category position:')
  expect(lead([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.2, 0.2], ['b', 'B', 0.1, 0.1]])).toBe('Category position:')
  expect(lead([['a', 'A', 0.3, 0.3], ['b', 'B', 0.25, 0.2], ['own', 'Own', 0.2, 0.2]])).toBe('Category position:')
  expect(lead([['own', 'Own', 0.4, 0.4], ['a', 'A', 0.1, 0.1]])).toBe('Strong category position:')
})

test('rankAmong cuts the set: "compared" in context and bullets', () => {
  const p = brandPull([['a', 'A', 0.5, 0.5], ['own', 'Own', 0.3, 0.3], ['b', 'B', 0.2, 0.2], ['c', 'C', 0.1, 0.1]])
  const s = sent(p, { ...DEFAULTS, rankAmong: 3 })
  expect(s.competitive_bullets[0].text).toBe('Own ranks second among the three brands compared, with 30% visibility and 30% share of voice.')
})

test('own site: outside the top ten, approximately for thousands, none retrieved, several own sites, a missing percentage', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const big = (n: number) => Array.from({ length: n }, (_, i) => ({ domain: `big${i}.example`, classification: 'EDITORIAL', retrieved_chat_count: 5000, retrieval_count: 1, usage_rate: 1, citation_count: 1, cited_chat_count: 5000, total_chat_count: 10000, mentioned_brands: [] }))
  const own = (chats: number, pct: number | null = 0.3) => ({ domain: 'own.example', classification: 'OWN', retrieved_chat_count: chats, retrieval_count: 9, usage_rate: 9, citation_count: 9, cited_chat_count: chats, total_chat_count: 10000, ...(pct === null ? {} : { retrieved_percentage: pct }), mentioned_brands: [] })
  expect(sent({ ...base, domains: [own(1949), ...big(10)] }).competitive_bullets[1]).toEqual({ lead: 'Own-site retrievals:', text: 'Own.example appears in approximately 1.9K retrievals.' })
  expect(sent({ ...base, domains: [own(1949), ...big(9)] }).competitive_bullets[1]).toEqual({ lead: 'Present in the source ecosystem:', text: 'Own.example appears among the top domains at approximately 1.9K retrievals.' })
  const none = sent({ ...base, domains: big(2) })
  expect(none.competitive_bullets.slice(1)).toEqual([{ lead: 'Own-site retrievals:', text: "Own's own site was not retrieved in this window." }])
  const zero = sent({ ...base, domains: [own(0), ...big(2)] })
  expect(zero.competitive_bullets.slice(1)).toEqual([{ lead: 'Own-site retrievals:', text: "Own's own site was not retrieved in this window." }])
  expect(sent({ ...base, domains: [own(40, null), ...big(2)] }).competitive_bullets).toHaveLength(2)
  const two = { ...base, ownBrand: { ...base.ownBrand, domains: ['own.example', 'shop.own.example'] }, domains: [own(40, 0.3), { domain: 'shop.own.example', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 5, usage_rate: 5, citation_count: 5, cited_chat_count: 5, total_chat_count: 10000, retrieved_percentage: 0.02, mentioned_brands: [] }] }
  expect(sent(two).competitive_bullets[2]).toEqual({ lead: 'Source-use signal:', text: 'Own.example is used as a source in 30% of tracked answers.' })
})

test('leadership: the brand first, level at the top, alone with data, negative and missing share of voice', () => {
  const lb = (rows: [string, string, number, number | null][]) => sent(brandPull(rows)).sources_bullets[0]
  expect(lb([['own', 'Own', 0.4, 0.3], ['a', 'A', 0.2, 0.1]])).toEqual({ lead: 'Leadership position:', text: 'Own leads A by 20.0 percentage points in visibility and 20.0 points in share of voice.' })
  expect(lb([['own', 'Own', 0.4, 0.1], ['a', 'A', 0.2, 0.3]])).toEqual({ lead: 'Leadership position:', text: 'Own leads A by 20.0 percentage points in visibility and trails it by 20.0 points in share of voice.' })
  expect(lb([['own', 'Own', 0.4, 0.2], ['a', 'A', 0.2, 0.2]])).toEqual({ lead: 'Leadership position:', text: 'Own leads A by 20.0 percentage points in visibility and matches it in share of voice.' })
  expect(lb([['own', 'Own', 0.4, null], ['a', 'A', 0.2, 0.2]])).toEqual({ lead: 'Leadership position:', text: 'Own leads A by 20.0 percentage points in visibility.' })
  expect(lb([['own', 'Own', 0.3, 0.3], ['a', 'A', 0.3, 0.2], ['b', 'B', 0.1, 0.1]])).toEqual({ lead: 'Leadership position:', text: 'Own is level with A at the top of the three brands tracked.' })
  const alone = { ...brandPull([['own', 'Own', 0.2, 1]]), roster: [{ id: 'own', name: 'Own', is_own: true, domains: [] }, { id: 'z', name: 'Zed', is_own: false, domains: [] }] }
  expect(sent(alone).sources_bullets[0]).toEqual({ lead: 'Leadership position:', text: 'Own ranks first of the two brands tracked.' })
  expect(lb([['a', 'A', 0.5, 0.1], ['own', 'Own', 0.2, 0.3]])).toEqual({ lead: 'Leadership gap:', text: 'Own trails A by 30.0 percentage points in visibility and leads it by 20.0 points in share of voice.' })
  // "respectively" only when the first clause also gave a share-of-voice gap, so it has two things to refer back to.
  expect(lb([['a', 'A', 0.5, null], ['b', 'B', 0.4, 0.3], ['own', 'Own', 0.2, 0.2]])).toEqual({ lead: 'Leadership gap:', text: 'Own trails A by 30.0 percentage points in visibility; it trails B by 20.0 points in visibility and 10.0 points in share of voice.' })
  expect(lb([['a', 'A', 0.5, 0.4], ['b', 'B', 0.4, null], ['own', 'Own', 0.2, 0.2]])).toEqual({ lead: 'Leadership gap:', text: 'Own trails A by 30.0 percentage points in visibility and 20.0 points in share of voice; it trails B by 20.0 points in visibility.' })
  expect(lb([['a', 'A', 0.5, 0.4], ['b', 'B', 0.4, 0.1], ['own', 'Own', 0.2, 0.2]])).toEqual({ lead: 'Leadership gap:', text: 'Own trails A by 30.0 percentage points in visibility and 20.0 points in share of voice; it trails B by 20.0 points in visibility and leads it by 10.0 points in share of voice.' })
  expect(lb([['a', 'A', 0.5, 0.4], ['own', 'Own', 0.2, 0.2]])).toEqual({ lead: 'Leadership gap:', text: 'Own trails A by 30.0 percentage points in visibility and 20.0 points in share of voice.' })
})

test('competitor domain gaps: none, one, two, thousands; a competitor\'s roster site with no mentions counts', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const gap = (domain: string, chats: number) => ({ domain, classification: 'COMPETITOR', retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, citation_count: 1, cited_chat_count: chats, total_chat_count: 10000, mentioned_brands: [{ id: 'a' }] })
  const leads = (domains: PeecPull['domains']) => sent({ ...base, domains: [...base.domains, ...domains] }).sources_bullets.map((b) => b.lead)
  expect(leads([])).toEqual(['Leadership gap:', 'Source mix:'])
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 12)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 12 retrievals.')
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 1200), gap('two.example', 9)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 1.2K retrievals and two.example at 9.')
  expect(sent({ ...base, domains: [...base.domains, { ...gap('a.example', 30), classification: 'CORPORATE', mentioned_brands: [] }] }).sources_bullets[1].text).toBe('The largest gaps include a.example at 30 retrievals.')
})

test('source mix: Editorial or UGC in the top two, one type only, empty, the own-site slice, a custom type', () => {
  const mixOf = (rows: [string, number][]) => {
    const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
    return sent({ ...base, domains: rows.map(([classification, w], i) => ({ domain: `d${i}.example`, classification, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, citation_count: w, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })) }).sources_bullets.at(-1)
  }
  expect(mixOf([['EDITORIAL', 50], ['CORPORATE', 30], ['UGC', 20]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is led by Editorial sources at 50% and Corporate sources at 30%; UGC represents 20%.' })
  expect(mixOf([['CORPORATE', 100]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is all Corporate sources.' })
  // A second type that shows 0.0% is not a leading type (final review M6).
  expect(mixOf([['CORPORATE', 9996], ['OWN', 4]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is almost entirely Corporate sources.' })
  expect(mixOf([['CORPORATE', 0]])).toEqual({ lead: 'Source mix:', text: 'No source types were reported for this window.' })
  expect(mixOf([['OWN', 60], ['Vendors & Platforms', 40]])).toEqual({ lead: 'Limited editorial and UGC presence:', text: 'The domain mix is led by own-site sources at 60% and Vendors & Platforms sources at 40%; Editorial represents 0.0% and UGC 0.0%.' })
  // Paul's review of #388 (C4): "Limited" only when Editorial and UGC are each under 10%, as in Ryan's example (6% and 3%).
  expect(mixOf([['CORPORATE', 45], ['INSTITUTIONAL', 22], ['REFERENCE', 24], ['EDITORIAL', 6], ['UGC', 3]])).toEqual({ lead: 'Limited editorial and UGC presence:', text: 'The domain mix is led by Corporate sources at 45% and Reference sources at 24%; Editorial represents 6.0% and UGC 3.0%.' })
  expect(mixOf([['INSTITUTIONAL', 34], ['CORPORATE', 33], ['EDITORIAL', 31], ['UGC', 2]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is led by Institutional sources at 34% and Corporate sources at 33%; Editorial represents 31% and UGC 2.0%.' })
  expect(mixOf([['CORPORATE', 60], ['INSTITUTIONAL', 25], ['UGC', 10], ['EDITORIAL', 5]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is led by Corporate sources at 60% and Institutional sources at 25%; Editorial represents 5.0% and UGC 10%.' })
})

// 2026-11-05 (Ryan): the Methodology section does not name Peec, in any of its wordings.
test('methodology never names Peec', () => {
  const p = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const solo = brandPull([['own', 'Own', 0.2, 1]])
  const texts = [
    sent(p).methodology,
    sent({ ...p, models: [] }).methodology,
    sent({ ...p, promptCount: null, models: [] }).methodology,
    sent(solo).methodology,
    sent(solo, DEFAULTS, { ...USED, methodologyStatesPromptsAndModels: false }).methodology,
  ]
  expect(texts.every((t) => t.startsWith('Snapshot based on AI visibility data for '))).toBe(true)
  for (const t of texts) expect(t).not.toMatch(/peec/i)
})
test('methodology: only the prompt count, only the models, neither', () => {
  const p = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  expect(sent({ ...p, models: [] }).methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026: two brands compared and 104 prompts tracked. Results are directional and intended to identify areas for deeper analysis.')
  expect(sent({ ...p, promptCount: null, models: ['ChatGPT UI'] }).methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026: two brands compared and answers from ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
  expect(sent({ ...p, promptCount: null, models: [] }).methodology).toBe('Snapshot based on AI visibility data for Sep 20, 2026 to Sep 21, 2026, comparing two brands. Results are directional and intended to identify areas for deeper analysis.')
  expect(sent({ ...p, window: { start: '2026-09-20', end: '2026-09-20' } }).methodology).toContain('for Sep 20, 2026:')
})

test('every box has 1 to 3 bullets in every edge case above', () => {
  const pulls = [LIVE_SHAPE_PULL, brandPull([['own', 'Own', 0.2, 1]]), brandPull([['a', 'A', 0, 0], ['own', 'Own', 0, 0]]), { ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [] }]
  for (const p of pulls) {
    const s = sent(p)
    for (const box of [s.competitive_bullets, s.sources_bullets]) {
      expect(box.length).toBeGreaterThanOrEqual(1)
      expect(box.length).toBeLessThanOrEqual(3)
      for (const b of box) expect(b.lead.length).toBeLessThanOrEqual(80)
    }
  }
})

// Fix round after the Tasks 37 to 40 review.
test('whole percents that would collide in one sentence keep one decimal', () => {
  expect(sent(brandPull([['a', 'A', 0.154, 0.2], ['own', 'Own', 0.146, 0.19], ['b', 'B', 0.05, 0.05]])).context).toBe('Competitive context: A leads at 15.4% visibility / 20% share of voice, followed by Own at 14.6% / 19%. Own ranks ahead of B.')
  const mix = sent({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [['CORPORATE', 454], ['INSTITUTIONAL', 446], ['EDITORIAL', 100]].map(([classification, w], i) => ({ domain: `d${i}.example`, classification: String(classification), retrieved_chat_count: 1, retrieval_count: Number(w), usage_rate: Number(w), citation_count: Number(w), cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })) }).sources_bullets.at(-1)
  // Editorial at 10% is not limited (Paul's review of #388, C4), so the heading is the plain one.
  expect(mix).toEqual({ lead: 'Source mix:', text: 'The domain mix is led by Corporate sources at 45.4% and Institutional sources at 44.6%; Editorial represents 10% and UGC 0.0%.' })
})

test('a tie at second names every brand there; the brand leading names its runner-up once', () => {
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['b', 'B', 0.2, 0.2], ['c', 'C', 0.2, 0.2], ['own', 'Own', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by B and C at 20%. Own ranks last of the four brands tracked.')
  expect(sent(brandPull([['own', 'Own', 0.6, 0.5], ['b', 'B', 0.4, 0.1], ['c', 'C', 0.3, 0.1]])).context).toBe('Competitive context: Own leads at 60% visibility / 50% share of voice, followed by B at 40% / 10%. Own also ranks ahead of C.')
  expect(sent(brandPull([['own', 'Own', 0.6, 0.5], ['b', 'B', 0.4, 0.1]])).context).toBe('Competitive context: Own leads at 60% visibility / 50% share of voice, followed by B at 40% / 10%.')
})

test('zero visibility: the leaders as above, the runner-up included, never the brand itself', () => {
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['b', 'B', 0.2, 0.2], ['own', 'Own', 0, 0]])).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by B at 20% / 20%. Own has 0.0% visibility in this window.')
})

test('long level and top lists are capped like the ranks-ahead list', () => {
  const rows: [string, string, number, number][] = [['own', 'Own', 0.3, 0.3], ...Array.from({ length: 45 }, (_, i): [string, string, number, number] => [`b${i}`, `Brand number ${i} with a long name`, 0.3, 0.3])]
  const s = sent(brandPull(rows))
  expect(s.context.length).toBeLessThan(1000)
  expect(s.context).toContain('and 41 more')
  expect(s.sources_bullets[0].text.length).toBeLessThan(1000)
})

test('a www. own domain reads without it, capitalised', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const s = sent({ ...base, domains: [{ domain: 'www.own.example', classification: 'OWN', retrieved_chat_count: 40, retrieval_count: 40, usage_rate: 40, citation_count: 40, cited_chat_count: 40, total_chat_count: 10000, retrieved_percentage: 0.2, mentioned_brands: [] }] })
  expect(s.competitive_bullets[1].text).toBe('Own.example appears among the top domains at 40 retrievals.')
})

// Review of Tasks 41 to 44: the pairing applies to every pair a sentence names.
test('a tie at second and the source-mix tail keep one decimal where whole numbers would read equal', () => {
  expect(sent(brandPull([['a', 'A', 0.154, 0.2], ['b', 'B', 0.146, 0.1], ['c', 'C', 0.146, 0.1], ['own', 'Own', 0.05, 0.05]])).context).toBe('Competitive context: A leads at 15.4% visibility / 20% share of voice, followed by B and C at 14.6%. Own ranks last of the four brands tracked.')
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const mix = (rows: [string, number][]) => sent({ ...base, domains: rows.map(([classification, w], i) => ({ domain: `d${i}.example`, classification, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, citation_count: w, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })) }).sources_bullets.at(-1)?.text
  expect(mix([['CORPORATE', 500], ['INSTITUTIONAL', 260], ['EDITORIAL', 124], ['UGC', 116]])).toBe('The domain mix is led by Corporate sources at 50% and Institutional sources at 26%; Editorial represents 12.4% and UGC 11.6%.')
})

test('2026-10-20 amendment: a source-mix whole number rounds the exact share, as Peec does, not the stored one decimal', () => {
  const mixOf = (rows: [string, number][]) => {
    const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
    return sent({ ...base, domains: rows.map(([classification, w], i) => ({ domain: `d${i}.example`, classification, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, citation_count: w, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })) }).sources_bullets.at(-1)
  }
  // Corporate's exact share is 24.46 (stored 24.5): Peec shows 24, so the sentence says 24, not 25. UGC keeps its stored
  // decimal (5.5) under 10%, Ryan's format, unchanged.
  expect(mixOf([['INSTITUTIONAL', 6000], ['CORPORATE', 2446], ['EDITORIAL', 1000], ['UGC', 554]])).toEqual({
    lead: 'Source mix:', text: 'The domain mix is led by Institutional sources at 60% and Corporate sources at 24%; Editorial represents 10% and UGC 5.5%.',
  })
})

// Round 3 (Ryan, 2026-10-21): the pillar rows. Domains by [domain, classification, weight].
const dom = ([domain, classification, w]: [string, string, number]) => ({ domain, classification, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, citation_count: w, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })
const pillarsOf = (rows: [string, string, number][], extra: Partial<PeecPull> = {}) =>
  sent({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]], extra), domains: rows.map(dom) }).opportunities
const soloPillars = (rows: [string, string, number][]) => sent({ ...brandPull([['own', 'Own', 0.2, 1]]), domains: rows.map(dom) }).opportunities

test('pillars: the slide names and descriptions in order, and one data line each from the citations', () => {
  const p = pillarsOf([['ed.example', 'EDITORIAL', 19], ['own.example', 'OWN', 4], ['rival.example', 'COMPETITOR', 17], ['corp.example', 'CORPORATE', 60]])
  expect(p.map((o) => o.workstream)).toEqual(PILLARS.map((x) => x.name))
  expect(p.map((o) => o.opportunity)).toEqual(PILLARS.map((x) => x.description))
  expect(p.map((o) => o.signal)).toEqual([
    'Editorial sites make up 19% of citations in this window.',
    "Own's own site makes up 4% of citations in this window.",
    "Competitors' own websites make up 17% of citations in this window.",
  ])
})

test('pillars D3 (a): an own subdomain Peec files under another type counts in the Content line, as the own-site bullet counts it', () => {
  expect(pillarsOf([['own.example', 'OWN', 4], ['blog.own.example', 'CORPORATE', 6], ['corp.example', 'CORPORATE', 90]])[1].signal).toBe("Own's own site makes up 10% of citations in this window.")
  expect(pillarsOf([['blog.own.example', 'CORPORATE', 5], ['corp.example', 'CORPORATE', 95]])[1].signal).toBe("Own's own site makes up 5% of citations in this window.")
  const d = buildSnapshotData({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [['own.example', 'OWN', 4], ['blog.own.example', 'CORPORATE', 6], ['corp.example', 'CORPORATE', 90]].map((r) => dom(r as [string, string, number])) }, AT, DEFAULTS, USED)
  expect(d.ownMixWeight).toBe(10)
})

// Paul, #415 review: an own site Peec files as Editorial or Competitor counts once, in the Content line, never also as
// earned media or a rival's site.
test('pillars: an own site filed as Editorial or Competitor counts in the Content line only', () => {
  expect(pillarsOf([['blog.own.example', 'EDITORIAL', 6], ['news.example', 'EDITORIAL', 14], ['corp.example', 'CORPORATE', 80]]).map((o) => o.signal)).toEqual([
    'Editorial sites make up 14% of citations in this window.',
    "Own's own site makes up 6% of citations in this window.",
    "Competitors' own websites don't appear among citations in this window.",
  ])
  expect(pillarsOf([['blog.own.example', 'EDITORIAL', 6], ['rival.own.example', 'COMPETITOR', 4], ['corp.example', 'CORPORATE', 90]]).map((o) => o.signal)).toEqual([
    "Editorial sites don't appear among citations in this window.",
    "Own's own site makes up 10% of citations in this window.",
    "Competitors' own websites don't appear among citations in this window.",
  ])
})

// Round 3 QA (spec 2026-10-22 F3): the pillar lines round like the source-mix bullet (D5), so one number reads one way.
test('pillars: each share reads exactly as its donut slice (sliceLabel), never a decimal', () => {
  expect(pillarsOf([['ed.example', 'EDITORIAL', 2.4], ['own.example', 'OWN', 3.2], ['rival.example', 'COMPETITOR', 0.6], ['corp.example', 'CORPORATE', 93.8]]).map((o) => o.signal)).toEqual([
    'Editorial sites make up 2% of citations in this window.',
    "Own's own site makes up 3% of citations in this window.",
    "Competitors' own websites make up 1% of citations in this window.",
  ])
  expect(pillarsOf([['own.example', 'OWN', 4.1], ['corp.example', 'CORPORATE', 95.9]])[1].signal).toBe("Own's own site makes up 4% of citations in this window.")
  // Each pillar rounds on its own, as the donut does: two pillars may read alike, but a pillar never reads differently
  // from its donut slice. Dev click-through (A Place for Mom): Editorial 2.6% and own 3.3% read "3%" each, as the donut.
  const alike = pillarsOf([['ed.example', 'EDITORIAL', 2.6], ['own.example', 'OWN', 3.3], ['rival.example', 'COMPETITOR', 0.6], ['corp.example', 'CORPORATE', 93.5]]).map((o) => o.signal)
  expect(alike).toEqual(['Editorial sites make up 3% of citations in this window.', "Own's own site makes up 3% of citations in this window.", "Competitors' own websites make up 1% of citations in this window."])
})

test('pillars: absent slices, a share the donut shows as <1%, an empty mix', () => {
  expect(pillarsOf([['corp.example', 'CORPORATE', 100]]).map((o) => o.signal)).toEqual([
    "Editorial sites don't appear among citations in this window.",
    "Own's own site doesn't appear among citations in this window.",
    "Competitors' own websites don't appear among citations in this window.",
  ])
  expect(pillarsOf([['ed.example', 'EDITORIAL', 0.04], ['corp.example', 'CORPORATE', 99.96]])[0].signal).toBe('Editorial sites make up under 1% of citations in this window.')
  expect(pillarsOf([['corp.example', 'CORPORATE', 0]]).map((o) => o.signal)).toEqual(Array(3).fill('No source types were reported for this window.'))
})

test('pillars: no competitors tracked, a Competitor slice anyway, and an empty mix wins (spec §9 m3)', () => {
  expect(soloPillars([['corp.example', 'CORPORATE', 100]])[2].signal).toBe('No competitors are tracked in this project.')
  expect(soloPillars([['rival.example', 'COMPETITOR', 20], ['corp.example', 'CORPORATE', 80]])[2].signal).toBe("Competitors' own websites make up 20% of citations in this window.")
  expect(soloPillars([['corp.example', 'CORPORATE', 0]])[2].signal).toBe('No source types were reported for this window.')
})

test('pillars: two distinct own domains read "sites"; a repeated or empty entry does not (spec §10 r2-m5)', () => {
  const own = (domains: string[]) => ({ ownBrand: { id: 'own', name: 'Own', is_own: true, domains } })
  expect(pillarsOf([['own.example', 'OWN', 10], ['corp.example', 'CORPORATE', 90]], own(['own.example', 'own2.example']))[1].signal).toBe("Own's own sites make up 10% of citations in this window.")
  expect(pillarsOf([['corp.example', 'CORPORATE', 100]], own(['own.example', 'own2.example']))[1].signal).toBe("Own's own sites don't appear among citations in this window.")
  expect(pillarsOf([['own.example', 'OWN', 10], ['corp.example', 'CORPORATE', 90]], own(['own.example', 'own.example', '']))[1].signal).toBe("Own's own site makes up 10% of citations in this window.")
})

test('pillars: the donut\'s edge labels read in words: under 1% and over 99%', () => {
  expect(pillarsOf([['ed.example', 'EDITORIAL', 0.3], ['corp.example', 'CORPORATE', 99.7]])[0].signal).toBe('Editorial sites make up under 1% of citations in this window.')
  expect(pillarsOf([['ed.example', 'EDITORIAL', 99.6], ['corp.example', 'CORPORATE', 0.4]])[0].signal).toBe('Editorial sites make up over 99% of citations in this window.')
})

test('pillars: shares that differ but round alike read alike, as their donut slices do (round 3 QA, replacing spec §9 m1)', () => {
  const p = pillarsOf([['ed.example', 'EDITORIAL', 17.4], ['rival.example', 'COMPETITOR', 16.6], ['corp.example', 'CORPORATE', 66]])
  // Reversed by the round 3 QA (dev click-through): each pillar rounds as its donut slice does, 17% and 17%.
  expect([p[0].signal, p[2].signal]).toEqual(['Editorial sites make up 17% of citations in this window.', "Competitors' own websites make up 17% of citations in this window."])
})

// Ryan's PocketGuard example, rebuilt from the values measured read only on 2026-10-22 (spec §3).
const POCKETGUARD: PeecPull = (() => {
  const vis: [string, string, number][] = [['ynab', 'YNAB', 0.575], ['monarch', 'Monarch', 0.528], ['monarch_money', 'Monarch Money', 0.512], ['everydollar', 'EveryDollar', 0.394], ['quicken', 'Quicken', 0.387], ['own', 'PocketGuard', 0.333], ['you_need', 'You Need A Budget', 0.309], ['rocket', 'Rocket Money', 0.264]]
  const roster = vis.map(([id, name]) => ({ id, name, is_own: id === 'own', domains: id === 'own' ? ['pocketguard.com'] : [`${id}.example`] }))
  const row = (domain: string, classification: string, weight: number, extra: Record<string, unknown> = {}) => ({ domain, classification, retrieved_chat_count: 10, retrieval_count: weight, usage_rate: weight, citation_count: weight, cited_chat_count: 10, total_chat_count: 10000, mentioned_brands: [], ...extra })
  return {
    ...LIVE_SHAPE_PULL,
    roster,
    ownBrand: roster.find((r) => r.is_own)!,
    brands: vis.map(([id, name, v]) => ({ brand: { id, name }, visibility: v, share_of_voice: 0.1, position: 2 })),
    domains: [
      row('pocketguard.com', 'OWN', 41, { retrieved_chat_count: 678, retrieved_percentage: 0.11758584807492195 }),
      row('corp.example', 'CORPORATE', 367), row('news.example', 'EDITORIAL', 188), row('rival.example', 'COMPETITOR', 171),
      row('gov.example', 'INSTITUTIONAL', 91), row('forum.example', 'UGC', 80), row('wiki.example', 'REFERENCE', 62),
    ],
  }
})()

test('version 3 rows: Ryan\'s PocketGuard example reads word for word as he wrote it', () => {
  const s = v3(POCKETGUARD)
  expect(s.competitive_bullets).toEqual([
    { lead: 'Citation volume:', text: 'PocketGuard.com appears in 678 retrieved citations.' },
    { lead: 'Citation rate:', text: 'PocketGuard is cited in 12% of tracked answers.' },
    { lead: 'Source-type mix:', text: 'Corporate sources account for 37% of citations, followed by Editorial sources at 19%; UGC accounts for 8%.' },
  ])
  expect(s.sources_bullets).toEqual([
    { lead: 'Next-tier gap:', text: 'PocketGuard is 5.4 percentage points behind Quicken in visibility.' },
    { lead: 'Top-tier distance:', text: 'PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%.' },
    { lead: 'Peer cluster:', text: 'PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget.' },
  ])
})

// Paul, #417 review: a rate that rounds to 0.0 after a count above zero reads "under 0.1%", as the pillar lines do.
// Adversarial review of #420 (M3): an Editorial or UGC type that is not in the mix gets no "accounts for 0.0%" clause.
test('round 3: the source-type mix leaves out Editorial or UGC when Peec reports none', () => {
  const noUgc = { ...POCKETGUARD, domains: POCKETGUARD.domains.filter((r) => r.classification !== 'UGC') }
  const text = now(noUgc).competitive_bullets[2].text
  expect(text).not.toMatch(/UGC|0\.0%/)
  expect(text).toMatch(/^Corporate sources account for \d+% of citations, followed by Editorial sources at \d+%\.$/)
})

test('version 3 rows: a citation rate that rounds to 0.0% reads "under 0.1%"', () => {
  const rate = (pct: number) => v3({ ...POCKETGUARD, domains: POCKETGUARD.domains.map((r) => (r.domain === 'pocketguard.com' ? { ...r, retrieved_chat_count: 3, retrieved_percentage: pct } : r)) }).competitive_bullets.slice(0, 2).map((b) => b.text)
  expect(rate(0.0004)).toEqual(['PocketGuard.com appears in 3 retrieved citations.', 'PocketGuard is cited in under 0.1% of tracked answers.'])
  expect(rate(0.0006)[1]).toBe('PocketGuard is cited in 0.1% of tracked answers.')
})

// Blind scorecard (spec 2026-10-22 S2): Ryan's "[Brand domain] appears in [X] retrieved citations." takes the exact count.
test('version 3 rows: citation volume prints the exact count with thousands separators, never "approximately"', () => {
  const vol = (n: number) => v3({ ...POCKETGUARD, domains: POCKETGUARD.domains.map((r) => (r.domain === 'pocketguard.com' ? { ...r, retrieved_chat_count: n } : r)) }).competitive_bullets[0].text
  expect(vol(999)).toBe('PocketGuard.com appears in 999 retrieved citations.')
  expect(vol(1000)).toBe('PocketGuard.com appears in 1,000 retrieved citations.')
  expect(vol(1412)).toBe('PocketGuard.com appears in 1,412 retrieved citations.')
  expect(vol(1412345)).toBe('PocketGuard.com appears in 1,412,345 retrieved citations.')
})

test('version 3 rows: the live-shape fixture in the round 3 boxes', () => {
  const s = v3()
  expect(s.competitive_bullets).toEqual([
    { lead: 'Citation volume:', text: 'Examplesenior.com appears in 142 retrieved citations.' },
    { lead: 'Citation rate:', text: 'Example Senior Living is cited in 26% of tracked answers.' },
    { lead: 'Source-type mix:', text: 'Institutional sources account for 62% of citations, followed by Corporate sources at 22%; Editorial accounts for 3% and UGC for 4%.' },
  ])
  expect(s.sources_bullets).toEqual([
    { lead: 'Next-tier gap:', text: 'Example Senior Living is 0.2 percentage points behind Caringly in visibility.' },
    { lead: 'Top-tier distance:', text: 'Example Senior Living is 32.3 percentage points below the top-three average visibility of 33.4%.' },
    { lead: 'Peer cluster:', text: 'Example Senior Living sits within a 1.1-point visibility range alongside Caringly and Seniorway.' },
    { lead: 'Competitor domain gaps:', text: 'The largest gaps include caringly.example at 8 retrievals and rival-landing.example at 5.' },
  ])
})

const cv = (rows: [string, string, number, number | null][], extra: Partial<PeecPull> = {}) => now(brandPull(rows, extra)).sources_bullets.map((b) => b.text)

test('round 3, Competitive Visibility box: first, level at the top, last, ties above, inside the top three', () => {
  expect(cv([['own', 'Own', 0.5, 0.3], ['a', 'A', 0.4, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is 10.0 percentage points ahead of A in visibility.',
    'Own is 10.0 percentage points above the top-three average visibility of 40.0%.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.5, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is level with A at the top in visibility.',
    'Own is 6.7 percentage points above the top-three average visibility of 43.3%.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['b', 'B', 0.4, 0.2], ['own', 'Own', 0.2, 0.1]])).toEqual([
    'Own is 20.0 percentage points behind B in visibility.',
    'Own is 16.7 percentage points below the top-three average visibility of 36.7%.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['b', 'B', 0.4, 0.2], ['c', 'C', 0.4, 0.2], ['own', 'Own', 0.2, 0.1]])[0]).toBe('Own is 20.0 percentage points behind B and C in visibility.')
  expect(cv([['a', 'A', 0.6, 0.3], ['own', 'Own', 0.5, 0.2], ['b', 'B', 0.4, 0.1], ['c', 'C', 0.3, 0.1], ['d', 'D', 0.2, 0.1]])[1]).toBe('Own matches the top-three average visibility of 50.0%.')
})

// Round 3 QA (spec 2026-10-22 F2): a peer cluster wider than 10 points is not a cluster, so the bullet is left out.
test('peer cluster: 10.0 points is kept, 10.1 and 96.4 are left out', () => {
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.45, 0.2], ['b', 'B', 0.4, 0.1]])[2]).toBe('Own sits within a 10.0-point visibility range alongside A and B.')
  const wide = cv([['a', 'A', 0.501, 0.3], ['own', 'Own', 0.45, 0.2], ['b', 'B', 0.4, 0.1]])
  expect(wide).toHaveLength(2)
  expect(wide.some((t) => t.includes('range alongside'))).toBe(false)
  // The A Place for Mom shape from staging QA: Care 98.6, the brand 3.1, Caring 2.2.
  const apfm = cv([['care', 'Care', 0.986, 0.9], ['own', 'Own', 0.031, 0.003], ['caring', 'Caring', 0.022, 0.002]])
  expect(apfm.some((t) => t.includes('range alongside'))).toBe(false)
  expect(apfm[0]).toBe('Own is 95.5 percentage points behind Care in visibility.')
})

// Blind scorecard (spec 2026-10-22 S3, S4): the peers are the two brands closest in visibility, and the top-tier average is
// over the top three brands, the prospect included. The A Place for Mom shape from staging: Care 98.6, the brand 3.1,
// Caring 2.2, Petunia 0.0.
test('peer cluster takes the two closest brands; the top-three average includes the prospect when it ranks there', () => {
  const apfm = cv([['care', 'Care', 0.986, 0.9], ['own', 'Own', 0.031, 0.003], ['caring', 'Caring', 0.022, 0.002], ['petunia', 'Petunia', 0, 0]])
  expect(apfm).toContain('Own is 31.5 percentage points below the top-three average visibility of 34.6%.')
  expect(apfm).toContain('Own sits within a 3.1-point visibility range alongside Caring and Petunia.')
  // Equal distances in tenths are ties, whatever floating point says (adversarial review): Golf and Lima at 0.9 each.
  const float = cv([['alpha', 'Alpha', 0.9, 0.3], ['golf', 'Golf', 0.795, 0.2], ['lima', 'Lima', 0.795, 0.2], ['own', 'Own', 0.786, 0.2], ['charlie', 'Charlie', 0.777, 0.1], ['zulu', 'Zulu', 0.1, 0.1]])
  expect(float).toContain('Own sits within a 0.9-point visibility range alongside Golf and Lima.')
  // Ties in closeness go to the higher-ranked brand.
  const tie = cv([['a', 'A', 0.6, 0.3], ['b', 'B', 0.52, 0.2], ['own', 'Own', 0.5, 0.2], ['c', 'C', 0.48, 0.1], ['d', 'D', 0.2, 0.1]])
  expect(tie).toContain('Own sits within a 4.0-point visibility range alongside B and C.')
})

test('round 3, Competitive Visibility box: one competitor, none tracked, none with data, all at zero, the brand at zero', () => {
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.2, 0.1]])).toEqual(['Own is 30.0 percentage points behind A in visibility.'])
  expect(now(brandPull([['own', 'Own', 0.2, 1]])).sources_bullets).toEqual([{ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers.' }])
  const noData = { brands: [{ brand: { id: 'own', name: 'Own' }, visibility: 0.2, share_of_voice: 1, position: 2 }] }
  expect(now(brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]], noData)).sources_bullets).toEqual([{ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers; no other brand tracked has data in this window.' }])
  expect(cv([['a', 'A', 0, 0], ['own', 'Own', 0, 0]])).toEqual(['No brand tracked shows visibility in this window.'])
  expect(cv([['a', 'A', 0.3, 0.3], ['b', 'B', 0.1, 0.1], ['own', 'Own', 0, 0]])).toEqual([
    'Own is 10.0 percentage points behind B in visibility.',
    'Own is 13.3 percentage points below the top-three average visibility of 13.3%.',
  ])
})

test('round 3, Competitive Visibility box: equal peers, a top-three average with tenths that do not divide evenly, a brand below tenth', () => {
  expect(cv([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.3, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is level with A and B at the top in visibility.',
    'Own matches the top-three average visibility of 30.0%.',
    'Own sits at the same visibility as A and B.',
  ])
  expect(cv([['a', 'A', 0.501, 0.3], ['b', 'B', 0.502, 0.2], ['own', 'Own', 0.2, 0.1]])[1]).toBe('Own is 20.1 percentage points below the top-three average visibility of 40.1%.')
  const many = Array.from({ length: 12 }, (_, i) => [`c${String(i).padStart(2, '0')}`, `C${i}`, 0.7 - i * 0.05, 0.1] as [string, string, number, number])
  const low = cv([...many, ['own', 'Own', 0.1, 0.05]])
  expect(low[0]).toBe('Own is 5.0 percentage points behind C11 in visibility.')
  expect(low[2]).toBe('Own sits within a 10.0-point visibility range alongside C10 and C11.')
})

test('version 3 rows, Cited Sources box: no own site retrieved; two own sites print the domain the same way in both bullets', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  expect(v3({ ...base, domains: base.domains.filter((r) => r.classification !== 'OWN') }).competitive_bullets.slice(0, 1)).toEqual([{ lead: 'Citation volume:', text: 'Own\'s own site does not appear in any retrieved citations in this window.' }])
  expect(v3({ ...base, domains: base.domains.filter((r) => r.classification !== 'OWN') }).competitive_bullets.map((b) => b.lead)).toEqual(['Citation volume:', 'Source-type mix:'])
  const pg = brandPull([['a', 'A', 0.3, 0.3], ['own', 'PocketGuard', 0.2, 0.2]])
  const two: PeecPull = {
    ...pg,
    roster: pg.roster.map((r) => (r.is_own ? { ...r, domains: ['pocketguard.com'] } : r)),
    ownBrand: { ...pg.ownBrand, domains: ['pocketguard.com'] },
    domains: [
      { domain: 'pocketguard.com', classification: 'OWN', retrieved_chat_count: 50, retrieval_count: 60, usage_rate: 60, citation_count: 60, cited_chat_count: 50, total_chat_count: 10000, retrieved_percentage: 0.25, mentioned_brands: [] },
      { domain: 'blog.pocketguard.com', classification: 'OWN', retrieved_chat_count: 20, retrieval_count: 20, usage_rate: 20, citation_count: 20, cited_chat_count: 20, total_chat_count: 10000, mentioned_brands: [] },
      { domain: 'paper.example', classification: 'EDITORIAL', retrieved_chat_count: 40, retrieval_count: 40, usage_rate: 40, citation_count: 40, cited_chat_count: 40, total_chat_count: 10000, mentioned_brands: [] },
    ],
  }
  expect(v3(two).competitive_bullets.slice(0, 2).map((b) => b.text)).toEqual(['PocketGuard.com appears in 50 retrieved citations.', 'PocketGuard.com is cited in 25% of tracked answers.'])
})

test('round 3, the own-domain rule (D6): the brand\'s casing only for a one-word capitalised brand on the first label', () => {
  expect(ownDomainText('pocketguard.com', 'PocketGuard')).toBe('PocketGuard.com')
  expect(ownDomainText('www.pocketguard.com', 'PocketGuard')).toBe('PocketGuard.com')
  expect(ownDomainText('blog.pocketguard.com', 'PocketGuard')).toBe('Blog.pocketguard.com')
  expect(ownDomainText('monarchmoney.com', 'Monarch Money')).toBe('Monarchmoney.com')
  expect(ownDomainText('bunq.com', 'bunq')).toBe('Bunq.com')
  expect(ownDomainText('example.com', 'PocketGuard')).toBe('Example.com')
})

const nowMix = (rows: [string, number][]) => now({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: rows.map(([c, w], i) => ({ domain: `d${i}.example`, classification: c, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, citation_count: w, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [] })) }).competitive_bullets.at(-1)

test('round 3, Source-type mix: edge lines, the own-site type first, and D5\'s whole percents', () => {
  expect(nowMix([])).toEqual({ lead: 'Source-type mix:', text: 'No source types were reported for this window.' })
  expect(nowMix([['CORPORATE', 100]])).toEqual({ lead: 'Source-type mix:', text: 'All citations come from Corporate sources.' })
  expect(nowMix([['CORPORATE', 9996], ['OWN', 4]])).toEqual({ lead: 'Source-type mix:', text: 'Almost all citations come from Corporate sources.' })
  expect(nowMix([['OWN', 60], ['CORPORATE', 40]])!.text).toBe('Own-site sources account for 60% of citations, followed by Corporate sources at 40%.')
  expect(nowMix([['CORPORATE', 60], ['INSTITUTIONAL', 39.5], ['EDITORIAL', 0.4], ['UGC', 0.1]])!.text).toBe('Corporate sources account for 60% of citations, followed by Institutional sources at 40%; Editorial accounts for 0.4% and UGC for 0.1%.')
  expect(nowMix([['CORPORATE', 60], ['INSTITUTIONAL', 28], ['EDITORIAL', 6.4], ['UGC', 5.6]])!.text).toBe('Corporate sources account for 60% of citations, followed by Institutional sources at 28%; Editorial accounts for 6.4% and UGC for 5.6%.')
  expect(nowMix([['CORPORATE', 99.9], ['UGC', 0.1]])!.text).toBe('Corporate sources account for 99.9% of citations, followed by UGC sources at 0.1%.')
})

test('round 3: each new box holds 1 to 4 bullets in every edge case above', () => {
  const pulls = [LIVE_SHAPE_PULL, POCKETGUARD, brandPull([['own', 'Own', 0.2, 1]]), brandPull([['a', 'A', 0, 0], ['own', 'Own', 0, 0]]), brandPull([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.2, 0.1]]), { ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [] }]
  for (const p of pulls) for (const box of [now(p).competitive_bullets, now(p).sources_bullets]) {
    expect(box.length).toBeGreaterThanOrEqual(1)
    expect(box.length).toBeLessThanOrEqual(4)
  }
})

// Any-client sweep, 2026-10-22: wording that broke on real Peec projects (spec 2026-10-22-aeo-outbound-sentence-wording).
test('a single retrieval or prompt reads singular', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const gap = { domain: 'one.example', classification: 'COMPETITOR', retrieved_chat_count: 1, retrieval_count: 1, usage_rate: 1, citation_count: 1, cited_chat_count: 1, total_chat_count: 10000, mentioned_brands: [{ id: 'a' }] }
  expect(now({ ...base, domains: [...base.domains, gap] }).sources_bullets.at(-1)!.text).toBe('The largest gaps include one.example at 1 retrieval.')
  expect(now({ ...base, promptCount: 1, models: [] }).methodology).toContain('two brands compared and 1 prompt tracked.')
})
test('a point range that starts with an 8 reads "an"', () => {
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.45, 0.2], ['b', 'B', 0.413, 0.1]])).toContain('Own sits within an 8.7-point visibility range alongside A and B.')
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.45, 0.2], ['b', 'B', 0.43, 0.1]])).toContain('Own sits within a 7.0-point visibility range alongside A and B.')
})
test('a name that ends in a period never gets a second one', () => {
  const s = now(brandPull([['a', 'Banded', 0.5, 0.3], ['own', 'Own', 0.49, 0.2], ['b', 'Lost Hat Co.', 0.45, 0.1]]))
  expect(s.sources_bullets).toContainEqual({ lead: 'Peer cluster:', text: 'Own sits within a 5.0-point visibility range alongside Banded and Lost Hat Co.' })
  expect(s.context.endsWith('ranks ahead of Lost Hat Co.')).toBe(true)
  expect([s.context, s.methodology, ...s.competitive_bullets.map((b) => b.text), ...s.sources_bullets.map((b) => b.text)].join(' ')).not.toMatch(/[^.]\.\.(\s|$)/)
})

// Spec 2026-11-02 S1, S2: the version 4 Cited Sources box. Rows are [domain, classification, citations, answers citing it].
type CitedRow = [string, string, number, number]
const citedPull = (brand: string, ownDomain: string, rows: CitedRow[], answers: number, extra: Partial<PeecPull> = {}): PeecPull => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', brand, 0.2, 0.2]])
  const ownBrand = { ...base.ownBrand, domains: [ownDomain] }
  return {
    ...base,
    roster: base.roster.map((r) => (r.is_own ? ownBrand : r)),
    ownBrand,
    domains: rows.map(([domain, classification, citations, cited]) => ({ domain, classification, retrieved_chat_count: Math.max(cited, 1), retrieval_count: citations, citation_count: citations, cited_chat_count: cited, total_chat_count: answers, mentioned_brands: [] })),
    ...extra,
  }
}
const filler = (count: number, each: number, prefix = 'site'): CitedRow[] => Array.from({ length: count }, (_, i) => [`${prefix}${i}.example`, 'EDITORIAL', each, 1])
const cited = (p: PeecPull) => now(p).competitive_bullets
const texts4 = (p: PeecPull) => cited(p).map((b) => b.text)

test('S1, S2: one own site cited, as in the spec (A Place for Mom\'s measured numbers)', () => {
  // 3 sites above 731, 1,118 cited sites, 16,287 citations: 3 x 2,000 + 731 + 1,113 x 8 + 652.
  const rows: CitedRow[] = [['big0.example', 'INSTITUTIONAL', 2000, 300], ['big1.example', 'INSTITUTIONAL', 2000, 300], ['big2.example', 'CORPORATE', 2000, 300], ['aplaceformom.com', 'OWN', 731, 441], ...filler(1113, 8), ['last.example', 'UGC', 652, 9]]
  const s = cited(citedPull('A Place for Mom', 'aplaceformom.com', rows, 2004))
  expect(s.slice(0, 2)).toEqual([
    { lead: 'Citation volume:', text: 'Aplaceformom.com earned 731 of the 16,287 citations in AI answers (4%), the fourth most-cited site of 1,118.' },
    { lead: 'Citation rate:', text: 'A Place for Mom is cited in 441 of 2,004 tracked answers (22%).' },
  ])
  expect(s.map((b) => b.lead)).toEqual(['Citation volume:', 'Citation rate:', 'Source-type mix:'])
})

test('S1, S2: several own sites cited: the sum is pooled, the rank is the top site\'s own, the rate is the count by answer', () => {
  const rows: CitedRow[] = [['rival.example', 'COMPETITOR', 2500, 900], ['crocs.com', 'OWN', 2000, 800], ['shop.crocs.com', 'OWN', 572, 400], ...filler(14, 1900), ['tail.example', 'UGC', 149, 5]]
  expect(texts4(citedPull('Crocs', 'crocs.com', rows, 5000, { ownCitedAnswers: 1053 })).slice(0, 2)).toEqual([
    "Crocs's own sites together earned 2,572 of the 31,821 citations in AI answers (8%); Crocs.com alone is the second most-cited site of 18.",
    'Crocs is cited in 1,053 of 5,000 tracked answers (21%).',
  ])
})

test('S1: rank 1, alone or tied with another site, the brand\'s own included, for one own site and for several', () => {
  const one = (rival: number) => texts4(citedPull('Example', 'example.com', [['example.com', 'OWN', 35, 10], ['rival.example', 'COMPETITOR', rival, 9], ['other.example', 'UGC', 30, 8]], 100))[0]
  expect(one(20)).toBe('Example.com earned 35 of the 85 citations in AI answers (41%), the most-cited site of 3.')
  expect(one(35)).toBe('Example.com earned 35 of the 100 citations in AI answers (35%), tied for most cited of 3 sites.')
  const several = (rival: number) => texts4(citedPull('Northwind Health', 'northwind.example', [['northwind.example', 'OWN', 98, 60], ['shop.northwind.example', 'OWN', 20, 15], ['rival.example', 'COMPETITOR', rival, 9]], 300, { ownCitedAnswers: 70 }))[0]
  expect(several(50)).toBe("Northwind Health's own sites together earned 118 of the 168 citations in AI answers (70%); Northwind.example alone is the most-cited site of 3.")
  // Paul, #431 review: tied, the top site is not "alone".
  expect(several(98)).toBe("Northwind Health's own sites together earned 118 of the 216 citations in AI answers (55%); Northwind.example is tied for most cited of 3 sites.")
  const siblings = texts4(citedPull('Northwind Health', 'northwind.example', [['shop.northwind.example', 'OWN', 98, 15], ['northwind.example', 'OWN', 98, 60], ['rival.example', 'COMPETITOR', 20, 9]], 300, { ownCitedAnswers: 70 }))[0]
  expect(siblings).toBe("Northwind Health's own sites together earned 196 of the 216 citations in AI answers (91%); Northwind.example is tied for most cited of 3 sites.")
  // Below rank 1, an own site level with the top one: "alone" would be false, so it is dropped (verification of #431 fixes).
  const secondPlace = texts4(citedPull('Northwind Health', 'northwind.example', [['rival.example', 'COMPETITOR', 120, 9], ['shop.northwind.example', 'OWN', 50, 15], ['northwind.example', 'OWN', 50, 40]], 300, { ownCitedAnswers: 50 }))[0]
  expect(secondPlace).toBe("Northwind Health's own sites together earned 100 of the 220 citations in AI answers (45%); Northwind.example is the second most-cited site of 3.")
})

test('S1, S2: own sites never cited, no own rows, and no citations at all', () => {
  const never = texts4(citedPull('Example Beauty', 'examplebeauty.com', [['examplebeauty.com', 'OWN', 0, 0], ['rival.example', 'COMPETITOR', 3740, 500]], 600))
  expect(never.slice(0, 2)).toEqual(['Examplebeauty.com earned none of the 3,740 citations in AI answers this window.', "Example Beauty isn't cited in any of the 600 tracked answers."])
  const twoNever = texts4(citedPull('Example Beauty', 'examplebeauty.com', [['examplebeauty.com', 'OWN', 0, 0], ['blog.examplebeauty.com', 'OWN', 0, 0], ['rival.example', 'COMPETITOR', 40, 5]], 600))
  expect(twoNever[0]).toBe("Example Beauty's own sites earned none of the 40 citations in AI answers this window.")
  const noOwn = texts4(citedPull('Example Beauty', 'examplebeauty.com', [['rival.example', 'COMPETITOR', 40, 5]], 600))
  expect(noOwn[0]).toBe("Example Beauty's own site earned none of the 40 citations in AI answers this window.")
  const none = texts4(citedPull('Example Beauty', 'examplebeauty.com', [['examplebeauty.com', 'OWN', 0, 0], ['rival.example', 'COMPETITOR', 0, 0]], 600))
  expect(none.slice(0, 2)).toEqual(['No citations in AI answers were recorded this window.', "Example Beauty isn't cited in any of the 600 tracked answers."])
})

test('S1: the share reads as the donut slice does, "under 1%" and "over 99%"; the only cited site; ranks past twenty', () => {
  const tiny = texts4(citedPull('GlowCo', 'glowco.com', [['glowco.com', 'OWN', 1, 1], ...filler(105, 10), ...filler(59, 0, 'quiet'), ['rest.example', 'UGC', 35, 2]], 272))
  expect(tiny.slice(0, 2)).toEqual(['GlowCo.com earned 1 of the 1,086 citations in AI answers (under 1%), the 107th most-cited site of 107.', 'GlowCo is cited in 1 of 272 tracked answers (0.4%).'])
  expect(texts4(citedPull('Example', 'example.com', [['example.com', 'OWN', 995, 9], ['rival.example', 'COMPETITOR', 5, 1]], 10))[0]).toBe('Example.com earned 995 of the 1,000 citations in AI answers (over 99%), the most-cited site of 2.')
  expect(texts4(citedPull('Example', 'example.com', [['example.com', 'OWN', 5, 4], ['quiet.example', 'COMPETITOR', 0, 0]], 10))[0]).toBe('Example.com earned 5 of the 5 citations in AI answers (100%), the only cited site.')
  expect(texts4(citedPull('Example', 'example.com', [['example.com', 'OWN', 1, 1]], 1))).toEqual(['Example.com earned 1 of the 1 citation in AI answers (100%), the only cited site.', 'Example is cited in 1 of 1 tracked answer (100%).', expect.any(String)])
})

test('S2: one decimal under 10%, "under 0.1%" below 0.05%, and no rate bullet when the count by answer failed', () => {
  const rate = (c: number, t: number) => texts4(citedPull('Example', 'example.com', [['example.com', 'OWN', 20, c], ['rival.example', 'COMPETITOR', 40, 5]], t))[1]
  expect(rate(13, 272)).toBe('Example is cited in 13 of 272 tracked answers (4.8%).')
  expect(rate(1, 2295)).toBe('Example is cited in 1 of 2,295 tracked answers (under 0.1%).')
  expect(rate(1, 2000)).toBe('Example is cited in 1 of 2,000 tracked answers (0.1%).')
  const failed = cited(citedPull('Example', 'example.com', [['example.com', 'OWN', 20, 9], ['blog.example.com', 'OWN', 5, 2], ['rival.example', 'COMPETITOR', 40, 5]], 100, { ownCitedAnswers: null }))
  expect(failed.map((b) => b.lead)).toEqual(['Citation volume:', 'Source-type mix:'])
})

test('S5: a row without citations prints exactly the version 3 box, and OLDER_BOXES[3] is that box', () => {
  const d = build(POCKETGUARD)
  const old = v3Row(d)
  expect(dataSentences(old).competitive_bullets).toEqual(v3(POCKETGUARD).competitive_bullets)
  expect(dataSentences(old).competitive_bullets[0].text).toBe('PocketGuard.com appears in 678 retrieved citations.')
  expect(OLDER_BOXES[3](old)).toEqual({ competitive_bullets: dataSentences(old).competitive_bullets, sources_bullets: dataSentences(old).sources_bullets })
  // On a version 4 row the frozen box still prints what version 3 printed, so grounding can allow its numbers.
  expect(OLDER_BOXES[3](d).competitive_bullets[0].text).toBe('PocketGuard.com appears in 678 retrieved citations.')
  expect(dataSentences(d).competitive_bullets[0].text).toMatch(/^PocketGuard\.com earned 41 of the /)
})

// 2026-11-05 (Paul, #440): no sentence the code writes for the page names Peec, on any path, including the rare fallbacks.
test('no code-written sentence names Peec, in any edge case', () => {
  const two = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const solo = brandPull([['own', 'Own', 0.2, 1]])
  const roster = (n: number) => [{ id: 'own', name: 'Own', is_own: true, domains: [] }, { id: 'z', name: 'Zed', is_own: false, domains: [] }, { id: 'y', name: 'Yew', is_own: false, domains: [] }].slice(0, n)
  const texts = (d: ReturnType<typeof now>) => [d.context, d.methodology, ...[...d.competitive_bullets, ...d.sources_bullets].flatMap((b) => [b.lead, b.text]), ...d.opportunities.flatMap((o) => [o.signal, o.opportunity, o.workstream])]
  const cases: [string, PeecPull, string | null][] = [
    ['live shape', LIVE_SHAPE_PULL, null],
    ['two brands', two, null],
    ['no competitors', solo, 'No competitors are tracked in this project.'],
    ['two others with no data', { ...solo, roster: roster(3) }, 'no data in this window.'],
    ['one other with no data', { ...solo, roster: roster(2) }, 'no data in this window.'],
    ['a brand with no data', { ...two, brands: [{ brand: { id: 'own', name: 'Own' }, visibility: 0.2, share_of_voice: 1, position: 2 }] }, 'no other brand tracked has data in this window'],
    ['no source types', { ...two, domains: [] }, 'No source types were reported for this window.'],
    ['no source types, no competitors', { ...solo, domains: [] }, 'No source types were reported for this window.'],
    ['no citations', citedPull('Example Beauty', 'examplebeauty.com', [['examplebeauty.com', 'OWN', 0, 0], ['rival.example', 'COMPETITOR', 0, 0]], 600), 'No citations in AI answers were recorded this window.'],
  ]
  for (const [name, pull, reached] of cases) {
    const all = texts(now(pull))
    for (const t of all) expect(t, `${name}: ${t}`).not.toMatch(/peec/i)
    // The fallback this case exists to reach was reached, so the check is not vacuous.
    if (reached) expect(all.join(' | '), name).toContain(reached)
  }
})
