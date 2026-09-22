import { expect, test } from 'vitest'
import { authorOf } from './post-author'

const post = (fields: Record<string, unknown>) => ({ id: 1, ...fields }) as never

test("an Instagram post's author is its handle, lowercased, without @", () => {
  expect(authorOf(post({ instagram_user: { handle: '@Creator_One' } }), 'INSTAGRAM')).toBe('creator_one')
  expect(authorOf(post({ instagram_user: { handle: '@@Creator_One' } }), 'INSTAGRAM')).toBe('creator_one')
  expect(authorOf(post({ instagram_user: { username: 'Brand_Handle' } }), 'INSTAGRAM')).toBe('brand_handle')
  expect(authorOf(post({ instagram_user: { handle: 'first', username: 'second' } }), 'INSTAGRAM')).toBe('first')
})
test('no user, a non-string handle, or an empty one is no author', () => {
  for (const f of [{}, { instagram_user: null }, { instagram_user: {} }, { instagram_user: { handle: 5 } }, { instagram_user: { handle: '' } }]) {
    expect(authorOf(post(f), 'INSTAGRAM')).toBeNull()
  }
})
test('only Instagram has an author', () => {
  for (const ch of ['FACEBOOK', 'LINKEDIN', 'TWITTER'] as const) expect(authorOf(post({ instagram_user: { handle: 'x' } }), ch)).toBeNull()
})
