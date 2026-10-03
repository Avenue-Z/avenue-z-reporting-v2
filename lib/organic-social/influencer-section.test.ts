import { expect, test } from 'vitest'
import { hiddenInfluencerPlatforms, ignoredInfluencerKeys, influencerLabel, parseInfluencerSection } from './influencer-section'

test('absent is none; a valid hide and a valid label parse', () => {
  expect(parseInfluencerSection(undefined)).toEqual({ kind: 'none' })
  expect(parseInfluencerSection({ INSTAGRAM: { hidden: true } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { hidden: true } } })
  expect(parseInfluencerSection({ INSTAGRAM: { label: '  Partnership Posts ' } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { label: 'Partnership Posts' } } })
  expect(parseInfluencerSection({})).toEqual({ kind: 'ok', section: {} })
})

test('an unknown channel key is ignored, the rest still applies', () => {
  expect(parseInfluencerSection({ instagram: { hidden: true }, MYSPACE: { hidden: true }, FACEBOOK: { hidden: true } }))
    .toEqual({ kind: 'ok', section: { FACEBOOK: { hidden: true } } })
})

test('anything malformed is invalid', () => {
  for (const bad of [null, 'x', 1, [], { INSTAGRAM: true }, { INSTAGRAM: { hidden: false } }, { INSTAGRAM: { hidden: 'yes' } },
    { INSTAGRAM: { label: '' } }, { INSTAGRAM: { label: '   ' } }, { INSTAGRAM: { label: 'x'.repeat(41) } }, { INSTAGRAM: { label: 5 } },
    { INSTAGRAM: { hidden: true, label: 'Both' } }, { INSTAGRAM: {} }, { INSTAGRAM: [] }]) {
    expect(parseInfluencerSection(bad)).toEqual({ kind: 'invalid' })
  }
})

test('hidden platforms are the display labels the gallery groups by', () => {
  expect(hiddenInfluencerPlatforms({ INSTAGRAM: { hidden: true }, FACEBOOK: { label: 'P' }, TWITTER: { hidden: true } }))
    .toEqual(new Set(['Instagram', 'X']))
  expect(hiddenInfluencerPlatforms({})).toEqual(new Set())
})

test('the label applies only on that channel\'s tab; Overview and other tabs get the default (undefined)', () => {
  const s = { INSTAGRAM: { label: 'Partnership Posts' } } as const
  expect(influencerLabel(s, 'INSTAGRAM')).toBe('Partnership Posts')
  expect(influencerLabel(s, 'FACEBOOK')).toBeUndefined()
  expect(influencerLabel(s, null)).toBeUndefined()
  expect(influencerLabel({ INSTAGRAM: { hidden: true } }, 'INSTAGRAM')).toBeUndefined()
})

test('pinned edges: an unknown key is ignored whatever its value; one bad known channel makes the whole setting invalid', () => {
  expect(parseInfluencerSection({ MYSPACE: 'x', INSTAGRAM: { hidden: true } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { hidden: true } } })
  expect(parseInfluencerSection({ INSTAGRAM: { hidden: true }, FACEBOOK: { hidden: 'yes' } })).toEqual({ kind: 'invalid' })
  expect(parseInfluencerSection({ INSTAGRAM: { label: 'x'.repeat(40) } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { label: 'x'.repeat(40) } } })
})

test('pinned edges: JSON prototype keys are ignored and pollute nothing', () => {
  const parsed = parseInfluencerSection(JSON.parse('{"__proto__": {"hidden": true}, "constructor": {"hidden": true}, "INSTAGRAM": {"hidden": true}}'))
  expect(parsed).toEqual({ kind: 'ok', section: { INSTAGRAM: { hidden: true } } })
  expect(({} as Record<string, unknown>).hidden).toBeUndefined()
})

test('a setting\'s hidden or label must be its own key, never inherited', () => {
  const inherited = Object.assign(Object.create({ hidden: true }), { other: 1 })
  expect(parseInfluencerSection({ INSTAGRAM: inherited })).toEqual({ kind: 'invalid' })
})

// Fix list X2: keys the parser skips are reported, naming only a miscased channel; anything else is only counted,
// since a hand-typed key could hold anything.
test('ignored keys: a miscased channel is named, any other unknown key is counted, valid keys are not reported', () => {
  expect(ignoredInfluencerKeys({ Instagram: { hidden: true }, FACEBOOK: { hidden: true } })).toEqual({ miscased: ['Instagram'], other: 0 })
  expect(ignoredInfluencerKeys({ instagram: { label: 'P' }, MYSPACE: {}, 'brand 123456': {} })).toEqual({ miscased: ['instagram'], other: 2 })
  expect(ignoredInfluencerKeys({ INSTAGRAM: { hidden: true } })).toEqual({ miscased: [], other: 0 })
  for (const v of [undefined, null, 'x', [], 5]) expect(ignoredInfluencerKeys(v)).toEqual({ miscased: [], other: 0 })
})
