// Round 3 of the design overhaul (plan docs/superpowers/plans/2026-11-24-os-design-round3.md, Tasks 1 to 5): the graph
// controls, the note and card buttons, the note fields, the YTD notes and the designation toggle take the kit's styles
// under the kit look only, and do exactly what they did. Without the look every one must render exactly as before, for
// every client still on the old versions (Renaissance included) and every month before a client's designFrom. The
// snapshots were recorded from `dev` (3edb02d7) before any round 3 change.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is a stub that records its props (as chart-notes-ui.test.tsx).
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })), setDesignationAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/actions/chart-notes', () => ({
  saveChartNoteAction: vi.fn(async () => ({ ok: true })), approveChartNoteAction: vi.fn(async () => ({ ok: true })),
  revokeChartNoteAction: vi.fn(async () => ({ ok: true })), deleteChartNoteDraftAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { LineChart } from '@/components/charts/line-chart'
import { ChannelTrendChart } from './trends'
import { YtdNotesPanel } from './ytd-notes-panel'
import { DesignationToggle } from './designation-toggle'
import type { AnnotationControls, ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { YtdGraphNotes } from './parts/ytd-notes'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction } from '@/app/actions/chart-notes'
import { setAnnotationHiddenAction, setDesignationAction } from '@/app/actions/organic-social'
import { cardButton, field, noteBox, noteButton } from './control-look'
import { CARD_PILL, PILL } from './pill'
import kit from './design/kit.module.css'

// Every value is invented.
const SERIES: TrendSeries = {
  channels: ['Instagram', 'Facebook'],
  points: ['2026-08-10', '2026-08-14', '2026-08-20'].map((date) => ({ date, Instagram: 5, Facebook: 3 })),
}
const DRAFT = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } }
const APPROVED = { approvedId: 'a', approvedPostIds: [], draft: null }
const ANNOTATIONS: ChartAnnotation[] = [
  { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', hidden: false, thumb: null, note: 'Went live', noteEditor: APPROVED },
  { date: '2026-08-14', value: 2, label: '8/14', hidden: false, thumb: null, noteOnly: true, noteEditor: DRAFT },
  { date: '2026-08-20', value: 40, label: '8/20 | 40 Engagements', hidden: true, thumb: null },
  // Off the series: drawn in the row above the chart, not from a dot.
  { date: '2026-08-31', value: 9, label: '8/31', hidden: false, thumb: null, noteOnly: true, noteEditor: DRAFT },
]
const NOTES: NoteControls = {
  clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', canApprove: true,
  days: [{ day: '2026-08-10', posts: [] }, { day: '2026-08-14', posts: [] }, { day: '2026-08-20', posts: [] }],
}
const HIDES: AnnotationControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements' }
const YTD_NOTES: YtdGraphNotes = {
  notes: { Aug: 'Approved August' }, marks: [{ x: 'Aug' }],
  panel: [
    { key: '2026-07', label: 'Jul', text: null, editor: DRAFT },
    { key: '2026-08', label: 'Aug', text: 'Approved August', editor: APPROVED },
  ],
  controls: { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'ytd-followers', canApprove: true, months: [{ key: '2026-07', label: 'Jul' }, { key: '2026-08', label: 'Aug' }] },
}

const chartProps = () => vi.mocked(LineChart).mock.lastCall![0]
const cards = () => render(<>{chartProps().callouts!.map((c) => <div key={c.x}>{c.content}</div>)}</>).container.innerHTML

beforeEach(() => vi.clearAllMocks())

describe('without the kit look, every control renders exactly as on dev before round 3', () => {
  test('a trend graph: channel toggles, the Annotations toggle, Add annotation and the row above the chart', () => {
    const { container } = render(<ChannelTrendChart title="T" series={SERIES} annotations={ANNOTATIONS} noteControls={NOTES} annotationControls={HIDES} />)
    expect(container.innerHTML).toMatchSnapshot()
  })
  test('the cards opened from the dots (Hide, Edit, Approve, Revoke, Delete)', () => {
    render(<ChannelTrendChart title="T" series={SERIES} annotations={ANNOTATIONS} noteControls={NOTES} annotationControls={HIDES} />)
    expect(cards()).toMatchSnapshot()
  })
  test('the Add annotation form (day select, text field, Save draft, Cancel)', () => {
    const { container } = render(<ChannelTrendChart title="T" series={SERIES} annotations={ANNOTATIONS} noteControls={NOTES} annotationControls={HIDES} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
    expect(container.innerHTML).toMatchSnapshot()
  })
  test('the YTD notes panel for an approver, closed and with the month form open', () => {
    const { container } = render(<YtdNotesPanel notes={YTD_NOTES} title="Follower Growth, Year to Date" />)
    expect(container.innerHTML).toMatchSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
    expect(container.innerHTML).toMatchSnapshot()
  })
  test('the designation toggle', () => {
    expect(render(<DesignationToggle clientSlug="a-client" postId={1} value="organic" />).container.innerHTML).toMatchSnapshot()
  })
})

const button = (c: HTMLElement, name: string) => within(c).getByRole('button', { name })
/** Every call to the note and hide actions so far, to compare the old look's clicks with the kit's. */
const actionCalls = () => JSON.stringify([setAnnotationHiddenAction, approveChartNoteAction, revokeChartNoteAction, deleteChartNoteDraftAction].map((f) => vi.mocked(f).mock.calls))

describe('the class choices (control-look.ts)', () => {
  test('without the look, each is today\'s exact string', () => {
    expect(noteButton(undefined)).toBe(PILL)
    expect(cardButton(undefined)).toBe(CARD_PILL)
    expect(field(undefined, 'old classes')).toBe('old classes')
    expect(noteBox(undefined, 'no-print ')).toBe('no-print w-full space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3')
    expect(noteBox(undefined, '')).toBe('w-full space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3')
  })
  test('with the look, the kit\'s button and field, and a card button still never prints or wraps', () => {
    expect(noteButton('kit')).toBe(kit.tbtn)
    expect(cardButton('kit')).toBe(`no-print whitespace-nowrap ${kit.tbtn}`)
    expect(field('kit', 'old classes')).toBe(`${kit.field} px-2 py-1 text-xs`)
  })
})

describe('with the kit look (a shaded chart, which only the kit versions draw)', () => {
  const kitChart = () => render(<ChannelTrendChart title="T" series={SERIES} annotations={ANNOTATIONS} noteControls={NOTES} annotationControls={HIDES} shaded frameless />)

  test('the channel toggles are kit pills that say whether they are on, and still toggle the line', () => {
    const { container } = kitChart()
    for (const name of ['Instagram', 'Facebook']) {
      const b = button(container, name)
      expect(b.className).toBe(kit.pill)
      expect(b.getAttribute('aria-pressed')).toBe('true')
    }
    fireEvent.click(button(container, 'Facebook'))
    expect(button(container, 'Facebook').getAttribute('aria-pressed')).toBe('false')
    expect(chartProps().yKeys.map((k) => k.key)).toEqual(['Instagram'])
  })
  test('the Annotations toggle and Add annotation are kit pills; Add annotation still never prints', () => {
    const { container } = kitChart()
    expect(button(container, 'Annotations').className).toBe(kit.pill)
    expect(button(container, 'Add annotation').className).toBe(`no-print ${kit.pill}`)
    fireEvent.click(button(container, 'Annotations'))
    expect(button(container, 'Annotations').getAttribute('aria-pressed')).toBe('false')
    expect(chartProps().callouts).toBeUndefined()
  })
  test('the note form: kit buttons and fields, its box on the kit colours, still never printed', () => {
    const { container } = kitChart()
    fireEvent.click(button(container, 'Add annotation'))
    const form = within(container).getByRole('group', { name: 'Note' })
    expect(form.className).toBe('no-print w-full space-y-2 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-3')
    expect(button(form, 'Save draft').className).toBe(kit.tbtn)
    expect(button(form, 'Cancel').className).toBe(kit.tbtn)
    expect(within(form).getByRole('textbox', { name: 'Note text' }).className).toBe(`${kit.field} px-2 py-1 text-xs min-w-[12rem] flex-1`)
    expect(within(form).getByRole('combobox').className).toBe(`${kit.field} px-2 py-1 text-xs`)
    fireEvent.click(button(form, 'Cancel'))
    expect(within(container).queryByRole('group', { name: 'Note' })).toBeNull()
  })
  test('every card button (on a dot\'s card and in the row above the chart) is the kit\'s, never printed, never wrapped', () => {
    const { container } = kitChart()
    const card = render(<>{chartProps().callouts!.map((c) => <div key={c.x}>{c.content}</div>)}</>).container
    const buttons = [...card.querySelectorAll('button'), ...within(container).getByRole('list', { name: 'Annotations' }).querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(5)
    for (const b of buttons) expect(b.className, b.textContent ?? '').toBe(`no-print whitespace-nowrap ${kit.tbtn}`)
  })
  test('the card buttons do exactly what they do today', () => {
    const clickAll = (node: HTMLElement) => {
      const card = render(<>{chartProps().callouts!.map((c) => <div key={c.x}>{c.content}</div>)}</>).container
      for (const name of ['Hide from client', 'Unhide', 'Approve', 'Revoke', 'Delete draft']) for (const b of within(card).queryAllByRole('button', { name })) fireEvent.click(b)
      return node
    }
    clickAll(render(<ChannelTrendChart title="T" series={SERIES} annotations={ANNOTATIONS} noteControls={NOTES} annotationControls={HIDES} />).container)
    const old = actionCalls()
    vi.clearAllMocks()
    clickAll(kitChart().container)
    expect(actionCalls()).toBe(old)
    expect(old).not.toBe(JSON.stringify([[], [], [], []]))
  })
})

describe('the YTD notes with the kit look', () => {
  test('Add annotation is a kit pill, each row\'s buttons the kit\'s, and the month form kit buttons and fields', () => {
    const { container } = render(<YtdNotesPanel notes={YTD_NOTES} title="Follower Growth, Year to Date" look="kit" />)
    expect(button(container, 'Add annotation').className).toBe(kit.pill)
    const rows = within(container).getByRole('list', { name: 'Notes on Follower Growth, Year to Date' })
    const rowButtons = [...rows.querySelectorAll('button')]
    expect(rowButtons.length).toBeGreaterThan(2)
    for (const b of rowButtons) expect(b.className, b.textContent ?? '').toBe(`no-print whitespace-nowrap ${kit.tbtn}`)
    fireEvent.click(button(container, 'Add annotation'))
    const form = within(container).getByRole('group', { name: 'Note' })
    expect(form.className).toBe('w-full space-y-2 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-3')
    expect(button(form, 'Save draft').className).toBe(kit.tbtn)
    expect(button(form, 'Cancel').className).toBe(kit.tbtn)
    expect(within(form).getByRole('textbox', { name: 'Note text' }).className).toBe(`${kit.field} px-2 py-1 text-xs min-w-[12rem] flex-1`)
    expect(within(form).getByRole('combobox').className).toBe(`${kit.field} px-2 py-1 text-xs`)
  })
  test('the row buttons do exactly what they do today', () => {
    const clickAll = (c: HTMLElement) => { for (const name of ['Approve', 'Revoke', 'Delete draft']) for (const b of within(c).queryAllByRole('button', { name })) fireEvent.click(b) }
    clickAll(render(<YtdNotesPanel notes={YTD_NOTES} title="Y" />).container)
    const old = actionCalls()
    vi.clearAllMocks()
    clickAll(render(<YtdNotesPanel notes={YTD_NOTES} title="Y" look="kit" />).container)
    expect(actionCalls()).toBe(old)
    expect(old).not.toBe(JSON.stringify([[], [], [], []]))
  })
})

describe('the designation toggle with the kit look', () => {
  test('is the kit\'s button, never wrapped, and sets the same designation', async () => {
    const { container } = render(<DesignationToggle clientSlug="a-client" postId={1} value="organic" look="kit" />)
    const b = container.querySelector('button')!
    expect(b.className).toBe(`whitespace-nowrap ${kit.tbtn}`)
    fireEvent.click(b)
    expect(setDesignationAction).toHaveBeenCalledWith({ clientSlug: 'a-client', postId: 1, designation: 'influencer' })
  })
})
