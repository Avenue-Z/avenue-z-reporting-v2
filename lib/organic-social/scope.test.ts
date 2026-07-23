import { expect, test } from 'vitest'
import { resolveChannels } from './metrics'
import { onChannelError } from './headlines'

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
