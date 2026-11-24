// Round 3 of the design overhaul (plan docs/superpowers/plans/2026-11-24-os-design-round3.md): the graph controls, the
// note and card buttons, the note fields, the YTD notes and the designation toggle take the kit's styles under the kit
// look only. Without it every one must render exactly as before, for every client still on the old versions
// (Renaissance included) and every month before a client's designFrom. These snapshots were recorded from `dev`
// (3edb02d7) before any round 3 change.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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
