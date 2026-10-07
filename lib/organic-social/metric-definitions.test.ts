import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_DEFINITIONS, TOP_POSTS_DEFINITION, metricDefinition, sharedTileDefinition } from './metric-definitions'
import { OUTLINE_BREAKDOWN_ROWS, OUTLINE_DATA_ROWS } from './outline-layout'
import { CHANNELS, PLATFORM_KPIS, type DashChannel } from './metrics'

const OUTLINE: DashChannel[] = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK']

const VARIANTS = Object.keys(OUTLINE_DATA_ROWS) as (keyof typeof OUTLINE_DATA_ROWS)[]
const drawnRows = (ch: DashChannel) => [
  ...VARIANTS.flatMap((v) => OUTLINE_DATA_ROWS[v][ch] ?? []),
  ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []),
].map((r) => r.key)

test('every row an outline tab draws, on every outline variant, has a definition', () => {
  for (const ch of OUTLINE) for (const k of drawnRows(ch)) expect(metricDefinition(ch, k), `${ch} ${k}`).toBeTruthy()
})

// Kenect's Instagram Data block draws Profile Clicks (the profileClicks variant), which the appendix defines for X only.
// The X sentence names no platform, so it is reused (Thomas, 2026-10-07, on Paul's #335 review, item 9).
test('Instagram Profile Clicks reuses the appendix line written for X', () => {
  expect(metricDefinition('INSTAGRAM', 'profileClicks')).toBe(metricDefinition('TWITTER', 'profileClicks'))
})

test('every shared platform tile has a definition on every channel (the live client draws these)', () => {
  for (const ch of CHANNELS) for (const k of PLATFORM_KPIS[ch].map((s) => s.key)) expect(metricDefinition(ch, k), `${ch} ${k}`).toBeTruthy()
})

test('a channel the appendix does not cover yields no text, never a throw', () => {
  expect(metricDefinition('NOPE', 'followers')).toBeUndefined()
})

test('no definition exists for a key no tab draws', () => {
  for (const ch of Object.keys(ORGANIC_SOCIAL_DEFINITIONS) as DashChannel[]) {
    const drawn = new Set([...drawnRows(ch), ...PLATFORM_KPIS[ch].map((s) => s.key)])
    for (const k of Object.keys(ORGANIC_SOCIAL_DEFINITIONS[ch])) expect(drawn.has(k), `${ch} ${k}`).toBe(true)
  }
})

// A file snapshot, not a hash, so a review diff shows exactly which words moved (Paul, #335 review, item 7). Update it
// only after re-quoting the appendix.
test('the texts are the appendix, verbatim', () => {
  expect({ ORGANIC_SOCIAL_DEFINITIONS, TOP_POSTS_DEFINITION }).toMatchSnapshot()
})

test('the Facebook views text is the appendix text (paid is not mentioned; spec C2)', () => {
  expect(metricDefinition('FACEBOOK', 'exposure')).toBe('The number of times your posts were viewed or displayed.')
})

// The shared tiles (PlatformHeadlines: Renaissance, Piper's X tab, an outline client's Overview) read the shared
// metric, which for a key OUTLINE_KPI_OVERRIDES replaces is a different number from the outline tab's (Instagram and
// LinkedIn Engagement Rate: follower basis there, views basis on the tab). The appendix text describes the tab's number,
// so a shared tile for such a key draws no badge (Paul, #335 review, item 1).
test('a shared tile draws no text for a key the outline overrides on that channel; every other key keeps its text', () => {
  expect(sharedTileDefinition('INSTAGRAM', 'engagementRate')).toBeUndefined()
  expect(sharedTileDefinition('LINKEDIN', 'engagementRate')).toBeUndefined()
  expect(sharedTileDefinition('FACEBOOK', 'engagementRate')).toBe(metricDefinition('FACEBOOK', 'engagementRate'))
  expect(sharedTileDefinition('INSTAGRAM', 'followers')).toBe(metricDefinition('INSTAGRAM', 'followers'))
  expect(sharedTileDefinition('NOPE', 'followers')).toBeUndefined()
})
