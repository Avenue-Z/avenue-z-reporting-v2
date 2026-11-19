// lib/organic-social/social-listening/view-model.ts
// Everything one topic of the Social Listening tab shows, decided in one pure function (spec
// docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, sections 5, 7 and 9). The components only render this,
// so every rule about who sees what, and every number and change, is tested here. No I/O.
import { monthTitle } from '../reporting-months'
import type { SlBoxId } from './boxes'
import { brandThemeColor, mediaColor } from './colors'
import { authorChanges, mediaChanges, pct, pointsChange, posNeu, presentedValues, prevMonth, tileChange, ytdSeries, type SlPct, type YtdPoint } from './compare'
import { MAX_IMAGES, MAX_POSTS } from './posts'
import { currentUpload, presentedUpload } from './select'
import { clientTrends } from './trends'
import type { SlDay, SlExport, SlMonth, SlMonthData, SlPost, SlSentimentCounts, SlTopic, SlTrendLists, SlUpload } from './types'

export type SlSettingView = { brandTopic: string; industryTopic: string | null; industrySample: number | null }

export type SlViewInput = {
  topic: SlTopic
  /** The served month. */
  month: SlMonth
  /** The served month is the live month (staff only; a client is never served it). */
  live: boolean
  /** A client role, or any export: the client's view (spec section 9, R2-1). */
  clientView: boolean
  setting: SlSettingView
  data: SlMonthData
  /** Boxes with approved text a client would see this month (clientMonthEntry). */
  approvedBoxes: ReadonlySet<SlBoxId>
}

export type SlTile = { title: string; value: number | null; change?: number; points?: number | null; unit?: '%' }
export type SlMediaRow = { media: string; count: number; pct: number; change: number | null; color: string }
export type SlCrossRow = { media: string; total: number } & SlSentimentCounts
type Influencer = NonNullable<SlExport['influencers']>[number]

export type SlReadyView = {
  results: number
  /** "vs <previous month> report". */
  changeLabel: string
  hasPrevious: boolean
  tiles: SlTile[]
  daily: SlDay[]
  dailyBySentiment: NonNullable<SlExport['dailyBySentiment']>
  sentiment: { counts: SlSentimentCounts; pct: SlPct; change: { pos: number | null; neu: number | null; neg: number | null } }
  owned: { counts: SlSentimentCounts; pct: SlPct; total: number } | null
  cross: SlCrossRow[]
  media: SlMediaRow[]
  ytd: YtdPoint[]
  posNeu: { month: SlMonth; value: number | null }[]
  reddit: YtdPoint[] | null
  themes: { theme: string; share: number; color: string }[]
  influencers: (Influencer & { change: number | null })[]
  overview: NonNullable<SlExport['overview']>
}

export type SlTopicView = {
  topic: SlTopic
  month: SlMonth
  monthTitle: string
  state: 'ready' | 'missing' | 'not-ready' | 'live'
  liveText: string | null
  staffNotes: string[]
  sampleLine: string | null
  ready: SlReadyView | null
  show: { owned: boolean; conv: boolean; takeaways: boolean; keywords: boolean; posts: boolean; trends: boolean }
  posts: SlPost[]
  trends: { lists: SlTrendLists | null; draft: { lists: SlTrendLists; status: 'draft' | 'approved' } | null }
}

export const NOT_READY_TEXT = "This month's social listening report isn't ready yet."
const HISTORY_NOTE = "This month also has a delivered report on record. Later months compare with the report's numbers."
const REUPLOAD_NOTE = 'This export was uploaded after the month opened to the client. Later months still compare with the earlier numbers.'
const GROUP_ORDER = { social: 0, forum: 1, web: 2 } as const

const keyOf = (year: number, m: number) => `${year}-${String(m).padStart(2, '0')}`

/** The months the page reads: January to the served month of its year, and the month before the served month (the
 *  previous year's December when it is January). */
export function servedMonths(month: SlMonth): SlMonth[] {
  const [y, m] = month.split('-').map(Number)
  const out = Array.from({ length: m }, (_, i) => keyOf(y, i + 1))
  const prev = prevMonth(month)
  return out.includes(prev) ? out : [prev, ...out]
}

const uploadsOf = (data: SlMonthData, month: SlMonth, topic: SlTopic): SlUpload[] =>
  data.uploads.filter((u) => u.month === month && u.topic === topic)

/** Which pills show. Staff: Brand always, Industry whenever the client has an industry topic. A client: nothing without a
 *  brand upload (the whole tab is the not-ready text), and Industry only with an industry upload (section 5). */
export function topicPills(i: { month: SlMonth; data: SlMonthData; setting: SlSettingView; clientView: boolean }): { brand: boolean; industry: boolean } {
  const hasIndustryTopic = i.setting.industryTopic !== null
  if (!i.clientView) return { brand: true, industry: hasIndustryTopic }
  if (!currentUpload(uploadsOf(i.data, i.month, 'brand'))) return { brand: false, industry: false }
  return { brand: true, industry: hasIndustryTopic && currentUpload(uploadsOf(i.data, i.month, 'industry')) !== null }
}

const splitPct = (c: SlSentimentCounts, total: number): SlPct => ({ pos: pct(c.pos, total), neu: pct(c.neu, total), neg: pct(c.neg, total) })
const sum = (c: SlSentimentCounts) => c.pos + c.neu + c.neg

function readyView(topic: SlTopic, month: SlMonth, d: SlExport, data: SlMonthData): SlReadyView {
  const prev = presentedValues(prevMonth(month), topic, data.history, data.uploads)
  const prevUpload = presentedUpload(uploadsOf(data, prevMonth(month), topic))?.data ?? null
  const sentPct = splitPct(d.sentiment, d.results)
  const point = (k: keyof SlPct) => pointsChange(sentPct[k], prev ? { pct: prev.pct[k], whole: prev.whole } : null)
  const change = { pos: point('pos'), neu: point('neu'), neg: point('neg') }

  const tiles: SlTile[] = topic === 'brand'
    ? [
        { title: 'Results', value: d.results, change: tileChange(d.results, prev?.results) },
        { title: 'Unique authors', value: d.uniqueAuthors ?? null, change: d.uniqueAuthors === undefined ? undefined : tileChange(d.uniqueAuthors, prev?.uniqueAuthors) },
        { title: 'Engagement', value: d.engagement ?? null, change: d.engagement === undefined ? undefined : tileChange(d.engagement, prev?.engagement) },
        { title: 'Potential reach', value: d.potentialReach ?? null, change: d.potentialReach === undefined ? undefined : tileChange(d.potentialReach, prev?.potentialReach) },
      ]
    : [
        { title: 'Results', value: d.results, change: tileChange(d.results, prev?.results) },
        { title: 'Positive', value: sentPct.pos, points: change.pos, unit: '%' },
        { title: 'Neutral', value: sentPct.neu, points: change.neu, unit: '%' },
        { title: 'Negative', value: sentPct.neg, points: change.neg, unit: '%' },
      ]

  const mediaTotal = d.sentimentByMedia.reduce((a, r) => a + sum(r), 0)
  const mChanges = mediaChanges(d, prevUpload)
  const media = d.sentimentByMedia
    .map((r) => ({ media: r.media, count: sum(r), pct: pct(sum(r), mediaTotal), change: mChanges[r.media] ?? null, color: mediaColor(r.media) }))
    .sort((a, b) => b.count - a.count)
  const cross = d.sentimentByMedia.map((r) => ({ media: r.media, pos: r.pos, neu: r.neu, neg: r.neg, total: sum(r) })).sort((a, b) => b.total - a.total)

  const ytd = ytdSeries(d, data.history, data.uploads, 'all')
  const aChanges = authorChanges(d, prevUpload)
  return {
    results: d.results,
    changeLabel: `vs ${monthTitle(prevMonth(month))} report`,
    hasPrevious: prev !== null,
    tiles,
    daily: d.daily,
    dailyBySentiment: d.dailyBySentiment ?? [],
    sentiment: { counts: d.sentiment, pct: sentPct, change },
    owned: d.ownedExcluded ? { counts: d.ownedExcluded, pct: splitPct(d.ownedExcluded, sum(d.ownedExcluded)), total: sum(d.ownedExcluded) } : null,
    cross,
    media,
    ytd,
    posNeu: topic === 'brand' ? ytd.map((p) => ({ month: p.month, value: p.value ? posNeu(p.value) : null })) : [],
    reddit: topic === 'brand' ? ytdSeries(d, data.history, data.uploads, 'reddit') : null,
    themes: d.themes.map((t) => ({ theme: t.theme, share: t.share, color: topic === 'brand' ? brandThemeColor(t.color) : t.color })),
    influencers: (d.influencers ?? []).map((i) => ({ ...i, change: aChanges[i.authorId] ?? null })),
    overview: d.overview ?? [],
  }
}

/** One topic's view. */
export function buildTopicView(i: SlViewInput): SlTopicView {
  const { topic, month, clientView, data } = i
  const monthUploads = uploadsOf(data, month, topic)
  const current = currentUpload(monthUploads)
  const state: SlTopicView['state'] = current ? 'ready'
    : i.live && !clientView ? 'live'
    : clientView ? 'not-ready' : 'missing'

  const staffNotes: string[] = []
  if (!clientView && current) {
    if (data.history.some((h) => h.month === month && h.topic === topic)) staffNotes.push(HISTORY_NOTE)
    const presented = presentedUpload(monthUploads)
    if (presented && presented.id !== current.id) staffNotes.push(REUPLOAD_NOTE)
  }

  const box = (suffix: 'conv' | 'takeaways' | 'keywords' | 'posts') => i.approvedBoxes.has(`${topic === 'brand' ? 'b' : 'i'}-${suffix}` as SlBoxId)
  const posts = (clientView ? data.posts.filter((p) => p.status === 'approved') : data.posts)
    .filter((p) => p.month === month)
    .slice()
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.position - b.position)
  const shownPosts = (clientView ? posts.slice(0, MAX_POSTS) : posts).map((p) => ({ ...p, imageIds: p.imageIds.slice(0, MAX_IMAGES) }))

  const approvedLists = clientTrends(data.trends)
  const trends = {
    lists: approvedLists,
    draft: clientView || !data.trends ? null : { lists: data.trends.draft, status: data.trends.status },
  }
  const ready = current ? readyView(topic, month, current.data, data) : null
  const isBrand = topic === 'brand'
  return {
    topic,
    month,
    monthTitle: monthTitle(month),
    state,
    liveText: state === 'live' ? `Upload opens when ${monthTitle(month)} ends.` : null,
    staffNotes,
    sampleLine: topic === 'industry' && i.setting.industrySample !== null ? `The industry topic is a ${i.setting.industrySample}% sample of the conversation.` : null,
    ready,
    show: {
      owned: ready?.owned != null,
      conv: !clientView || box('conv'),
      takeaways: !clientView || box('takeaways'),
      keywords: !clientView || box('keywords'),
      posts: isBrand && (!clientView || shownPosts.length > 0 || box('posts')),
      trends: isBrand && (!clientView || approvedLists !== null),
    },
    posts: isBrand ? shownPosts : [],
    trends,
  }
}
