import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AeoTiles } from './tiles'
import { EMPTY_MARK, TILE, TILES_LABEL } from './copy'

const totals = { urlsCited: 12, retrievals: 1500, citations: 300, citationRate: 0.2, prior: { urlsCited: 10, retrievals: 1000, citations: 300, citationRate: 0.3 } }
const TITLES: string[] = [TILE.urlsCited.title, TILE.retrievals.title, TILE.citations.title, TILE.citationRate.title]
// The tile titles in page order (a tile's tooltip text is not a title).
const titles = () => screen.getAllByText((_, el) => !!el && el.children.length === 0 && TITLES.includes(el.textContent ?? '')).map((e) => e.textContent)

describe('the four tiles before the tables', () => {
  it('in the outline\'s order, under "Your channels", with values formatted', () => {
    render(<AeoTiles totals={totals} previousDays={31} />)
    expect(screen.getByText(TILES_LABEL)).toBeTruthy()
    expect(titles()).toEqual([TILE.urlsCited.title, TILE.retrievals.title, TILE.citations.title, TILE.citationRate.title])
    for (const v of ['12', '1,500', '300', '20%']) expect(screen.getByText(v)).toBeTruthy()
  })
  it('the titles are the outline\'s words exactly ("BEFORE THE TABLES")', () => {
    render(<AeoTiles totals={totals} previousDays={null} />)
    expect(titles()).toEqual(['Total URLs cited', 'Total # of retrievals', 'Total # of citations', 'Average citation rate'])
  })
  it('Month: each tile shows its change against the previous same-length window, labelled with that window', () => {
    render(<AeoTiles totals={totals} previousDays={31} />)
    // 12 vs 10 is +20%; 1500 vs 1000 +50%; 300 vs 300 no change; 0.2 vs 0.3 -33%, all the outline tiles' rule (outlineDelta)
    const changes = screen.getAllByText(/vs previous 31 days/).map((e) => e.textContent?.replace(/\s+/g, ' ').trim())
    expect(changes).toEqual(['↑ 20% vs previous 31 days', '↑ 50% vs previous 31 days', '\u2014 0% vs previous 31 days', '↓ 33% vs previous 31 days'])
  })
  it('YTD and All time: no change on any tile', () => {
    render(<AeoTiles totals={totals} previousDays={null} />)
    expect(screen.queryByText(/vs previous/)).toBeNull()
  })
  it('Month with no previous totals (no chats then): the greyed placeholder, never a made-up 0%', () => {
    render(<AeoTiles totals={{ ...totals, prior: null }} previousDays={31} />)
    expect(screen.getAllByText(/vs previous 31 days/).map((e) => e.textContent?.trim())).toEqual(Array(4).fill('\u2014 vs previous 31 days'))
  })
  it('a zero rate reads 0%', () => {
    render(<AeoTiles totals={{ urlsCited: 0, retrievals: 5, citations: 0, citationRate: 0, prior: null }} previousDays={null} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })
  it('a null rate (no retrievals) is the empty mark', () => {
    render(<AeoTiles totals={{ urlsCited: 0, retrievals: 0, citations: 0, citationRate: null, prior: null }} previousDays={null} />)
    expect(screen.getByText(EMPTY_MARK)).toBeTruthy()
  })
})
