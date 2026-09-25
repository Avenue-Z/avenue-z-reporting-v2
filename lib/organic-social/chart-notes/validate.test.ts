import { expect, test } from 'vitest'
import { isNoteId, isSeenNote, todayUtc, validateNoteInput } from './validate'

const TODAY = '2026-09-24'
const OK = { channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14', body: 'Influencer post went live', postIds: [11, 12] }
const v = (over: Partial<Record<keyof typeof OK, unknown>>) => validateNoteInput({ ...OK, ...over }, TODAY)

test('a real platform, chart, past day, short note and two posts pass', () => {
  expect(validateNoteInput(OK, TODAY)).toEqual({ ok: true })
  expect(v({ chart: 'engagements', postIds: [] })).toEqual({ ok: true })
})

// Jasmine's outlines put annotations on the Instagram, Facebook, LinkedIn and TikTok graphs (the
// October clients' tabs), so a note must save on every one of them, not only Instagram.
test.each(['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK'])('a note on a %s graph passes', (channel) => {
  expect(v({ channel })).toEqual({ ok: true })
})

test('today passes; tomorrow is refused even when sent directly', () => {
  expect(v({ day: TODAY })).toEqual({ ok: true })
  expect(v({ day: '2026-09-25' })).toEqual({ ok: false, error: 'That day has not happened yet.' })
})

test('unknown platform, unknown chart and impossible days are refused', () => {
  expect(v({ channel: 'MYSPACE' })).toEqual({ ok: false, error: 'invalid channel' })
  expect(v({ chart: 'reach' })).toEqual({ ok: false, error: 'invalid chart' })
  expect(v({ day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
  expect(v({ day: '8/14/2026' })).toEqual({ ok: false, error: 'invalid day' })
  expect(v({ channel: 7 })).toEqual({ ok: false, error: 'invalid channel' })
})

test('a note is 1 to 80 characters after trimming, counted as characters', () => {
  expect(v({ body: '   ' })).toEqual({ ok: false, error: 'A note is 1 to 80 characters.' })
  expect(v({ body: 'x'.repeat(80) })).toEqual({ ok: true })
  expect(v({ body: 'x'.repeat(81) })).toEqual({ ok: false, error: 'A note is 1 to 80 characters.' })
  expect(v({ body: '🎉'.repeat(80) })).toEqual({ ok: true })
  expect(v({ body: `  ${'x'.repeat(80)}  ` })).toEqual({ ok: true })
  expect(v({ body: 42 })).toEqual({ ok: false, error: 'invalid note' })
})

test('a note is one line of plain text: no line breaks, tabs or other control characters', () => {
  for (const body of ['two\nlines', 'tab\there', 'bell\u0007', 'del\u007f']) {
    expect(v({ body })).toEqual({ ok: false, error: 'A note is one line of plain text.' })
  }
})

test('at most 2 posts, each a positive whole number, no repeats', () => {
  const refused = { ok: false, error: 'Pick at most 2 posts.' }
  expect(v({ postIds: [1, 2, 3] })).toEqual(refused)
  expect(v({ postIds: [5, 5] })).toEqual(refused)
  expect(v({ postIds: [0] })).toEqual(refused)
  expect(v({ postIds: [-1] })).toEqual(refused)
  expect(v({ postIds: [1.5] })).toEqual(refused)
  expect(v({ postIds: ['11'] })).toEqual(refused)
  expect(v({ postIds: '11' })).toEqual(refused)
})

test('a note id is a uuid, so a bad id never reaches the database', () => {
  expect(isNoteId('c7d8e0a1-1111-4111-8111-111111111111')).toBe(true)
  for (const id of ['', 'abc', "1' OR '1'='1", 7, null]) expect(isNoteId(id)).toBe(false)
})

test('what an approver was shown is a text and at most 2 post ids', () => {
  expect(isSeenNote({ text: 'Went live', postIds: [11] })).toBe(true)
  expect(isSeenNote({ text: '', postIds: [] })).toBe(true)
  for (const bad of [null, 'x', { text: 1, postIds: [] }, { text: 'x' }, { text: 'x', postIds: [1, 2, 3] }, { text: 'x', postIds: [0] }]) {
    expect(isSeenNote(bad)).toBe(false)
  }
})

test('today is the UTC date', () => {
  expect(todayUtc(new Date('2026-09-24T23:30:00-04:00'))).toBe('2026-09-25')
})
