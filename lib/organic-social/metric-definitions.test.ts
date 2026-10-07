import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_DEFINITIONS, TOP_POSTS_DEFINITION, metricDefinition } from './metric-definitions'
import { OUTLINE_BREAKDOWN_ROWS, OUTLINE_DATA_ROWS } from './outline-layout'
import { CHANNELS, PLATFORM_KPIS, type DashChannel } from './metrics'

const OUTLINE: DashChannel[] = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK']

test('every row an outline tab draws has a definition; Instagram Profile Clicks (the profileClicks variant) has none', () => {
  for (const ch of OUTLINE) {
    const keys = [...(OUTLINE_DATA_ROWS.standard[ch] ?? []), ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? [])].map((r) => r.key)
    for (const k of keys) expect(metricDefinition(ch, k), `${ch} ${k}`).toBeTruthy()
  }
  expect(metricDefinition('INSTAGRAM', 'profileClicks')).toBeUndefined() // no appendix text (G1)
})

test('every shared platform tile has a definition on every channel (the live client draws these)', () => {
  for (const ch of CHANNELS) for (const k of PLATFORM_KPIS[ch].map((s) => s.key)) expect(metricDefinition(ch, k), `${ch} ${k}`).toBeTruthy()
})

test('a channel the appendix does not cover yields no text, never a throw', () => {
  expect(metricDefinition('NOPE', 'followers')).toBeUndefined()
})

test('no definition exists for a key no tab draws', () => {
  for (const ch of Object.keys(ORGANIC_SOCIAL_DEFINITIONS) as DashChannel[]) {
    const drawn = new Set([
      ...(OUTLINE_DATA_ROWS.standard[ch] ?? []).map((r) => r.key),
      ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []).map((r) => r.key),
      ...PLATFORM_KPIS[ch].map((s) => s.key),
    ])
    for (const k of Object.keys(ORGANIC_SOCIAL_DEFINITIONS[ch])) expect(drawn.has(k), `${ch} ${k}`).toBe(true)
  }
})

test('the texts are the appendix, verbatim (change the hash only after re-quoting the source)', () => {
  const hash = createHash('sha256').update(JSON.stringify({ ORGANIC_SOCIAL_DEFINITIONS, TOP_POSTS_DEFINITION })).digest('hex')
  expect(hash).toBe('7a2ef7abfeb3742b025dda45a35f5acf02cce3779182d5510107527f49dc8439')
})

test('the Facebook views text is the appendix text (paid is not mentioned; spec C2)', () => {
  expect(metricDefinition('FACEBOOK', 'exposure')).toBe('The number of times your posts were viewed or displayed.')
})
