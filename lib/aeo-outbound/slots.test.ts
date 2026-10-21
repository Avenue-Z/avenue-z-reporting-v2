import { expect, test } from 'vitest'
import { applySlotPatch, applyStructure, cleanValue, isStructuralPath, limitFor, MAX_BULLETS, MIN_BULLETS, needsValidationPaths, PAGE_KEYS, pageDefaults, slotEntries, STRUCTURE_ERRORS, validateGeneratedSlots, withDefaults, type Slots } from './slots'
import { PAGE_WORDS_V1 } from './config'

const S0: Slots = {
  category: 'Fintech', market: 'United States', headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L1', text: 'T1' }, { lead: 'L2', text: 'T2' }],
  sources_bullets: [{ lead: 'G1', text: 'U1' }, { lead: 'G2', text: 'U2' }],
  why: 'W', opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'M', next_step: 'N',
}
const DATA_STUB = { brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'Competitive rank', value: '#2 of 2 brands' }] }
const S = withDefaults(S0, DATA_STUB)

test('cleanValue trims, strips control characters and collapses whitespace', () => {
  expect(cleanValue('  a \n\t b  ')).toBe('a b')
  expect(cleanValue('brands  today')).toBe('brands today')
  expect(cleanValue('x' + String.fromCharCode(0) + 'y')).toBe('x y')
})

test('every closed path form saves; nothing else does', () => {
  for (const [path] of slotEntries(S)) expect(applySlotPatch(S, path, 'new value').ok).toBe(true)
  for (const bad of ['', 'headline.0', 'competitive_bullets.2.lead', 'opportunities.3.signal', 'opportunities.0.title', '__proto__', 'constructor', 'page.nope', 'page.__proto__', 'page.constructor', 'kpis.2.label', 'kpis.0.other', 'competitive_bullets.add', 'brand.x']) {
    expect(applySlotPatch(S, bad, 'v')).toEqual({ ok: false, error: 'unknown field' })
  }
})

test('values: text only, not empty, within limits; the input is never mutated', () => {
  expect(applySlotPatch(S, 'headline', 5 as unknown as string)).toEqual({ ok: false, error: 'value must be text' })
  expect(applySlotPatch(S, 'headline', '   ').ok).toBe(false)
  expect(applySlotPatch(S, 'competitive_bullets.0.lead', 'x'.repeat(81)).ok).toBe(false)
  expect(applySlotPatch(S, 'why', 'x'.repeat(1001)).ok).toBe(false)
  const r = applySlotPatch(S, 'opportunities.1.workstream', ' PR / earned media ')
  expect(r.ok && r.slots.opportunities[1].workstream).toBe('PR / earned media')
  expect(S.opportunities[1].workstream).toBe('Content / AEO')
})

test('needsValidationPaths finds every slot still marked', () => {
  const r = applySlotPatch(S, 'market', 'Needs validation')
  expect(r.ok && needsValidationPaths(r.slots)).toEqual(['market'])
})

test('needsValidationPaths matches in any letter case', () => {
  for (const v of ['needs validation', 'NEEDS VALIDATION', 'Check this. nEeDs VaLiDaTiOn']) {
    const r = applySlotPatch(S, 'market', v)
    expect(r.ok && needsValidationPaths(r.slots)).toEqual(['market'])
  }
})

const MODEL = {
  headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })),
  methodology: 'M', next_step: 'N',
}
test('accepts a well-formed model reply and merges the fixed fields', () => {
  const r = validateGeneratedSlots(MODEL, { category: 'Fintech', market: 'Needs validation' })
  expect(r.ok && r.slots.category).toBe('Fintech')
  expect(r.ok && r.slots.next_step).toBe('N')
  const f = validateGeneratedSlots(MODEL, { category: 'X', market: 'Y', next_step: 'Fixed sentence.' })
  expect(f.ok && f.slots.next_step).toBe('Fixed sentence.')
})
test('rejects wrong shapes', () => {
  const cases: unknown[] = [
    null, 'text', { ...MODEL, headline: 5 }, { ...MODEL, why: '' },
    { ...MODEL, competitive_bullets: [MODEL.competitive_bullets[0]] },
    { ...MODEL, sources_bullets: [...MODEL.sources_bullets, MODEL.sources_bullets[0]] },
    { ...MODEL, opportunities: MODEL.opportunities.slice(0, 2) },
    { ...MODEL, competitive_bullets: [{ lead: 'x'.repeat(81), text: 't' }, { lead: 'l', text: 't' }] },
  ]
  for (const c of cases) expect(validateGeneratedSlots(c, { category: 'a', market: 'b' }).ok).toBe(false)
})

test('a fixed value that is empty, too long or control-only is a shape error naming the field', () => {
  const empty = validateGeneratedSlots(MODEL, { category: '', market: 'Y' })
  expect(empty.ok).toBe(false)
  expect(!empty.ok && empty.errors.join(' ')).toContain('category')
  const long = validateGeneratedSlots(MODEL, { category: 'C', market: 'x'.repeat(1001) })
  expect(!long.ok && long.errors.join(' ')).toContain('market')
  const blank = validateGeneratedSlots(MODEL, { category: 'C', market: 'Y', next_step: '\n\t' })
  expect(!blank.ok && blank.errors.join(' ')).toContain('next_step')
})

test('a fixed value is cleaned like a generated one, and Needs validation passes', () => {
  const r = validateGeneratedSlots(MODEL, { category: '  Fin\ntech ', market: 'Needs validation' })
  expect(r.ok && [r.slots.category, r.slots.market]).toEqual(['Fin tech', 'Needs validation'])
})

test('spec v1.1 §19.2: context, both boxes and the methodology come from fixed, cleaned and length-checked, with no 2-or-3 count', () => {
  const opinion = { headline: 'H', summary: 'S', why: 'W', opportunities: MODEL.opportunities }
  const code = {
    context: 'Competitive context:  A leads.', methodology: 'Snapshot based on Peec AI data.',
    competitive_bullets: [{ lead: 'Category position:', text: 'Own ranks second.' }],
    sources_bullets: [{ lead: 'Leadership gap:', text: 'Own trails A.' }, { lead: 'Competitor domain gaps:', text: 'x.' }, { lead: 'Source mix:', text: 'y.' }],
  }
  const r = validateGeneratedSlots(opinion, { category: 'C', market: 'M', next_step: 'N.', ...code })
  expect(r.ok).toBe(true)
  expect(r.ok && [r.slots.context, r.slots.methodology]).toEqual(['Competitive context: A leads.', 'Snapshot based on Peec AI data.'])
  expect(r.ok && r.slots.competitive_bullets).toEqual(code.competitive_bullets)
  expect(r.ok && r.slots.sources_bullets).toEqual(code.sources_bullets)
  // Glean's own versions of these keys are ignored when code supplies them.
  const ignored = validateGeneratedSlots({ ...opinion, context: 'Glean context', competitive_bullets: [] }, { category: 'C', market: 'M', next_step: 'N.', ...code })
  expect(ignored.ok && ignored.slots.context).toBe('Competitive context: A leads.')
  const longLead = validateGeneratedSlots(opinion, { category: 'C', market: 'M', next_step: 'N.', ...code, competitive_bullets: [{ lead: 'x'.repeat(81), text: 't' }] })
  expect(!longLead.ok && longLead.errors.join(' ')).toContain('competitive_bullets.0.lead')
  const none = validateGeneratedSlots(opinion, { category: 'C', market: 'M', next_step: 'N.', ...code, sources_bullets: [] })
  expect(!none.ok && none.errors.join(' ')).toContain('sources_bullets')
})

test('an extra key in the reply is ignored: the fixed category wins', () => {
  const r = validateGeneratedSlots({ ...MODEL, category: 'Z' }, { category: 'Fintech', market: 'Y' })
  expect(r.ok).toBe(true)
  expect(r.ok && r.slots.category).toBe('Fintech')
})

test('Q3: an edited category is limited to 80 characters; market keeps 1,000', () => {
  expect(applySlotPatch(S, 'category', 'x'.repeat(80)).ok).toBe(true)
  expect(applySlotPatch(S, 'category', 'x'.repeat(81))).toEqual({ ok: false, error: 'Keep this under 80 characters.' })
  expect(applySlotPatch(S, 'market', 'x'.repeat(81)).ok).toBe(true)
})

test('a row from before v1.1 reads brand, window label and KPIs from its own data and every page word from v1.0', () => {
  expect([S.brand, S.window_label]).toEqual(['Example Co', 'Oct 1, 2026 to Oct 8, 2026'])
  expect(S.kpis).toEqual(DATA_STUB.kpis)
  expect(S.kpis).not.toBe(DATA_STUB.kpis)
  expect(S.page).toEqual(PAGE_WORDS_V1)
  const stored = withDefaults({ ...S0, brand: 'New Co', page: { series: 'Snapshot' } }, DATA_STUB)
  expect(stored.brand).toBe('New Co')
  expect(stored.page).toMatchObject({ series: 'Snapshot', headline_label: 'Headline signal' })
  expect(S0).not.toHaveProperty('brand')
})

test('every page key has a v1.0 default, and no default carries a number', () => {
  expect(Object.keys(PAGE_WORDS_V1).sort()).toEqual([...PAGE_KEYS].sort())
  for (const v of Object.values(PAGE_WORDS_V1)) expect(v).not.toMatch(/\d/)
})

test('a new row takes the section titles and wordmark from settings, the pillar title, and every other word from v1.0', () => {
  expect(pageDefaults({ sectionTitles: ['Strengths', 'Gaps'], sidebarWordmark: 'Avenue Z', series: 'AEO Lens Report' })).toEqual({ ...PAGE_WORDS_V1, section_1_title: 'Strengths', section_2_title: 'Gaps', sidebar_wordmark: 'Avenue Z', series: 'AEO Lens Report', opps_title: 'The Pillars of AI Search' })
})

test('every new path saves within its limit: 120 for page words, KPIs, brand and window label, 1,000 for the footer description and disclaimer', () => {
  expect(limitFor('category')).toBe(80)
  for (const p of ['brand', 'window_label', 'kpis.0.label', 'kpis.1.value', 'page.series', 'page.opps_col_3']) {
    expect(limitFor(p)).toBe(120)
    expect(applySlotPatch(S, p, 'x'.repeat(120)).ok).toBe(true)
    expect(applySlotPatch(S, p, 'x'.repeat(121))).toEqual({ ok: false, error: 'Keep this under 120 characters.' })
  }
  for (const p of ['page.footer_desc', 'page.footer_disclaimer']) {
    expect(applySlotPatch(S, p, 'x'.repeat(1000)).ok).toBe(true)
    expect(applySlotPatch(S, p, 'x'.repeat(1001)).ok).toBe(false)
  }
  const r = applySlotPatch(S, 'kpis.1.value', '#1 of 2 brands')
  expect(r.ok && r.slots.kpis[1]).toEqual({ label: 'Competitive rank', value: '#1 of 2 brands' })
  expect(applySlotPatch(S, 'page.series', '   ')).toEqual({ ok: false, error: "This field can't be empty." })
})

test('add and remove keep every list at one to six bullets; a new bullet says Needs validation (spec v1.1 18.12)', () => {
  expect([MIN_BULLETS, MAX_BULLETS]).toEqual([1, 6])
  expect(isStructuralPath('competitive_bullets.add')).toBe(true)
  for (const i of [0, 1, 2, 3, 4, 5]) expect(isStructuralPath(`sources_bullets.${i}.remove`)).toBe(true)
  for (const p of ['competitive_bullets.6.remove', 'competitive_bullets.9.remove', 'opportunities.add', 'headline', 'competitive_bullets.remove']) expect(isStructuralPath(p)).toBe(false)
  const added = applyStructure(S, 'competitive_bullets.add', 'structure')
  expect(added.ok && added.slots.competitive_bullets).toEqual([...S.competitive_bullets, { lead: 'Needs validation', text: 'Needs validation' }])
  expect(added.ok && needsValidationPaths(added.slots)).toEqual(['competitive_bullets.2.lead', 'competitive_bullets.2.text'])
  const removed = added.ok ? applyStructure(added.slots, 'competitive_bullets.0.remove', 'structure') : null
  expect(removed?.ok && removed.slots.competitive_bullets).toEqual([S.competitive_bullets[1], { lead: 'Needs validation', text: 'Needs validation' }])
  expect(applyStructure(S, 'competitive_bullets.add', '')).toEqual({ ok: false, error: "This field can't be empty." })
  expect(STRUCTURE_ERRORS).toEqual({ full: 'A list can have at most six bullets.', min: 'A list needs at least one bullet.' })
})

const withList = (n: number) => ({ ...S, sources_bullets: Array.from({ length: n }, (_, i) => ({ lead: `G${i}`, text: `U${i}` })) })

test('add at 5 gives 6; add at 6 is refused as at most six (spec v1.1 18.12)', () => {
  const six = applyStructure(withList(5), 'sources_bullets.add', 'structure')
  expect(six.ok && six.slots.sources_bullets).toEqual([...withList(5).sources_bullets, { lead: 'Needs validation', text: 'Needs validation' }])
  expect(six.ok && needsValidationPaths(six.slots)).toEqual(['sources_bullets.5.lead', 'sources_bullets.5.text'])
  expect(applyStructure(withList(6), 'sources_bullets.add', 'structure')).toEqual({ ok: false, error: 'A list can have at most six bullets.' })
  // Each box is counted on its own: a full sources list never blocks an add to the other list.
  expect(applyStructure(withList(6), 'competitive_bullets.add', 'structure').ok).toBe(true)
})

test('remove at 2 gives 1; remove at 1 is refused as at least one; the index is checked first (spec v1.1 18.12)', () => {
  const one = applyStructure(withList(2), 'sources_bullets.1.remove', 'structure')
  expect(one.ok && one.slots.sources_bullets).toEqual([{ lead: 'G0', text: 'U0' }])
  expect(applyStructure(withList(1), 'sources_bullets.0.remove', 'structure')).toEqual({ ok: false, error: 'A list needs at least one bullet.' })
  // An index at or past the end is unknown field, before the minimum is checked.
  expect(applyStructure(withList(3), 'sources_bullets.5.remove', 'structure')).toEqual({ ok: false, error: 'unknown field' })
  expect(applyStructure(withList(1), 'sources_bullets.5.remove', 'structure')).toEqual({ ok: false, error: 'unknown field' })
  expect(applyStructure(withList(1), 'sources_bullets.1.remove', 'structure')).toEqual({ ok: false, error: 'unknown field' })
  // Remove index 4 of 6 takes exactly that bullet, and the input is never mutated.
  const six = withList(6)
  const five = applyStructure(six, 'sources_bullets.4.remove', 'structure')
  expect(five.ok && five.slots.sources_bullets.map((b) => b.lead)).toEqual(['G0', 'G1', 'G2', 'G3', 'G5'])
  expect(six.sources_bullets).toHaveLength(6)
})

test('a bullet past the end of the list is still unknown field for an edit, and bullet 6 edits (spec v1.1 18.12)', () => {
  const r = applySlotPatch(withList(6), 'sources_bullets.5.text', 'Sixth.')
  expect(r.ok && r.slots.sources_bullets[5]).toEqual({ lead: 'G5', text: 'Sixth.' })
  expect(applySlotPatch(withList(3), 'sources_bullets.3.text', 'x')).toEqual({ ok: false, error: 'unknown field' })
})

test('slotEntries lists the page words, the KPIs, the brand and the window label after the copy, and Needs validation anywhere blocks', () => {
  const paths = slotEntries(S).map(([p]) => p)
  expect(paths.slice(-PAGE_KEYS.length)).toEqual(PAGE_KEYS.map((k) => `page.${k}`))
  expect(paths).toEqual(expect.arrayContaining(['brand', 'window_label', 'kpis.0.label', 'kpis.1.value']))
  const r = applySlotPatch(S, 'page.opps_title', 'needs validation')
  expect(r.ok && needsValidationPaths(r.slots)).toEqual(['page.opps_title'])
})

test('method_title is a page word with its default, and an old row without it gets the default (v1.1 §17.14)', () => {
  expect(PAGE_KEYS).toContain('method_title')
  expect(PAGE_WORDS_V1.method_title).toBe('Methodology and next step')
  expect(withDefaults({ ...S0, page: { series: 'Snapshot' } }, DATA_STUB).page.method_title).toBe('Methodology and next step')
  const full = withDefaults(S0, DATA_STUB)
  const r = applySlotPatch(full, 'page.method_title', 'How we measured')
  expect(r.ok && r.slots.page.method_title).toBe('How we measured')
  expect(limitFor('page.method_title')).toBe(120)
})

test('pillars: fixed opportunities replace the reply\'s with no count check (Ryan, round 3)', () => {
  const pillars = [0, 1, 2].map((i) => ({ signal: `line ${i}`, opportunity: `desc ${i}`, workstream: `name ${i}` }))
  // The other code-written fields too, as generation passes them (generate.ts fixed), so only the opportunities differ.
  const fixed = { category: 'c', market: 'm', next_step: 'N', context: 'C', methodology: 'M', competitive_bullets: [{ lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }], opportunities: pillars }
  const r = validateGeneratedSlots({ headline: 'H', summary: 'S', why: 'W' }, fixed)
  expect(r.ok && r.slots.opportunities).toEqual(pillars)
  const r2 = validateGeneratedSlots({ ...MODEL, opportunities: MODEL.opportunities.slice(0, 2) }, fixed)
  expect(r2.ok && r2.slots.opportunities).toEqual(pillars)
})

test('a pillar row leaves the table words out of slotEntries; a table row keeps them', () => {
  const words = ['page.opps_col_1', 'page.opps_col_2', 'page.opps_col_3', 'page.opps_takeaway']
  const table = slotEntries(S).map(([p]) => p)
  const pillar = slotEntries({ ...S, opportunities_layout: 'pillars' }).map(([p]) => p)
  for (const w of words) { expect(table).toContain(w); expect(pillar).not.toContain(w) }
  expect(table.filter((p) => !pillar.includes(p)).sort()).toEqual([...words].sort())
})
