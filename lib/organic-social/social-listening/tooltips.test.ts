// The tooltip table (plan 2026-11-24, Unit B, F2). Empty until the team's definitions doc arrives: no text is invented.
import { expect, test } from 'vitest'
import { SL_TOOLTIPS, slCardTooltip, slTileTooltip } from './tooltips'

test('the table is empty until the definitions arrive, so nothing draws', () => {
  expect(SL_TOOLTIPS.tiles.size).toBe(0)
  expect(SL_TOOLTIPS.cards.size).toBe(0)
  expect(slTileTooltip('brand', 'results')).toBeUndefined()
  expect(slCardTooltip('b-daily')).toBeUndefined()
})

test('a tile is looked up by topic and its fixed id, a card by its box id', () => {
  const table = { tiles: new Map([['industry:results', 'Made-up tile text']]), cards: new Map([['b-ytd' as const, 'Made-up card text']]) }
  expect(slTileTooltip('industry', 'results', table)).toBe('Made-up tile text')
  expect(slTileTooltip('brand', 'results', table)).toBeUndefined()
  expect(slCardTooltip('b-ytd', table)).toBe('Made-up card text')
  expect(slCardTooltip('i-ytd', table)).toBeUndefined()
})
