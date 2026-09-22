import { expect, test } from 'vitest'
import { pickPeaks, annotationLabel, topPostByDate, buildAnnotations, toChartAnnotations, ANNOTATION_LIMIT } from './annotations'
import type { TopContentPost } from './content-types'
import type { TrendSeries } from './types'

// All numbers are made up.
const AUG = { from: '2026-08-01', to: '2026-08-31' }
const series = (values: Record<string, number>, channel = 'Instagram'): TrendSeries => ({
  channels: [channel],
  points: Object.entries(values).map(([date, v]) => ({ date, [channel]: v })),
})

test('returns the highest days up to the limit, in date order', () => {
  const s = series({ '2026-08-03': 10, '2026-08-10': 50, '2026-08-20': 30, '2026-08-25': 40 })
  expect(pickPeaks(s, { limit: 2, ...AUG })).toEqual([
    { date: '2026-08-10', value: 50 },
    { date: '2026-08-25', value: 40 },
  ])
})

test('only positive days are peaks, so a quiet month returns fewer', () => {
  const s = series({ '2026-08-01': 0, '2026-08-02': -4, '2026-08-03': 6 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-03', value: 6 }])
})

test('a month with no positive days has no peaks', () => {
  expect(pickPeaks(series({ '2026-08-01': 0, '2026-08-02': -1 }), { limit: 3, ...AUG })).toEqual([])
})

// The Eastern window the v1 graphs send returns a day past the month on some channels.
test('a day outside the requested window is never a peak, however high', () => {
  const s = series({ '2026-08-15': 5, '2026-09-01': 999, '2026-07-31': 888 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-15', value: 5 }])
})

test('the first and last days of the window are inside it', () => {
  const s = series({ '2026-08-01': 5, '2026-08-31': 7 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-31'])
})

test('ties break on the earlier date, so the same data always gives the same peaks', () => {
  const s = series({ '2026-08-29': 20, '2026-08-10': 20, '2026-08-22': 26, '2026-08-05': 20 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([
    { date: '2026-08-05', value: 20 },
    { date: '2026-08-10', value: 20 },
    { date: '2026-08-22', value: 26 },
  ])
})

test('when every day is equal, the earliest days win', () => {
  const s = series({ '2026-08-04': 3, '2026-08-01': 3, '2026-08-03': 3, '2026-08-02': 3 })
  expect(pickPeaks(s, { limit: 2, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02'])
})

// The deck calls out three consecutive days on one slide.
test('neighbouring days can all be peaks', () => {
  const s = series({ '2026-08-09': 40, '2026-08-10': 65, '2026-08-11': 38, '2026-08-20': 10 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-09', '2026-08-10', '2026-08-11'])
})

test('a chart with more than one channel gets no peaks', () => {
  const s: TrendSeries = {
    channels: ['Instagram', 'Facebook'],
    points: [{ date: '2026-08-10', Instagram: 50, Facebook: 40 }],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([])
})

test('a chart with no channels gets no peaks', () => {
  expect(pickPeaks({ channels: [], points: [] }, { limit: 3, ...AUG })).toEqual([])
})

test('a limit of zero returns nothing', () => {
  expect(pickPeaks(series({ '2026-08-10': 50 }), { limit: 0, ...AUG })).toEqual([])
})

test('a value that is not a finite number is skipped rather than ranked', () => {
  const s: TrendSeries = {
    channels: ['Instagram'],
    points: [
      { date: '2026-08-10', Instagram: 'n/a' },
      { date: '2026-08-11', Instagram: 12 },
      { date: '2026-08-12' },
    ],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-11', value: 12 }])
})

const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})

test('follower labels carry a plus sign and no leading zeros', () => {
  expect(annotationLabel('2026-08-10', 12, 'followers')).toBe('8/10 | +12 Followers')
  expect(annotationLabel('2026-08-05', 1204, 'followers')).toBe('8/5 | +1,204 Followers')
})

test('engagement labels carry no sign', () => {
  expect(annotationLabel('2026-08-09', 35, 'engagements')).toBe('8/9 | 35 Engagements')
  expect(annotationLabel('2026-08-26', 12345, 'engagements')).toBe('8/26 | 12,345 Engagements')
})

test('a value of exactly 1 reads in the singular', () => {
  expect(annotationLabel('2026-08-05', 1, 'followers')).toBe('8/5 | +1 Follower')
  expect(annotationLabel('2026-08-05', 1, 'engagements')).toBe('8/5 | 1 Engagement')
})

test('labels contain no em or en dash', () => {
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  expect(annotationLabel('2026-08-09', 35, 'engagements')).not.toMatch(dashes)
  expect(annotationLabel('2026-08-10', 12, 'followers')).not.toMatch(dashes)
})

test('the top post of each day is the one with the most engagements', () => {
  const m = topPostByDate([post(1, '2026-08-10', 5), post(2, '2026-08-10', 90), post(3, '2026-08-11', 1)])
  expect(m.get('2026-08-10')?.id).toBe(2)
  expect(m.get('2026-08-11')?.id).toBe(3)
})

test('equal engagements on the same day go to the lower post id, so the choice is stable', () => {
  expect(topPostByDate([post(9, '2026-08-10', 50), post(4, '2026-08-10', 50)]).get('2026-08-10')?.id).toBe(4)
})

test('a post with no publish date is left out rather than guessed', () => {
  expect(topPostByDate([post(1, '', 999)]).size).toBe(0)
})

test('each annotation gets its label and the top post of that day', () => {
  const peaks = [{ date: '2026-08-10', value: 50 }, { date: '2026-08-22', value: 26 }]
  expect(buildAnnotations(peaks, [post(7, '2026-08-10', 40)], 'engagements')).toEqual([
    { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', post: expect.objectContaining({ id: 7 }) },
    { date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', post: null },
  ])
})

test('a peak day with no post gets an annotation with no thumbnail', () => {
  expect(buildAnnotations([{ date: '2026-08-29', value: 20 }], [], 'engagements')[0].post).toBeNull()
})

// The post fetch can fail on its own. A missing picture must never cost the annotation.
test('when the posts could not be fetched, annotations still build without thumbnails', () => {
  expect(buildAnnotations([{ date: '2026-08-10', value: 50 }], null, 'followers')).toEqual([
    { date: '2026-08-10', value: 50, label: '8/10 | +50 Followers', post: null },
  ])
})

test('the limits match the deck: 2 follower annotations, 3 engagement annotations', () => {
  expect(ANNOTATION_LIMIT).toEqual({ followers: 2, engagements: 3 })
})

// The server to client boundary is ChannelTrendChart's props (trends.tsx is 'use client'), so a
// whole post must never cross it: only what the row draws.
test('a chart annotation carries only what the row draws, never the whole post', () => {
  const [a] = toChartAnnotations([{ date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', post: post(7, '2026-08-10', 40) }])
  expect(a).toEqual({
    date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements',
    thumb: { creative: { kind: 'image', thumb: 'https://cdn.example.com/t7.jpg', full: 'https://cdn.example.com/f7.jpg' }, mediaType: 'IMAGE', url: 'https://example.com/7' },
  })
  for (const gone of ['caption', 'metrics', 'id', 'publishedAt', 'post', 'channel', 'sourceType']) {
    expect(JSON.stringify(a)).not.toContain(gone)
  }
})

test('an annotation with no post has no thumbnail to send', () => {
  expect(toChartAnnotations([{ date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', post: null }])[0])
    .toEqual({ date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', thumb: null })
})
