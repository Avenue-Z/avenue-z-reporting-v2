import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is a stub that records its props.
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))
const actions = vi.hoisted(() => ({
  saveChartNoteAction: vi.fn(async () => ({ ok: true })),
  approveChartNoteAction: vi.fn(async () => ({ ok: true })),
  revokeChartNoteAction: vi.fn(async () => ({ ok: true })),
  deleteChartNoteDraftAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/chart-notes', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LineChart } from '@/components/charts/line-chart'
import { PIN_TEAM_CARD_HEIGHT } from '@/components/charts/pins'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import { ChannelTrendChart } from './trends'
import type { AnnotationControls, ChartAnnotation, ChartThumb, NoteControls } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'

// Every value is invented.
const SERIES: TrendSeries = {
  channels: ['Instagram'],
  points: ['2026-08-10', '2026-08-14', '2026-08-20', '2026-08-22'].map((date) => ({ date, Instagram: 5 })),
}
const IMG = (n: number): ChartThumb => ({
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${n}.jpg`, full: `https://cdn.example.com/f${n}.jpg` },
  mediaType: 'IMAGE', url: `https://example.com/p/${n}`,
})
const PEAK: ChartAnnotation = { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', hidden: false, thumb: IMG(1) }
const QUIET = (over: Partial<ChartAnnotation>): ChartAnnotation =>
  ({ date: '2026-08-14', value: -3, label: '8/14', hidden: false, thumb: null, noteOnly: true, ...over })
const DRAFT = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } }
const CONTROLS: NoteControls = {
  clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', canApprove: true,
  days: [
    { day: '2026-08-10', posts: [{ id: 11, thumb: IMG(1) }, { id: 12, thumb: IMG(2) }, { id: 13, thumb: IMG(3) }] },
    { day: '2026-08-14', posts: [] },
  ],
}
const HIDES: AnnotationControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements' }
const chart = () => vi.mocked(LineChart).mock.lastCall![0]
const draw = (annotations: ChartAnnotation[], noteControls?: NoteControls, annotationControls?: AnnotationControls) =>
  render(<ChannelTrendChart title="T" series={SERIES} annotations={annotations} noteControls={noteControls} annotationControls={annotationControls} />)

beforeEach(() => vi.clearAllMocks())

describe('on a phone-width screen: the row above the chart', () => {
  test('an approved note sits on its own line under the date and number', () => {
    draw([{ ...PEAK, note: 'Influencer post went live' }])
    const label = screen.getByText('8/10 | 50 Engagements')
    const note = screen.getByText('Influencer post went live')
    expect(label).not.toBe(note)
    expect(note.closest('li')).toBe(label.closest('li'))
  })

  test('a note-only day shows the date and the note, and no number', () => {
    draw([QUIET({ note: 'Event' })])
    expect(screen.getByText('8/14')).toBeTruthy()
    expect(screen.getByText('Event')).toBeTruthy()
    expect(screen.queryByText(/-3/)).toBeNull()
  })

  test('picked posts replace the top post on the card', () => {
    const { container } = draw([{ ...PEAK, note: 'x', thumbs: [IMG(2), IMG(3)] }])
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      'https://cdn.example.com/t2.jpg', 'https://cdn.example.com/t3.jpg',
    ])
  })

  test('a dot marks top days and approved note days; a draft-only or hidden day gets none', () => {
    draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }, { x: '2026-08-14' }])
  })

  test('the hover box gets approved notes on shown days only, and nothing when there are none', () => {
    const first = draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().notes).toEqual({ '2026-08-14': 'Event' })
    first.unmount()
    draw([PEAK])
    expect(chart().notes).toBeUndefined()
  })

  test('a draft-only card is faded and never reaches a PDF; an approved note-only card does', () => {
    draw([QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT })], CONTROLS)
    expect(screen.getByText('Event').closest('li')?.className).not.toContain('no-print')
    const draftCard = screen.getByText('8/20').closest('li')?.className ?? ''
    expect(draftCard).toContain('no-print')
    expect(draftCard).toContain('opacity-40')
    expect(screen.getByText('Draft: Soon').className).toContain('no-print')
  })

  test('a client sees no buttons and no draft text', () => {
    draw([{ ...PEAK, note: 'Event' }])
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide from client' })).toBeNull()
    expect(screen.queryByText(/^Draft:/)).toBeNull()
  })

  test('Add note saves the day, up to 2 posts and the text, then refreshes the page', async () => {
    draw([PEAK], CONTROLS)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-08-10' } })
    fireEvent.click(screen.getByLabelText('Post 1'))
    fireEvent.click(screen.getByLabelText('Post 2'))
    expect((screen.getByLabelText('Post 3') as HTMLInputElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Went live' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(actions.saveChartNoteAction).toHaveBeenCalledWith({
      clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', day: '2026-08-10', body: 'Went live', postIds: [11, 12],
    })
  })

  test('a note cannot be saved without text, even with posts picked', () => {
    draw([PEAK], CONTROLS)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-08-10' } })
    fireEvent.click(screen.getByLabelText('Post 1'))
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('a refused save shows the reason and does not refresh', async () => {
    actions.saveChartNoteAction.mockResolvedValueOnce({ ok: false, error: 'A draft is already open on this day. Reload to see it.' } as never)
    draw([PEAK], CONTROLS)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0])
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect((await screen.findByRole('alert')).textContent).toContain('A draft is already open on this day')
    expect(refresh).not.toHaveBeenCalled()
  })

  test('Edit opens the form above the chart, fixed to that day and filled with the draft', () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } } }], CONTROLS)
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    expect((screen.getByLabelText('Note text') as HTMLInputElement).value).toBe('New')
    const day = screen.getByLabelText('Day') as HTMLSelectElement
    expect(day.value).toBe('2026-08-10')
    expect(day.disabled).toBe(true)
    expect(screen.getByRole('group', { name: 'Note' }).closest('li')).toBeNull()
  })

  test('an approver gets Approve on a draft and Revoke on an approved note; an editor gets neither', async () => {
    const ed = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } }
    const approver = draw([{ ...PEAK, note: 'Old', noteEditor: ed }], CONTROLS)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'did', { text: 'New', postIds: [] }))
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
    approver.unmount()

    draw([{ ...PEAK, note: 'Old', noteEditor: ed }], { ...CONTROLS, canApprove: false })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })
})

describe('on a wide screen: option B, cards pinned to their dots', () => {
  // The test DOM has no matchMedia, so a chart renders the row by default; these stub a wide screen.
  const real = window.matchMedia
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  })
  afterEach(() => { window.matchMedia = real })
  const cardOf = (i: number) => render(<>{chart().pins![i].content}</>).container

  test('a client gets every callout they may see pinned to its dot, no row and no buttons', () => {
    draw([PEAK, QUIET({ note: 'Event' })])
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', false], ['2026-08-14', false]])
    expect(chart().pinHeight).toBeUndefined()
    expect(screen.queryByRole('list', { name: 'Annotations' })).toBeNull()
    expect(cardOf(0).querySelector('button')).toBeNull()
  })

  test('a pinned card shows the date and number, and the note on its own line', () => {
    draw([{ ...PEAK, note: 'JOL Fortune Cookie' }])
    const card = cardOf(0)
    expect(within(card).getByText('8/10 | 50 Engagements')).not.toBe(within(card).getByText('JOL Fortune Cookie'))
  })

  test("the team's buttons are on each pinned card, and team cards are taller to fit them", () => {
    draw([PEAK], CONTROLS, HIDES)
    const card = cardOf(0)
    expect(within(card).getByRole('button', { name: 'Hide from client' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Add note' })).toBeTruthy()
    expect(chart().pinHeight).toBe(PIN_TEAM_CARD_HEIGHT)
  })

  test('the team also gets its hidden and draft cards pinned, faded and never printed, with no dot', () => {
    draw([PEAK, QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', label: '8/22', note: 'Hidden one', hidden: true })], CONTROLS, HIDES)
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', false], ['2026-08-20', true], ['2026-08-22', true]])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }])
  })

  test('Hide on a pinned card fades it, takes its dot at once, and makes one call', async () => {
    draw([PEAK], CONTROLS, HIDES)
    fireEvent.click(within(cardOf(0)).getByRole('button', { name: 'Hide from client' }))
    expect(chart().marks).toEqual([])
    expect(chart().pins?.map((p) => [p.x, !!p.muted])).toEqual([['2026-08-10', true]])
    await waitFor(() => expect(setAnnotationHiddenAction).toHaveBeenCalledWith({ ...HIDES, day: '2026-08-10', hidden: true }))
  })

  test('a callout whose day has no point goes in the row above the chart, since it has no dot', () => {
    draw([PEAK, QUIET({ date: '2026-08-31', label: '8/31', note: 'Late' })])
    expect(chart().pins?.map((p) => p.x)).toEqual(['2026-08-10'])
    expect(screen.getByText('Late')).toBeTruthy()
  })

  test('the Annotations button takes the pinned cards away too', () => {
    draw([PEAK])
    fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
    expect(chart().pins).toBeUndefined()
  })
})

// Found in the Task 10 review, measured in Chromium with the app's own CSS: beside the buttons the
// text column (flex-1, a zero starting width) shrank to a few pixels, and a pinned team card clipped
// its buttons. The buttons belong on their own row under the picture and the text.
describe("the team's buttons sit on their own row, so the date, number and note keep their width", () => {
  const ED = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'Went live Tuesday', postIds: [] } }
  const real = window.matchMedia
  afterEach(() => { window.matchMedia = real })
  const wide = () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  }

  test('in the row, every button of a card shares one full-width row that never prints', () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: ED }], CONTROLS, HIDES)
    const buttons = screen.getAllByRole('button').filter((b) => b.closest('li'))
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Hide from client', 'Edit note', 'Approve', 'Revoke', 'Delete draft'])
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.tagName).not.toBe('LI')
    expect(row.className).toContain('basis-full')
    expect(row.className).toContain('no-print')
    expect(screen.getByText('Draft: Went live Tuesday').className).not.toContain('line-clamp')
  })

  test('on a pinned card, the same row, and the draft line is cut to one line (the form shows it whole)', () => {
    wide()
    draw([{ ...PEAK, note: 'Old', noteEditor: ED }], CONTROLS, HIDES)
    const card = render(<>{chart().pins![0].content}</>).container
    const buttons = [...card.querySelectorAll('button')]
    expect(buttons).toHaveLength(5)
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.className).toContain('basis-full')
    expect(within(card).getByText('Draft: Went live Tuesday').className).toContain('line-clamp-1')
  })

  test("a client's card has no buttons row at all", () => {
    const { container } = draw([{ ...PEAK, note: 'Event' }])
    expect(container.querySelector('.basis-full')).toBeNull()
  })
})
