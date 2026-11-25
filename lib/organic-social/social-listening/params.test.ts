import { expect, test } from 'vitest'
import { SL_TOGGLE_CHARTS, formatSlCols, isSlColsValue, parseSlCols, parseSlPreview, parseSlTopic } from './params'

test('sl=industry is Industry; anything else is Brand', () => {
  expect(parseSlTopic('industry')).toBe('industry')
  for (const raw of ['brand', undefined, null, '', 'Industry', 'paid', ['industry'], 1]) expect(parseSlTopic(raw)).toBe('brand')
})

test('slview=client is the client preview; anything else is off', () => {
  expect(parseSlPreview('client')).toBe(true)
  for (const raw of [undefined, '', 'Client', 'staff', ['client'], true]) expect(parseSlPreview(raw)).toBe(false)
})

// The Line / Columns toggle (plan 2026-11-24, Unit C): slcols lists the charts set to columns. Every chart starts on the line.
test('the toggle charts are the three brand year to date charts and the two industry sentiment charts', () => {
  expect(SL_TOGGLE_CHARTS).toEqual(['b-ytd', 'b-posneu', 'b-reddit', 'i-ytd', 'i-sentday'])
})

test('slcols keeps known charts, in a fixed order, once each; anything else is dropped so an old link still loads', () => {
  expect(parseSlCols('b-reddit,b-ytd')).toEqual(['b-ytd', 'b-reddit'])
  expect(parseSlCols('b-ytd,b-ytd,x,b-posneu,,i-sentday')).toEqual(['b-ytd', 'b-posneu', 'i-sentday'])
  for (const raw of [undefined, null, '', 'nothing', ['b-ytd'], 3, 'B-YTD']) expect(parseSlCols(raw)).toEqual([])
  expect(parseSlCols('b-ytd,'.repeat(500))).toEqual([])
})

test('formatSlCols writes the param back, or nothing when every chart is on the line', () => {
  expect(formatSlCols(['b-reddit', 'b-ytd'])).toBe('b-ytd,b-reddit')
  expect(formatSlCols([])).toBeNull()
})

test('an export request takes only an exact, clean slcols value', () => {
  for (const ok of ['b-ytd', 'b-ytd,b-reddit', 'b-posneu', 'b-ytd,b-posneu,b-reddit,i-ytd,i-sentday']) expect(isSlColsValue(ok)).toBe(true)
  for (const bad of ['', 'b-ytd,b-ytd', 'b-reddit,b-ytd', 'b-posneu,b-ytd', 'x', 'b-ytd,', 3, null, ['b-ytd']]) expect(isSlColsValue(bad)).toBe(false)
})
