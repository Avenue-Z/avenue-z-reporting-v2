import { expect, test } from 'vitest'
import { resolveChannels, resolveTargets } from './metrics'
import { onChannelError } from './headlines'
import { onTrendChannelError } from './trends'

const ALL = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'TIKTOK'] as const

test('absent allowlist ⇒ the four default channels, never a newer one', () => {
  const four = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN']
  expect(resolveChannels()).toEqual(four)
  expect(resolveChannels(null)).toEqual(four)
  expect(resolveChannels([])).toEqual(four)
})

test('partial allowlist ⇒ subset, in CHANNELS order', () => {
  expect(resolveChannels(['linkedin', 'instagram'])).toEqual(['INSTAGRAM', 'LINKEDIN'])
})

test('allowlist is case-insensitive', () => {
  expect(resolveChannels(['InStAgRaM'])).toEqual(['INSTAGRAM'])
})

test('unknown entries are ignored', () => {
  // 'youtube' is the stand-in for unsupported: Dash returns a youtube sub-object and
  // base.ts maps it for display, but it is not in CHANNELS. 'tiktok' used to play this
  // role and cannot any more, now that it is a supported channel.
  expect(resolveChannels(['youtube', 'twitter'])).toEqual(['TWITTER'])
  expect(resolveChannels(['tiktok', 'twitter'])).toEqual(['TWITTER', 'TIKTOK'])
})

// Documents intended behavior (review finding #3): a non-empty allowlist that matches NO
// supported channel collapses to [] — NOT a silent fallback to all four. `[]` is the honest
// answer to "report only these (unsupported) channels"; the safeguard against a typo'd config
// is validation at config-write time, not masking it here. Inert today (no client sets `channels`).
test('an all-unknown allowlist collapses to [] (not a fallback to every channel)', () => {
  expect(resolveChannels(['youtube', 'myspace'])).toEqual([])
})

// resolveTargets (review R2 #2): the empty-targets hole is now a surfaced error, not a blank.
test('unscoped ⇒ all resolved channels, unchanged (Overview is byte-identical)', () => {
  expect(resolveTargets([...ALL], null)).toEqual(ALL)
})

test('scoped to an allowed channel ⇒ just that channel', () => {
  expect(resolveTargets([...ALL], 'TWITTER')).toEqual(['TWITTER'])
})

test('scoped to a channel outside the allowlist THROWS (surfaces, never a silent empty state)', () => {
  // Client allows only IG/FB; a platform subpage for X has nothing to show → error card, not blank.
  expect(() => resolveTargets(['INSTAGRAM', 'FACEBOOK'], 'TWITTER')).toThrow(/not in this client's Organic Social allowlist/)
})

test('scoped view rethrows a channel error', () => {
  const err = new Error('Dash 500')
  expect(() => onChannelError(err, /* scoped */ true)).toThrow('Dash 500')
})

test('unscoped view swallows a channel error to null', () => {
  expect(onChannelError(new Error('Dash 500'), false)).toBeNull()
})

test('scoped trend rethrows a channel error', () => {
  const err = new Error('Dash 500')
  expect(() => onTrendChannelError(err, /* scoped */ true, 'X')).toThrow('Dash 500')
})

test('unscoped trend degrades a channel error to daily:null (dropped by buildTrendSeries)', () => {
  expect(onTrendChannelError(new Error('Dash 500'), false, 'X')).toEqual({ label: 'X', daily: null })
})
