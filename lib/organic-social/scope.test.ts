import { expect, test } from 'vitest'
import { resolveChannels } from './metrics'
import { onChannelError } from './headlines'
import { onTrendChannelError } from './trends'

test('absent allowlist ⇒ all four channels', () => {
  expect(resolveChannels()).toEqual(['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'])
  expect(resolveChannels(null)).toEqual(['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'])
  expect(resolveChannels([])).toEqual(['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'])
})

test('partial allowlist ⇒ subset, in CHANNELS order', () => {
  expect(resolveChannels(['linkedin', 'instagram'])).toEqual(['INSTAGRAM', 'LINKEDIN'])
})

test('allowlist is case-insensitive', () => {
  expect(resolveChannels(['InStAgRaM'])).toEqual(['INSTAGRAM'])
})

test('unknown entries are ignored', () => {
  expect(resolveChannels(['tiktok', 'twitter'])).toEqual(['TWITTER'])
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
