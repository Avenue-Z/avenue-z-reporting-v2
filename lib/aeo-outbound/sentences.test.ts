import { expect, test } from 'vitest'
import { LIVE_SHAPE_PULL } from './__fixtures__/sentences-live-shape'
import { buildSnapshotData, type MetricDecisions } from './metrics'
import type { PeecPull } from './pull'
import { countText, dataSentences, listText, ordinal, pctText } from './sentences'

const AT = '2026-10-14T13:00:00Z'
const DEFAULTS: MetricDecisions = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' }
const USED = { peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null }
const build = (p: PeecPull = LIVE_SHAPE_PULL, decisions: MetricDecisions = DEFAULTS, used = USED) => buildSnapshotData(p, AT, decisions, used)
const sent = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => dataSentences(build(p, decisions, used))

// Small pulls for the edge cases: brands by [id, name, visibility, share of voice].
const brandPull = (rows: [string, string, number, number | null][], extra: Partial<PeecPull> = {}): PeecPull => {
  const roster = rows.map(([id, name]) => ({ id, name, is_own: id === 'own', domains: [`${id}.example`] }))
  return {
    ...LIVE_SHAPE_PULL,
    roster,
    ownBrand: roster.find((r) => r.is_own)!,
    brands: rows.map(([id, name, v, s]) => ({ brand: { id, name }, visibility: v, share_of_voice: s, position: 2 })),
    domains: [{ domain: 'own.example', classification: 'OWN', retrieved_chat_count: 50, retrieval_count: 60, retrieved_percentage: 0.25, mentioned_brands: [] }, { domain: 'paper.example', classification: 'EDITORIAL', retrieved_chat_count: 40, retrieval_count: 40, mentioned_brands: [] }],
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
    { lead: 'Competitor domain gaps:', text: 'The largest gaps include health-institute.gov at 115 retrievals, medicare-info.gov at 90, retiree-benefits.gov at 60, and seniornews.example at 55.' },
    { lead: 'Limited editorial and UGC presence:', text: 'The domain mix is led by Institutional sources at 62% and Corporate sources at 22%; Editorial represents 2.7% and UGC 3.7%.' },
  ])
  expect(s.methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026: five brands compared, 104 prompts tracked, and answers from Google AI Overview, Gemini UI, and ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
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
  expect(sent(brandPull([['own', 'Own', 0.4, 0.5], ['a', 'A', 0.2, 0.3], ['b', 'B', 0.1, 0.2]])).context).toBe('Competitive context: Own leads at 40% visibility / 50% share of voice, followed by A at 20% / 30%. Own ranks ahead of A and B.')
  expect(sent(brandPull([['a', 'A', 0.3, 0.4], ['own', 'Own', 0.3, 0.35], ['b', 'B', 0.1, 0.2]])).context).toBe('Competitive context: A and Own lead at 30% visibility, with 40% and 35% share of voice. Own ranks ahead of B.')
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['b', 'B', 0.3, 0.3], ['c', 'C', 0.3, 0.3], ['own', 'Own', 0.1, 0.1]])).context).toBe('Competitive context: A, B, and C lead at 30% visibility. Own ranks last of the four brands tracked.')
})

test('context: last, level with the brand, more than five below, a missing share of voice', () => {
  expect(sent(brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by Own at 10% / 10%. Own ranks last of the two brands tracked.')
  expect(sent(brandPull([['a', 'A', 0.5, 0.5], ['b', 'B', 0.2, 0.2], ['own', 'Own', 0.2, 0.25], ['c', 'C', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 50% visibility / 50% share of voice, followed by B at 20% / 20%. Own is level with B and ranks ahead of C.')
  const many = brandPull([['a', 'A', 0.6, 0.5], ['own', 'Own', 0.5, 0.4], ...['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i): [string, string, number, number] => [x, x.toUpperCase(), 0.4 - i * 0.05, 0.1])])
  expect(sent(many).context).toBe('Competitive context: A leads at 60% visibility / 50% share of voice, followed by Own at 50% / 40%. Own ranks ahead of B, C, D, E, F, and 2 more.')
  expect(sent(brandPull([['a', 'A', 0.3, null], ['own', 'Own', 0.2, 0.2], ['b', 'B', 0.1, 0.1]])).context).toBe('Competitive context: A leads at 30% visibility, followed by Own at 20% / 20%. Own ranks ahead of B.')
})

test('context: brands with no Peec row rank below the brand, and only the brand has a row', () => {
  const noRow = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const withZed = { ...noRow, roster: [...noRow.roster, { id: 'z', name: 'Zed', is_own: false, domains: ['z.example'] }] }
  expect(sent(withZed).context).toBe('Competitive context: A leads at 30% visibility / 30% share of voice, followed by Own at 20% / 20%. Own ranks ahead of Zed.')
  const alone = { ...brandPull([['own', 'Own', 0.2, 1]]), roster: [{ id: 'own', name: 'Own', is_own: true, domains: [] }, { id: 'z', name: 'Zed', is_own: false, domains: [] }, { id: 'y', name: 'Yew', is_own: false, domains: [] }] }
  expect(sent(alone).context).toBe('Competitive context: Own leads at 20% visibility; the other two brands tracked have no Peec data in this window.')
  const oneOther = { ...alone, roster: alone.roster.slice(0, 2) }
  expect(sent(oneOther).context).toBe('Competitive context: Own leads at 20% visibility; the other brand tracked has no Peec data in this window.')
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
  expect(s.context).toBe('No competitors are tracked in this Peec project.')
  expect(s.competitive_bullets[0]).toEqual({ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers.' })
  expect(s.sources_bullets.map((b) => b.lead)).toEqual(['Source mix:'])
  expect(s.methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026: the brand alone, 104 prompts tracked, and answers from Google AI Overview, Gemini UI, and ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
  const bare = sent(solo, DEFAULTS, { ...USED, methodologyStatesPromptsAndModels: false })
  expect(bare.methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026, for the brand alone. Results are directional and intended to identify areas for deeper analysis.')
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
  const big = (n: number) => Array.from({ length: n }, (_, i) => ({ domain: `big${i}.example`, classification: 'EDITORIAL', retrieved_chat_count: 5000, retrieval_count: 1, mentioned_brands: [] }))
  const own = (chats: number, pct: number | null = 0.3) => ({ domain: 'own.example', classification: 'OWN', retrieved_chat_count: chats, retrieval_count: 9, ...(pct === null ? {} : { retrieved_percentage: pct }), mentioned_brands: [] })
  expect(sent({ ...base, domains: [own(1949), ...big(10)] }).competitive_bullets[1]).toEqual({ lead: 'Own-site retrievals:', text: 'Own.example appears in approximately 1.9K retrievals.' })
  expect(sent({ ...base, domains: [own(1949), ...big(9)] }).competitive_bullets[1]).toEqual({ lead: 'Present in the source ecosystem:', text: 'Own.example appears among the top domains at approximately 1.9K retrievals.' })
  const none = sent({ ...base, domains: big(2) })
  expect(none.competitive_bullets.slice(1)).toEqual([{ lead: 'Own-site retrievals:', text: "Own's own site was not retrieved in this window." }])
  const zero = sent({ ...base, domains: [own(0), ...big(2)] })
  expect(zero.competitive_bullets.slice(1)).toEqual([{ lead: 'Own-site retrievals:', text: "Own's own site was not retrieved in this window." }])
  expect(sent({ ...base, domains: [own(40, null), ...big(2)] }).competitive_bullets).toHaveLength(2)
  const two = { ...base, ownBrand: { ...base.ownBrand, domains: ['own.example', 'shop.own.example'] }, domains: [own(40, 0.3), { domain: 'shop.own.example', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 5, retrieved_percentage: 0.02, mentioned_brands: [] }] }
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

test('competitor domain gaps: none, one, two, thousands', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const gap = (domain: string, chats: number) => ({ domain, classification: 'EDITORIAL', retrieved_chat_count: chats, retrieval_count: 1, mentioned_brands: [{ id: 'a' }] })
  const leads = (domains: PeecPull['domains']) => sent({ ...base, domains: [...base.domains, ...domains] }).sources_bullets.map((b) => b.lead)
  expect(leads([])).toEqual(['Leadership gap:', 'Source mix:'])
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 12)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 12 retrievals.')
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 1200), gap('two.example', 9)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 1.2K retrievals and two.example at 9.')
})

test('source mix: Editorial or UGC in the top two, one type only, empty, the own-site slice, a custom type', () => {
  const mixOf = (rows: [string, number][]) => {
    const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
    return sent({ ...base, domains: rows.map(([classification, w], i) => ({ domain: `d${i}.example`, classification, retrieved_chat_count: 1, retrieval_count: w, mentioned_brands: [] })) }).sources_bullets.at(-1)
  }
  expect(mixOf([['EDITORIAL', 50], ['CORPORATE', 30], ['UGC', 20]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is led by Editorial sources at 50% and Corporate sources at 30%; UGC represents 20%.' })
  expect(mixOf([['CORPORATE', 100]])).toEqual({ lead: 'Source mix:', text: 'The domain mix is all Corporate sources.' })
  expect(mixOf([['CORPORATE', 0]])).toEqual({ lead: 'Source mix:', text: 'Peec reported no source types for this window.' })
  expect(mixOf([['OWN', 60], ['Vendors & Platforms', 40]])).toEqual({ lead: 'Limited editorial and UGC presence:', text: 'The domain mix is led by own-site sources at 60% and Vendors & Platforms sources at 40%; Editorial represents 0.0% and UGC 0.0%.' })
})

test('methodology: only the prompt count, only the models, neither', () => {
  const p = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  expect(sent({ ...p, models: [] }).methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026: two brands compared and 104 prompts tracked. Results are directional and intended to identify areas for deeper analysis.')
  expect(sent({ ...p, promptCount: null, models: ['ChatGPT UI'] }).methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026: two brands compared and answers from ChatGPT UI. Results are directional and intended to identify areas for deeper analysis.')
  expect(sent({ ...p, promptCount: null, models: [] }).methodology).toBe('Snapshot based on Peec AI data for Sep 20, 2026 to Sep 21, 2026, comparing two brands. Results are directional and intended to identify areas for deeper analysis.')
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
