import { expect, test } from 'vitest'
import { handleMatchesNoAuthor, missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate } from './outline-top-content'

const P = (id: number, over: Record<string, unknown> = {}) => ({ id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-02',
  caption: '', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, sourceType: 'organic',
  metrics: { effectiveness: null, engagementRate: 0.01, engagements: 3, impressions: 30 }, ...over }) as never

test('own handles are read from config as lowercase without @; anything else is none', () => {
  expect(parseOwnHandles({ brandId: 1, ownHandles: { instagram: '@Brand_Handle' } })).toEqual({ INSTAGRAM: 'brand_handle' })
  expect(parseOwnHandles({ ownHandles: { instagram: ' @@Brand_Handle ' } })).toEqual({ INSTAGRAM: 'brand_handle' })
  expect(parseOwnHandles({ ownHandles: { instagram: '@' } })).toEqual({})
  for (const c of [{ brandId: 1 }, null, { ownHandles: 'x' }, { ownHandles: { instagram: 5 } }]) expect(parseOwnHandles(c)).toEqual({})
})
test('author rule: another author is a collab post; the client itself is not; unknown falls back to #ad', () => {
  const own = { INSTAGRAM: 'brand_handle' }
  const posts = [P(1, { author: 'creator_one' }), P(2, { author: 'brand_handle' }), P(3, { caption: 'yay #ad' }), P(4)]
  const { owned, influencer } = partitionByAuthor(posts, new Map(), own)
  expect(influencer.map((p: { id: number }) => p.id)).toEqual([1, 3])
  expect(owned.map((p: { id: number }) => p.id)).toEqual([2, 4])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map([[1, 'organic']]), own).owned.map((p: { id: number }) => p.id)).toEqual([1])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map(), {}).owned.map((p: { id: number }) => p.id)).toEqual([1])
})
test('Instagram card rate is engagements over views; no views is no rate; other channels untouched', () => {
  const [ig, igNoViews, fb] = withViewsBasisRate([P(1), P(2, { metrics: { effectiveness: null, engagementRate: 0.5, engagements: 3, impressions: 0 } }), P(3, { channel: 'FACEBOOK' })])
  expect([ig.metrics.engagementRate, igNoViews.metrics.engagementRate, fb.metrics.engagementRate]).toEqual([0.1, null, 0.01])
})
test('owned posts per row: the pin threshold, default 5, whole numbers 1 to 50 only', () => {
  expect([ownedPostLimit(undefined), ownedPostLimit(6), ownedPostLimit(0), ownedPostLimit(51), ownedPostLimit(4.5)]).toEqual([5, 6, 5, 5, 5])
})
test('missing authors: an own handle is set, Instagram posts exist, none carries an author', () => {
  expect(missingAuthors([P(1)], { INSTAGRAM: 'brand_handle' })).toBe(true)
  expect(missingAuthors([P(1, { author: 'brand_handle' })], { INSTAGRAM: 'brand_handle' })).toBe(false)
  expect(missingAuthors([P(1)], {})).toBe(false)
  expect(missingAuthors([], { INSTAGRAM: 'brand_handle' })).toBe(false)
})
test('a stale or mistyped own handle: posts carry authors but none is the handle, so it is not trusted', () => {
  const own = { INSTAGRAM: 'old_handle' }
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle' }), P(2, { author: 'creator_one' }), P(3)], own)).toBe(true)
  expect(handleMatchesNoAuthor([P(1, { author: 'old_handle' }), P(2, { author: 'creator_one' })], own)).toBe(false)
  expect(handleMatchesNoAuthor([P(1), P(2)], own)).toBe(false)
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle' })], {})).toBe(false)
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle', channel: 'FACEBOOK' })], own)).toBe(false)
})

// --- Why the own-handle rule cannot be narrowed (Paul, PR 255, 2026-09-23) -------------------
// He is right that this distrusts a correct handle when nobody from the client posted that
// month, and he suggested narrowing it to "exactly one distinct author, and it is not the
// stored handle", which is what a rename looks like. That cannot be implemented: the two cases
// below hand the function IDENTICAL input and need OPPOSITE answers. The fix is his other
// suggestion, validating the handle when it is saved, which works because at save time the
// handle can be checked against Dash rather than inferred from whoever happened to post.
// Tracked in CLAUDE.md. Until then this pins what the code actually does, including the case
// it gets wrong, because a test asserting the answer we want would be fiction.

test('the own-handle rule cannot separate a rename from a month of partner collabs', () => {
  // Case A, a renamed account: the client DID post, as brand_handle, and one partner collabed.
  // Distrusting is the right answer here.
  const renamed = [P(1, { author: 'brand_handle' }), P(2, { author: 'creator_one' })]
  expect(handleMatchesNoAuthor(renamed, { INSTAGRAM: 'old_handle' })).toBe(true)

  // Case B, a correct handle whose window holds only partner collabs. Distrusting is the WRONG
  // answer here, and today it happens anyway. This is the false positive Paul found, pinned as
  // what the code does rather than what we would like it to do.
  const collabs = [P(1, { author: 'creator_one' }), P(2, { author: 'creator_two' })]
  expect(handleMatchesNoAuthor(collabs, { INSTAGRAM: 'brand_handle' })).toBe(true)

  // Opposite right answers, one answer. Why no rule of this kind can do better: the only thing
  // the rule does with a name is compare it to the handle for equality
  // (outline-top-content.ts:56), so renaming every name at once cannot change what it returns.
  const relabel = (posts: ReturnType<typeof P>[], map: Record<string, string>) =>
    posts.map((p) => {
      const post = p as unknown as { author?: string }
      return { ...post, author: post.author ? map[post.author] ?? post.author : post.author }
    }) as unknown as ReturnType<typeof P>[]

  // Renaming is also the ONLY difference between the two cases: put case A through this map and
  // its authors and handle become case B's, so the rule must answer both the same way.
  const aToB = { old_handle: 'brand_handle', brand_handle: 'creator_one', creator_one: 'creator_two' }
  expect(handleMatchesNoAuthor(relabel(renamed, aToB), { INSTAGRAM: aToB.old_handle }))
    .toBe(handleMatchesNoAuthor(collabs, { INSTAGRAM: 'brand_handle' }))

  // And the invariance itself, against a map that is not the A-to-B one. The third case is the
  // load-bearing one: it is the only fixture here the rule answers FALSE for, so it is the only
  // one where a rule that treats a particular name specially would show up. With only the two
  // cases above, both true, a mutation that also returns true stays invisible to this check.
  const trusted = [P(1, { author: 'old_handle' })] // the handle does match an author: trusted
  expect(handleMatchesNoAuthor(trusted, { INSTAGRAM: 'old_handle' })).toBe(false)
  const anyNames = { old_handle: 'n1', brand_handle: 'n2', creator_one: 'n3', creator_two: 'n4' }
  for (const [posts, handle] of [[renamed, 'old_handle'], [collabs, 'brand_handle'], [trusted, 'old_handle']] as const) {
    expect(handleMatchesNoAuthor(relabel(posts, anyNames), { INSTAGRAM: anyNames[handle as keyof typeof anyNames] }))
      .toBe(handleMatchesNoAuthor(posts, { INSTAGRAM: handle }))
  }
})

// Plan 2026-09-24-qa-fixes §4 (F1): a post another account made that tags the client (UGC) is never
// an owned post, whatever its author field or caption says; a team member's stored choice still wins.
test('a tagged (UGC) post with no author and no #ad is a collab post, not an owned one', () => {
  const own = { INSTAGRAM: 'brand_handle' }
  const { owned, influencer } = partitionByAuthor([P(1, { author: 'brand_handle' }), P(2, { ugc: true })], new Map(), own)
  expect(owned.map((p: { id: number }) => p.id)).toEqual([1])
  expect(influencer.map((p: { id: number }) => p.id)).toEqual([2])
  // With no own handle set the author rule cannot run, and UGC is still never owned.
  expect(partitionByAuthor([P(3, { ugc: true })], new Map(), {}).influencer.map((p: { id: number }) => p.id)).toEqual([3])
})
// Guard: breaks if post.ugc were checked before the stored designation.
test('a stored designation on a UGC post still wins', () => {
  const { owned } = partitionByAuthor([P(1, { ugc: true })], new Map([[1, 'organic']]), { INSTAGRAM: 'brand_handle' })
  expect(owned.map((p: { id: number }) => p.id)).toEqual([1])
})
test('missing authors ignores tagged posts: a month of only UGC is not "missing authors"', () => {
  const own = { INSTAGRAM: 'brand_handle' }
  expect(missingAuthors([P(1, { ugc: true }), P(2, { ugc: true })], own)).toBe(false)
  // Owned posts without an author are still reported.
  expect(missingAuthors([P(1, { ugc: true }), P(2)], own)).toBe(true)
})
