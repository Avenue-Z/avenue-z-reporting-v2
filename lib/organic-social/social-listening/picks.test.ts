// Which authors and cards a month shows (plan 2026-11-24, Unit F, F11). Made-up names and numbers only.
import { describe, expect, test } from 'vitest'
import { applyPicks, networkKey, perMention, sortAuthors, type SlPick } from './picks'

const author = (n: number, over: Record<string, unknown> = {}) => ({
  authorId: `id-${n}`, name: `Author ${n}`, network: 'SOCIALMEDIA_INSTAGRAM', posts: 30 - n, pos: 1, neu: 0, neg: 0, reach: 100 * n, engagement: 10 * n, ...over,
})
const SEVEN = Array.from({ length: 7 }, (_, i) => author(i))
const CARDS = [
  { label: 'Most active author', who: 'Author 0', network: 'Instagram', value: 12, unit: 'Posts' },
  { label: 'Most influential author', who: 'Someone Else', network: 'Reddit', value: 9, unit: 'Engagement' },
  { label: 'Most active site', who: 'site.example', network: 'Forums', value: 4, unit: 'Posts' },
]
let n = 0
const pick = (kind: SlPick['kind'], key: string, state: SlPick['state'], at = '2026-11-03T10:00:00.000Z'): SlPick => ({ id: `p${String(n++).padStart(3, '0')}`, kind, key, state, at })
const shownIds = (m: Map<string, boolean>) => [...m].filter(([, v]) => v).map(([k]) => k)

describe('applyPicks', () => {
  test('no picks: the first 5 authors in export order show, the rest do not, every card shows', () => {
    const r = applyPicks(SEVEN, CARDS, [])
    expect(shownIds(r.authors)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])
    expect(shownIds(r.cards)).toEqual(CARDS.map((c) => c.label))
  })

  test('one hide shows the other four; showing a sixth adds it', () => {
    expect(shownIds(applyPicks(SEVEN, CARDS, [pick('author', 'id-2', 'hidden')]).authors)).toEqual(['id-0', 'id-1', 'id-3', 'id-4'])
    expect(shownIds(applyPicks(SEVEN, CARDS, [pick('author', 'id-6', 'shown')]).authors)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4', 'id-6'])
  })

  test('the newest pick for an item wins, by time, then by id when two share a time', () => {
    const later = applyPicks(SEVEN, CARDS, [pick('author', 'id-1', 'hidden', '2026-11-03T10:00:00.000Z'), pick('author', 'id-1', 'shown', '2026-11-03T11:00:00.000Z')])
    expect(later.authors.get('id-1')).toBe(true)
    const older = applyPicks(SEVEN, CARDS, [pick('author', 'id-1', 'shown', '2026-11-03T11:00:00.000Z'), pick('author', 'id-1', 'hidden', '2026-11-03T10:00:00.000Z')])
    expect(older.authors.get('id-1')).toBe(true)
    const tie = applyPicks(SEVEN, CARDS, [{ id: 'b', kind: 'author', key: 'id-1', state: 'hidden', at: 'T' }, { id: 'a', kind: 'author', key: 'id-1', state: 'shown', at: 'T' }])
    expect(tie.authors.get('id-1')).toBe(false)
  })

  test('a pick for an author or card the upload no longer has is ignored', () => {
    const r = applyPicks(SEVEN, CARDS, [pick('author', 'gone', 'shown'), pick('card', 'No such card', 'hidden')])
    expect([...r.authors.keys()]).not.toContain('gone')
    expect([...r.cards.keys()]).toEqual(CARDS.map((c) => c.label))
  })

  test('an author the team hid hides the card with its name and network, though the card writes the network differently', () => {
    const r = applyPicks(SEVEN, CARDS, [pick('author', 'id-0', 'hidden')])
    expect(r.cards.get('Most active author')).toBe(false)
    expect(r.cards.get('Most influential author')).toBe(true)
  })

  test('an author hidden only by default never hides a card; a card pick of its own wins over the author rule', () => {
    const cards = [{ ...CARDS[0], who: 'Author 6' }]
    expect(applyPicks(SEVEN, cards, []).cards.get('Most active author')).toBe(true)
    expect(applyPicks(SEVEN, CARDS, [pick('author', 'id-0', 'hidden'), pick('card', 'Most active author', 'shown')]).cards.get('Most active author')).toBe(true)
    expect(applyPicks(SEVEN, CARDS, [pick('card', 'Most active site', 'hidden')]).cards.get('Most active site')).toBe(false)
  })

  test('the same name on another network does not hide the card', () => {
    const r = applyPicks([author(0, { network: 'SOCIALMEDIA_FACEBOOK' })], CARDS, [pick('author', 'id-0', 'hidden')])
    expect(r.cards.get('Most active author')).toBe(true)
  })

  test('an author id that names an object property stays an ordinary key', () => {
    const odd = [author(0, { authorId: '__proto__' }), author(1, { authorId: 'constructor' })]
    const r = applyPicks(odd, [], [pick('author', '__proto__', 'hidden')])
    expect(r.authors.get('__proto__')).toBe(false)
    expect(r.authors.get('constructor')).toBe(true)
  })
})

describe('networkKey', () => {
  test('the table and the cards spell a network the same way after it', () => {
    expect(networkKey('SOCIALMEDIA_INSTAGRAM')).toBe(networkKey('Instagram'))
    expect(networkKey('SOCIALMEDIA_FACEBOOK')).not.toBe(networkKey('Instagram'))
  })
})

describe('sortAuthors', () => {
  const rows = [
    { name: 'a', posts: 5, reach: 10, engagement: 3 },
    { name: 'b', posts: 9, reach: 10, engagement: 1 },
    { name: 'c', posts: 5, reach: 50, engagement: 2 },
  ]
  test('most first by the chosen measure; ties keep export order', () => {
    expect(sortAuthors(rows, 'posts').map((r) => r.name)).toEqual(['b', 'a', 'c'])
    expect(sortAuthors(rows, 'reach').map((r) => r.name)).toEqual(['c', 'a', 'b'])
    expect(sortAuthors(rows, 'engagement').map((r) => r.name)).toEqual(['a', 'c', 'b'])
  })
})

describe('perMention', () => {
  test('the total over the posts; null with no posts', () => {
    expect(perMention(500, 4)).toBe(125)
    expect(perMention(500, 0)).toBeNull()
  })
})
