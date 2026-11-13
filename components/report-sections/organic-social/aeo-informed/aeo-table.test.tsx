import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CHART_COLORS } from '@/lib/constants'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { GapRow, SocialsRow } from '@/lib/organic-social/aeo-informed'
import { AeoTable } from './aeo-table'
import { EMPTY_MARK, TABLE_EMPTY } from './copy'

const BRANDS = [
  { id: 'b_own', name: 'Example', color: '#60FDFF', isOwn: true },
  { id: 'b_globex', name: 'Globex', color: '#FF8A3D', isOwn: false },
  { id: 'b_nocolor', name: 'Initech', color: null, isOwn: false },
]
const social = (i: number, o: Partial<SocialsRow> = {}): SocialsRow => ({
  rank: i + 1, url: `https://www.linkedin.com/pulse/post-${i}`, title: `Post ${i}`, channelTitle: `Channel ${i}`, ownerBrandId: 'b_own', isOwnChannel: true,
  urlType: 'Article', domainType: 'Organic Social', ownBrandMentioned: true, mentionedBrandCount: 1, mentionedBrandNames: 'Example', mentionedBrandIds: 'b_own',
  retrievals: 100 - i, retrievalsDelta: 5, retrievedPct: 0.01, retrievedPctDelta: 0, totalCitations: 10, totalCitationsDelta: -2, citationRate: 0.1, citationRateDelta: 0.12, ...o,
})
const gap = (i: number, o: Partial<GapRow> = {}): GapRow => ({
  rank: i + 1, url: `https://www.reddit.com/r/x/${i}`, title: `Thread ${i}`, channelTitle: 'r/x', urlType: 'Discussion', domainType: 'Organic Social',
  mentionedBrandCount: 1, mentionedBrandNames: 'Globex', mentionedBrandIds: 'b_globex', citationShare: 0.5, citationPosition: 2.5, retrievals: 10, retrievalsDelta: null,
  totalCitations: 3, totalCitationsDelta: null, citationRate: 0.3, citationRateDelta: null, ...o,
})
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, '').trim())
const rows = () => screen.queryAllByTestId('aeo-row')

describe('columns (the team feedback 2026-11-12: no Retrieved; Retrievals, Total citations, Citation rate last)', () => {
  it('the socials tables end Retrievals, Total citations, Citation rate, with no Retrieved', () => {
    render(<AeoTable kind="socials" rows={[social(0)]} brands={BRANDS} showChange={false} />)
    expect(headers()).toEqual(['#', 'URL', 'URL type', 'Mentions', 'Retrievals', 'Total citations', 'Citation rate'])
    expect(screen.queryByText(/Retrieved/)).toBeNull()
  })
  it('URL Gaps ends Citation share, Citation position, Retrievals, Total citations, Citation rate', () => {
    render(<AeoTable kind="gaps" rows={[gap(0)]} brands={BRANDS} showChange={false} />)
    expect(headers()).toEqual(['#', 'URL', 'URL type', 'Mentions', 'Citation share', 'Citation position', 'Retrievals', 'Total citations', 'Citation rate'])
  })
})

describe('values', () => {
  it('citation rate shows as a whole percent and is not capped (220 on 145 is 152%); a null rate is the empty mark', () => {
    render(<AeoTable kind="gaps" rows={[gap(0, { totalCitations: 220, retrievals: 145, citationRate: 220 / 145 }), gap(1, { citationRate: null, retrievals: 0 })]} brands={BRANDS} showChange={false} />)
    const [a, b] = rows()
    expect(within(a).getByTestId('aeo-rate').textContent).toBe('152%')
    expect(within(b).getByTestId('aeo-rate').textContent).toBe(EMPTY_MARK)
  })
  it('citation share is a percent and a missing citation position is the empty mark', () => {
    render(<AeoTable kind="gaps" rows={[gap(0, { citationShare: 0.25 }), gap(1, { citationPosition: null })]} brands={BRANDS} showChange={false} />)
    expect(rows().map((r) => within(r).getByTestId('aeo-share').textContent)).toEqual(['25%', '50%'])
    expect(rows().map((r) => within(r).getByTestId('aeo-position').textContent)).toEqual(['2.5', EMPTY_MARK])
  })
  it('the URL links out to the source, safely, with its title and channel', () => {
    render(<AeoTable kind="socials" rows={[social(0)]} brands={BRANDS} showChange={false} />)
    const link = screen.getByRole('link', { name: 'Post 0' })
    expect(link.getAttribute('href')).toBe('https://www.linkedin.com/pulse/post-0')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // our own channel carries a star; a competitor's channel does not
    expect(screen.getByText('★ Channel 0')).toBeTruthy()
  })
  it('a competitor channel has no star', () => {
    render(<AeoTable kind="socials" rows={[social(0, { isOwnChannel: false, ownerBrandId: 'b_globex', channelTitle: 'Globex Life' })]} brands={BRANDS} showChange={false} />)
    expect(screen.getByText('Globex Life')).toBeTruthy()
  })
  it('a URL that is not http or https is shown as text, never as a link', () => {
    render(<AeoTable kind="socials" rows={[social(0, { url: 'javascript:alert(1)', title: 'Bad' })]} brands={BRANDS} showChange={false} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Bad')).toBeTruthy()
  })
  it('Mentions shows one dot per brand id in that brand\'s color, own brand first, grey for a brand with no color (Review Focus 5)', () => {
    render(<AeoTable kind="socials" rows={[social(0, { mentionedBrandIds: 'b_own|b_globex|b_nocolor', mentionedBrandNames: 'Example|Globex|Initech', mentionedBrandCount: 3 })]} brands={BRANDS} showChange={false} />)
    const dots = screen.getAllByTestId('aeo-mention-dot')
    expect(dots.map((d) => d.getAttribute('title'))).toEqual(['Example', 'Globex', 'Initech'])
    expect(dots.map((d) => (d as HTMLElement).style.backgroundColor)).toEqual(['rgb(96, 253, 255)', 'rgb(255, 138, 61)', 'rgb(138, 138, 138)'])
    expect(CHART_COLORS.neutral).toBe('#8A8A8A')
    expect(screen.getByTestId('aeo-mention-count').textContent).toBe('3')
  })
  it('a row with no mentioned brand shows no dots and a count of 0', () => {
    render(<AeoTable kind="socials" rows={[social(0, { mentionedBrandIds: null, mentionedBrandNames: null, mentionedBrandCount: 0 })]} brands={BRANDS} showChange={false} />)
    expect(screen.queryAllByTestId('aeo-mention-dot')).toEqual([])
    expect(screen.getByTestId('aeo-mention-count').textContent).toBe('0')
  })
  it('changes show only when asked (Month): retrievals and citations as signed counts, the rate in points; a null change shows nothing', () => {
    const { unmount } = render(<AeoTable kind="socials" rows={[social(0), social(1, { retrievalsDelta: null, totalCitationsDelta: null, citationRateDelta: null })]} brands={BRANDS} showChange />)
    const [a, b] = rows()
    expect(within(a).getAllByTestId('aeo-change').map((c) => c.textContent)).toEqual(['+5', '-2', '+12 pts'])
    expect(within(b).queryAllByTestId('aeo-change')).toEqual([])
    unmount()
    render(<AeoTable kind="socials" rows={[social(0)]} brands={BRANDS} showChange={false} />)
    expect(screen.queryAllByTestId('aeo-change')).toEqual([])
  })
  it('no rows shows the empty state', () => {
    render(<AeoTable kind="socials" rows={[]} brands={BRANDS} showChange={false} />)
    expect(screen.getByText(TABLE_EMPTY)).toBeTruthy()
  })
})

describe('paging, search and sort', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => social(i))
  it('14 rows a page, with the count and previous and next', () => {
    render(<AeoTable kind="socials" rows={thirty} brands={BRANDS} showChange={false} />)
    expect(rows()).toHaveLength(14)
    expect(screen.getByText('Showing 1 to 14 of 30')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 15 to 28 of 30')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 29 to 30 of 30')).toBeTruthy()
    expect(rows()).toHaveLength(2)
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Showing 15 to 28 of 30')).toBeTruthy()
  })
  it('search narrows by URL, title and channel, ignoring case, and returns to page 1', () => {
    render(<AeoTable kind="socials" rows={thirty} brands={BRANDS} showChange={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'POST-12' } })
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('Showing 1 to 1 of 1')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'post 2' } })
    expect(rows().length).toBe(11) // Post 2 and Post 20 to 29, by title
    fireEvent.change(box, { target: { value: 'channel 7' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(box, { target: { value: 'nothing like this' } })
    expect(screen.getByText(TABLE_EMPTY)).toBeTruthy()
  })
  it('a column sorts numerically, highest first, then lowest first', () => {
    render(<AeoTable kind="socials" rows={[social(0, { totalCitations: 9 }), social(1, { totalCitations: 100 }), social(2, { totalCitations: 10 })]} brands={BRANDS} showChange={false} />)
    const cites = () => rows().map((r) => within(r).getByTestId('aeo-citations').textContent)
    expect(cites()).toEqual(['9', '100', '10'])
    fireEvent.click(screen.getByRole('button', { name: /Total citations/ }))
    expect(cites()).toEqual(['100', '10', '9'])
    fireEvent.click(screen.getByRole('button', { name: /Total citations/ }))
    expect(cites()).toEqual(['9', '10', '100'])
  })
  it('a null rate sorts last whichever way', () => {
    render(<AeoTable kind="socials" rows={[social(0, { citationRate: null }), social(1, { citationRate: 0.5 }), social(2, { citationRate: 0.2 })]} brands={BRANDS} showChange={false} />)
    const rates = () => rows().map((r) => within(r).getByTestId('aeo-rate').textContent)
    fireEvent.click(screen.getByRole('button', { name: /Citation rate/ }))
    expect(rates()).toEqual(['50%', '20%', EMPTY_MARK])
    fireEvent.click(screen.getByRole('button', { name: /Citation rate/ }))
    expect(rates()).toEqual(['20%', '50%', EMPTY_MARK])
  })
})

describe('the PDF export (Review Focus 4)', () => {
  it('prints the first page and says how many there are, with no search box and no pager buttons', () => {
    const many = Array.from({ length: 987 }, (_, i) => social(i))
    render(<ExportModeProvider><AeoTable kind="socials" rows={many} brands={BRANDS} showChange={false} /></ExportModeProvider>)
    expect(rows()).toHaveLength(14)
    expect(screen.getByText('Showing 1 to 14 of 987')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /page/ })).toBeNull()
  })
})
