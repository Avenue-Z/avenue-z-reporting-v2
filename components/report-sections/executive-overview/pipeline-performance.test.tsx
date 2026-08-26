import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelinePerformance } from './pipeline-performance'
import type { PipelineData } from '@/lib/salesforce/types'

/** Healthy baseline. Every figure is distinct so a getByText assertion cannot
 *  pass by coincidence: the parent plan's fixture reused 131 twice. */
function data(over: Partial<PipelineData> = {}): PipelineData {
  return {
    openDeals:        { value: 297 },
    totalPipeline:    { value: 4_820_000 },
    closedWon:        { value: 1_375_000, delta: 15.7 },
    weightedPipeline: { value: 2_140_000 },
    byOwner: [
      { owner: 'Dana Reyes', count: 41, amount: 900_000 },
      { owner: 'Sam Okonkwo', count: 18, amount: 410_000 },
    ],
    ownersTruncated: false,
    stageTruncated: false,
    unrecognizedClosedFlags: 0,
    wonStageUnmatched: false,
    openUnavailable: false,
    wonUnavailable: false,
    ...over,
  }
}

describe('healthy render', () => {
  it('formats all four tile values', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('297')).toBeInTheDocument()
    expect(screen.getByText('$4,820,000')).toBeInTheDocument()
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.getByText('$2,140,000')).toBeInTheDocument()
  })

  it('renders Closed Won\'s delta with its year-over-year label', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
  })

  it('renders the owner list in the order given, with counts', () => {
    render(<PipelinePerformance data={data()} />)
    const owners = screen.getAllByTestId('owner-row').map((n) => n.textContent)
    expect(owners[0]).toContain('Dana Reyes')
    expect(owners[0]).toContain('41')
    expect(owners[1]).toContain('Sam Okonkwo')
  })

  it('renders no caveat lines when nothing is degraded', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.queryByTestId('caveat')).not.toBeInTheDocument()
  })
})

describe('openUnavailable', () => {
  it('dashes the three open tiles instead of showing $0, and leaves Closed Won alone', () => {
    render(<PipelinePerformance data={data({
      openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 },
      openUnavailable: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getAllByText("Couldn't load open pipeline.")).toHaveLength(3)
    // Closed Won comes from a separate query with its own flag.
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
  })
})

describe('wonUnavailable', () => {
  it('dashes Closed Won and suppresses the fabricated -100 delta', () => {
    // The regression test. closedWon.delta is -100 whenever the current fetch
    // degraded to 0 against a healthy prior year.
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
  })

  it('takes comparisonExpected off too: an unloadable tile promises nothing', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/vs same period last year/)).not.toBeInTheDocument()
  })
})

describe('wonStageUnmatched', () => {
  it('dashes the value rather than publishing a plausible $0, and keeps the placeholder', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonStageUnmatched: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/won stage.*renamed/i)).toBeInTheDocument()
  })

  it('yields to wonUnavailable when both are set', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0 }, wonUnavailable: true, wonStageUnmatched: true,
    })} />)
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    expect(screen.queryByText(/won stage.*renamed/i)).not.toBeInTheDocument()
  })
})

describe('baseline-corrupting flags suppress the delta but keep the value', () => {
  it('stageTruncated: value stays, delta goes, placeholder and caveat render', () => {
    // The flag ORs in wonPriorRows.length >= STAGE_MAX_ROWS (pipeline.ts:296-299),
    // so a truncated baseline inflates the growth percentage without bound.
    render(<PipelinePerformance data={data({ stageTruncated: true })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/row limit/i)).toBeInTheDocument()
  })

  it('unrecognizedClosedFlags: same treatment, and the caveat names the owner breakdown too', () => {
    // countUnrecognizedClosed includes ownerRows (pipeline.ts:295) and
    // transformByOwner drops unreadable rows (pipeline.ts:208), so a caveat
    // naming only "these totals" would leave the distorted list uncaveated.
    render(<PipelinePerformance data={data({ unrecognizedClosedFlags: 3 })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    const caveat = screen.getByText(/unreadable open\/closed status/i)
    expect(caveat.textContent).toMatch(/3 rows/)
    expect(caveat.textContent).toMatch(/owner breakdown/i)
    // Rows, never deals: the open and won windows overlap, so one bad deal
    // can contribute more than once.
    expect(caveat.textContent).not.toMatch(/deals/i)
  })
})

describe('suppression that must not spread', () => {
  it('ownersTruncated keeps Closed Won\'s delta and adds no caveat to the grid', () => {
    render(<PipelinePerformance data={data({ ownersTruncated: true })} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText('Owner list may be incomplete.')).toBeInTheDocument()
    expect(screen.queryByText(/row limit/i)).not.toBeInTheDocument()
  })
})

describe('owner list, three distinct states', () => {
  it('null renders a fetch failure, never "no owners"', () => {
    render(<PipelinePerformance data={data({ byOwner: null })} />)
    expect(screen.getByText('Owner breakdown unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No open deals by owner.')).not.toBeInTheDocument()
  })

  it('[] renders a genuine empty, distinct from the failure copy', () => {
    render(<PipelinePerformance data={data({ byOwner: [] })} />)
    expect(screen.getByText('No open deals by owner.')).toBeInTheDocument()
    expect(screen.queryByText('Owner breakdown unavailable.')).not.toBeInTheDocument()
  })

  it('every owner at zero produces a finite width, never NaN%', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: [{ owner: 'Dana Reyes', count: 0, amount: 0 }],
    })} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('window labels', () => {
  it('names each window on the section line and per tile', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('Open pipeline is as of today. Closed won is year to date.')).toBeInTheDocument()
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
    expect(screen.getByText('Year to date')).toBeInTheDocument()
  })

  it('a tile caveat replaces that tile\'s window label rather than joining it', () => {
    render(<PipelinePerformance data={data({ wonUnavailable: true })} />)
    expect(screen.queryByText('Year to date')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    // The three open tiles keep theirs: this flag does not touch them.
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
  })
})

describe('vendor neutrality', () => {
  it('names no CRM vendor', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: null, ownersTruncated: true, stageTruncated: true,
      unrecognizedClosedFlags: 2, wonStageUnmatched: true,
      openUnavailable: true, wonUnavailable: true,
    })} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/i)
  })
})
