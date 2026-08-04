import { expect, test } from 'vitest'
import { authorizeDesignation } from './mutations'

test('accepts a valid organic/influencer designation with a numeric postId', () => {
  expect(authorizeDesignation({ postId: 42, designation: 'organic' }).ok).toBe(true)
  expect(authorizeDesignation({ postId: 42, designation: 'influencer' }).ok).toBe(true)
})
test('rejects an unknown designation value', () => {
  expect(authorizeDesignation({ postId: 42, designation: 'sponsor' }).ok).toBe(false)
})
test('rejects a non-positive postId', () => {
  expect(authorizeDesignation({ postId: 0, designation: 'organic' }).ok).toBe(false)
})
